import { test, expect, type Page } from '@playwright/test';
import { open } from './support';

/**
 * /app is the only page on the site whose layout and language depend on who is looking, which makes
 * it the only page where "it works on my machine" is worth nothing. Each behaviour is pinned to the
 * browser it is meant for.
 */
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36';
const PIXEL = /connect\.facebook\.net/;
const GTM = /googletagmanager\.com/;

/**
 * Stub the pixel and Tag Manager so a test never contacts Meta or Google, and keep every fbq() call
 * readable in fbq.queue (and every data layer message in dataLayer). Hits count both.
 */
async function watchPixel(page: Page): Promise<string[]> {
  const hits: string[] = [];
  for (const url of [PIXEL, GTM]) {
    await page.route(url, route => {
      hits.push(route.request().url());
      return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
    });
  }
  return hits;
}

/** The Custom Events pushed to the data layer. */
const events = (page: Page) => page.evaluate(() =>
  ((window as unknown as { dataLayer?: { event?: string }[] }).dataLayer ?? []).map(m => m?.event).filter(Boolean));

/** Every fbq() call the page made. With the stub in place nothing sets callMethod, so all of them stay queued. */
const calls = (page: Page) => page.evaluate(() => {
  const q = (window as unknown as { fbq?: { queue?: unknown[] } }).fbq?.queue ?? [];
  return q.map(args => Array.from(args as ArrayLike<unknown>).slice(0, 2).map(String).join(' '));
});

const box = async (page: Page, store: 'ios' | 'android') =>
  (await page.locator(`[data-store-badge="${store}"]`).boundingBox())!;

/**
 * Let the badge be clicked without leaving the page. A capture-phase preventDefault cancels the
 * navigation only: the page's own click listener still runs, which is the thing under test. Letting
 * the real `target="_blank"` open was flaky on the phone project, where the aborted navigation
 * sometimes took the whole context with it.
 */
const blockStoreNavigation = (page: Page) => page.addInitScript(() => {
  document.addEventListener('click', ev => {
    if ((ev.target as HTMLElement)?.closest?.('a[data-store-badge]')) ev.preventDefault();
  }, true);
});

const accept = async (page: Page) => {
  await page.locator('[data-cc-panel="banner"] [data-cc-accept]').click();
  await expect(page.locator('[data-cookie-consent]')).toBeHidden();
};

test.describe('the campaign landing page', () => {
  test('carries no navigation and no footer, only the way home and the legal links', async ({ page }) => {
    await open(page, '/app/');
    await expect(page.locator('header.header')).toHaveCount(0);
    await expect(page.locator('footer.footer')).toHaveCount(0);
    await expect(page.locator('nav')).toHaveCount(0);

    await expect(page.locator('.app-brand')).toHaveAttribute('href', 'https://kvizovi.hr');
    await expect(page.locator('.app-legal a[href="/pravila-privatnosti/"]')).toBeVisible();
    await expect(page.locator('.app-legal a[href="/kolacici/"]')).toBeVisible();
  });

  /**
   * The bar is fixed and the page is exactly one screen tall, so before the space reservation the
   * bar sat on top of the whole legal row. On the one page where the privacy link is the only legal
   * text there is, unreachable is not an option.
   */
  test('keeps the legal row out from under the cookie bar', async ({ page }) => {
    await open(page, '/app/');
    await expect(page.locator('[data-cookie-consent]')).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(250);

    const legal = (await page.locator('.app-legal').boundingBox())!;
    const bar = (await page.locator('[data-cc-card]').boundingBox())!;
    expect(legal.y + legal.height, 'the legal row is underneath the cookie bar').toBeLessThanOrEqual(bar.y + 1);
    await expect(page.locator('.app-legal a[href="/pravila-privatnosti/"]')).toBeInViewport();
  });

  test('asks not to be indexed', async ({ page }) => {
    await open(page, '/app/');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  });

  test('renders in the site palette rather than the stylesheet default', async ({ page }) => {
    await open(page, '/app/');
    // :root in global.css is spring; a layout that forgets the season boot ships a coral page.
    await expect(page.locator('html')).toHaveAttribute('data-season', 'fall');
  });

  test('keeps both store buttons reachable whatever the device', async ({ page }) => {
    await open(page, '/app/');
    await expect(page.locator('[data-store-badge="ios"]')).toBeVisible();
    await expect(page.locator('[data-store-badge="android"]')).toBeVisible();
  });

  test('uses the stores\' own badge artwork, not a drawing of it', async ({ page }) => {
    await open(page, '/app/');
    // Apple and Google both forbid redrawing their badges, and a lookalike on a page carrying ad
    // spend is the version that gets noticed.
    await expect(page.locator('[data-store-badge="ios"] img[data-lang="hr"]')).toHaveAttribute('src', '/img/store/app-store-hr.svg');
    await expect(page.locator('[data-store-badge="android"] img[data-lang="hr"]')).toHaveAttribute('src', '/img/store/google-play-hr.png');
    // Every badge image actually loaded; a 404 here is an empty box on the landing page.
    const broken = await page.evaluate(() => [...document.querySelectorAll('.badge-img')]
      .filter(i => !(i as HTMLImageElement).complete || (i as HTMLImageElement).naturalWidth === 0)
      .map(i => (i as HTMLImageElement).currentSrc || (i as HTMLImageElement).src));
    expect(broken).toEqual([]);
  });

  test('gives a desktop both stores at the same weight, since it can install neither', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'about the desktop layout');
    await open(page, '/app/');
    await expect(page.locator('html')).toHaveAttribute('data-platform', 'desktop');
    const [ios, android] = [await box(page, 'ios'), await box(page, 'android')];
    expect(ios.height, 'one badge is demoted on a desktop').toBe(android.height);
    // Side by side, not stacked: same row, so neither reads as the primary.
    expect(Math.abs(ios.y - android.y)).toBeLessThanOrEqual(2);
  });
});

test.describe('on an iPhone', () => {
  test.use({ userAgent: IPHONE });

  test('the App Store button comes first, beside Google Play at the same height', async ({ page }) => {
    await open(page, '/app/');
    await expect(page.locator('html')).toHaveAttribute('data-platform', 'ios');
    const [ios, android] = [await box(page, 'ios'), await box(page, 'android')];
    expect(Math.abs(ios.height - android.height), 'the pair is one height').toBeLessThanOrEqual(1);
    expect(Math.abs(ios.y - android.y), 'the pair is one row, not stacked').toBeLessThanOrEqual(2);
    expect(ios.x, 'the visitor\'s own store is not first').toBeLessThan(android.x);
    await expect(page.locator('[data-store-badge="android"]')).toBeVisible();
  });
});

test.describe('on an Android phone', () => {
  test.use({ userAgent: ANDROID });

  test('Google Play comes first, beside the App Store at the same height', async ({ page }) => {
    await open(page, '/app/');
    await expect(page.locator('html')).toHaveAttribute('data-platform', 'android');
    const [ios, android] = [await box(page, 'ios'), await box(page, 'android')];
    expect(Math.abs(ios.height - android.height), 'the pair is one height').toBeLessThanOrEqual(1);
    expect(Math.abs(ios.y - android.y), 'the pair is one row, not stacked').toBeLessThanOrEqual(2);
    expect(android.x, 'the visitor\'s own store is not first').toBeLessThan(ios.x);
    await expect(page.locator('[data-store-badge="ios"]')).toBeVisible();
  });
});

test.describe('in Croatian', () => {
  test.use({ locale: 'hr-HR' });

  test('speaks Croatian, and says so in the lang attribute', async ({ page }) => {
    await open(page, '/app/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'hr');
    // toHaveText on the h1 would read both languages: the one that lost is display:none, not absent.
    await expect(page.locator('h1 [data-lang="hr"]')).toBeVisible();
    await expect(page.locator('h1 [data-lang="en"]')).toBeHidden();
    await expect(page.locator('h1 [data-lang="hr"]')).toHaveText('Svaki dan je kviz dan.');
    await expect(page.locator('.app-sub [data-lang="hr"]')).toContainText('130 lokacija');
  });
});

test.describe('in English', () => {
  test.use({ locale: 'en-GB' });

  test('shows the English badge artwork', async ({ page }) => {
    await open(page, '/app/');
    await expect(page.locator('[data-store-badge="ios"] img[data-lang="en"]')).toBeVisible();
    await expect(page.locator('[data-store-badge="ios"] img[data-lang="hr"]')).toBeHidden();
    await expect(page.locator('[data-store-badge="android"] img[data-lang="en"]')).toBeVisible();
  });

  test('speaks English, and offers only what a visitor abroad can have', async ({ page }) => {
    await open(page, '/app/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('h1 [data-lang="en"]')).toBeVisible();
    await expect(page.locator('h1 [data-lang="hr"]')).toBeHidden();
    await expect(page.locator('h1 [data-lang="en"]')).toHaveText('Every day is quiz day.');
    // No venues, no leagues: neither is reachable from outside Croatia.
    const sub = page.locator('.app-sub [data-lang="en"]');
    await expect(sub).not.toContainText('130');
    await expect(sub).not.toContainText('league');
  });
});

test.describe('the pixel on /app', () => {
  test('stays quiet until the visitor accepts, then reports the visit', async ({ page }) => {
    const hits = await watchPixel(page);
    await open(page, '/app/');
    await page.waitForTimeout(1000);
    expect(hits, 'the pixel loaded on an ad landing page before consent').toEqual([]);

    await accept(page);
    await expect.poll(() => hits.length, { timeout: 5000 }).toBeGreaterThan(0);
    // ViewContent was fired before the pristanak and waited for it, rather than being lost.
    await expect.poll(() => calls(page)).toContain('track ViewContent');
  });

  test('reports which store button was clicked', async ({ page }) => {
    await blockStoreNavigation(page);
    await watchPixel(page);
    await open(page, '/app/');
    await accept(page);

    await page.locator('[data-store-badge="ios"]').click();
    await expect.poll(() => calls(page)).toContain('trackCustom AppStoreClick');
    await expect.poll(() => events(page)).toContain('app_store_click');
  });

  test('reports a Google Play click to Tag Manager under its own name', async ({ page }) => {
    await blockStoreNavigation(page);
    await watchPixel(page);
    await open(page, '/app/');
    await accept(page);

    await page.locator('[data-store-badge="android"]').click();
    await expect.poll(() => events(page)).toContain('google_play_click');
    expect(await events(page)).not.toContain('app_store_click');
  });

  test('does not report a click made before consent', async ({ page }) => {
    await blockStoreNavigation(page);
    const hits = await watchPixel(page);
    await open(page, '/app/');

    // The bar is still up, so the badge is clicked past it on purpose: the store link has to keep
    // working while the question stands, and the event still must not be sent.
    await page.locator('[data-store-badge="android"]').click({ force: true });
    await page.waitForTimeout(600);
    expect(hits, 'a click before consent loaded a marketing tag').toEqual([]);
  });
});

/**
 * Campaign traffic lands inside Facebook's and Instagram's in-app browsers, where the page used to
 * run 250 to 500 px past the fold on every phone (2026-09-29) and hid its screenshot and legal links.
 * It has to fit one screen, from an iPhone SE to a short laptop and a phone on its side.
 */
test.describe('the campaign landing page fits one screen', () => {
  const SIZES: [string, number, number][] = [
    ['iPhone SE', 320, 568], ['small Android', 360, 640], ['iPhone in Safari', 393, 659],
    ['Android in the Facebook browser', 412, 780], ['iPad', 820, 1180],
    ['phone on its side', 844, 390], ['short laptop', 1366, 657], ['desktop', 1440, 900],
  ];
  for (const [name, width, height] of SIZES) {
    test(`${name} (${width}x${height})`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await open(page, '/app/');
      await page.locator('[data-cookie-consent]').evaluate(el => el.remove()).catch(() => {});
      const { sh, sw } = await page.evaluate(() => ({
        sh: document.documentElement.scrollHeight, sw: document.documentElement.scrollWidth,
      }));
      expect(sh, 'no vertical scroll').toBeLessThanOrEqual(height);
      expect(sw, 'no horizontal scroll').toBeLessThanOrEqual(width);
      await expect(page.locator('.app-legal a[href="/kolacici/"]')).toBeInViewport();
    });
  }
});
