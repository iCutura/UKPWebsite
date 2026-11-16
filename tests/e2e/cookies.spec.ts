import { test, expect, type Page } from '@playwright/test';
import { open } from './support';

/**
 * The bar exists for one promise: nothing reaches Meta or Google before the visitor says so. That
 * promise is a network fact, so these tests count requests rather than reading the markup, and both
 * scripts are stubbed so a test run never actually contacts Facebook or Google.
 */
const PIXEL = /connect\.facebook\.net/;
const GTM = /googletagmanager\.com/;

async function watch(page: Page, url: RegExp): Promise<string[]> {
  const hits: string[] = [];
  await page.route(url, route => {
    hits.push(route.request().url());
    return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
  });
  return hits;
}
/** Every request to either tag, so one assertion covers both. */
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

/** The data layer, flattened: a gtag() command (an Arguments object) reads as its words, an event as its name. */
const dataLayer = (page: Page) => page.evaluate(() => {
  const dl = (window as unknown as { dataLayer?: unknown[] }).dataLayer ?? [];
  return dl.map(m => {
    if (m && typeof m === 'object' && !Array.isArray(m) && 'event' in m) return `event ${(m as { event: string }).event}`;
    const a = Array.from(m as ArrayLike<unknown>);
    return a.map(x => typeof x === 'object' ? JSON.stringify(x) : String(x)).join(' ');
  });
});

const stored = (page: Page) => page.evaluate(() => {
  const raw = localStorage.getItem('ukp-consent');
  return raw ? JSON.parse(raw) : null;
});

const bar = '[data-cookie-consent]';

test.describe('the cookie bar', () => {
  test('appears on a first visit and offers both answers the same way', async ({ page }) => {
    await open(page, '/');
    await expect(page.locator(bar)).toBeVisible();

    const reject = page.locator('[data-cc-panel="banner"] [data-cc-reject]');
    const accept = page.locator('[data-cc-panel="banner"] [data-cc-accept]');
    const [r, a] = [await reject.boundingBox(), await accept.boundingBox()];
    // Equal geometry is not enough on its own, but unequal geometry is enough to fail: a refusal
    // must never be the smaller or the quieter of the two.
    expect(Math.abs(r!.width - a!.width), 'the two buttons are different widths').toBeLessThanOrEqual(1);
    expect(Math.abs(r!.height - a!.height), 'the two buttons are different heights').toBeLessThanOrEqual(1);
    const fill = (sel: string) => page.locator(sel).evaluate(el => getComputedStyle(el).backgroundColor);
    expect(await fill('[data-cc-panel="banner"] [data-cc-reject]')).toBe(await fill('[data-cc-panel="banner"] [data-cc-accept]'));
  });

  test('does not wall off the page it sits on', async ({ page }) => {
    await open(page, '/');
    const box = (await page.locator(bar).boundingBox())!;
    const h = page.viewportSize()!.height;
    expect(box.height / h, 'the bar covers most of the screen').toBeLessThan(0.6);
    // No dimming layer, and the page still scrolls.
    const locked = await page.evaluate(() => getComputedStyle(document.body).overflow === 'hidden');
    expect(locked).toBe(false);
  });

  test('does not sit on top of the footer it covers', async ({ page }) => {
    await open(page, '/kolacici/');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(250);

    const legal = (await page.locator('.footer-bottom').boundingBox())!;
    const card = (await page.locator('[data-cc-card]').boundingBox())!;
    // The footer reserves the bar's height, so its last line stays above it rather than behind it.
    expect(legal.y + legal.height, 'the footer legal line is behind the bar').toBeLessThanOrEqual(card.y + 1);
  });

  test('sends nothing to Meta or Google before a decision', async ({ page }) => {
    const hits = await watchPixel(page);
    await open(page, '/');
    await page.waitForTimeout(1200);
    expect(hits, 'a marketing tag loaded before anyone was asked').toEqual([]);
    expect(await dataLayer(page), 'the data layer exists before anyone was asked').toEqual([]);
  });

  test('refusing keeps it that way, and the bar does not come back', async ({ page }) => {
    const hits = await watchPixel(page);
    await open(page, '/');
    await page.locator('[data-cc-panel="banner"] [data-cc-reject]').click();

    await expect(page.locator(bar)).toBeHidden();
    expect(await stored(page)).toMatchObject({ marketing: false });

    await open(page, '/lokacije/');
    await expect(page.locator(bar)).toBeHidden();
    await page.waitForTimeout(800);
    expect(hits, 'a marketing tag loaded after a refusal').toEqual([]);
  });

  test('accepting loads the pixel and remembers the answer', async ({ page }) => {
    const hits = await watchPixel(page);
    await open(page, '/');
    await page.locator('[data-cc-panel="banner"] [data-cc-accept]').click();

    await expect(page.locator(bar)).toBeHidden();
    expect(await stored(page)).toMatchObject({ marketing: true });
    await expect.poll(() => hits.length, { timeout: 5000 }).toBeGreaterThan(0);
  });

  test('accepting loads Tag Manager with consent already granted for ads only', async ({ page }) => {
    const gtm = await watch(page, GTM);
    await watch(page, PIXEL);
    await open(page, '/');
    await page.locator('[data-cc-panel="banner"] [data-cc-accept]').click();

    await expect.poll(() => gtm.length, { timeout: 5000 }).toBeGreaterThan(0);
    expect(gtm[0]).toContain('gtm.js?id=GTM-');

    const dl = await dataLayer(page);
    const def = dl.findIndex(l => l.startsWith('consent default'));
    const upd = dl.findIndex(l => l.startsWith('consent update'));
    const start = dl.indexOf('event gtm.js');
    // Consent Mode is told the answer before the container starts, or Google Ads records an
    // unconsented conversion.
    expect(def, 'no consent default').toBeGreaterThanOrEqual(0);
    expect(upd, 'no consent update').toBeGreaterThan(def);
    expect(start, 'the container started before consent was set').toBeGreaterThan(upd);
    for (const k of ['ad_storage', 'ad_user_data', 'ad_personalization', 'analytics_storage']) {
      expect(dl[def]).toContain(`"${k}":"denied"`);
    }
    for (const k of ['ad_storage', 'ad_user_data', 'ad_personalization']) {
      expect(dl[upd]).toContain(`"${k}":"granted"`);
    }
    // The site asks for no analytics category, so analytics stays off whatever the container holds.
    expect(dl[upd]).toContain('"analytics_storage":"denied"');
    expect(dl).toContain('event virtual_page_view');
  });

  test('every page view reaches the container, not only the first', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('ukp-consent', JSON.stringify({ v: 2, marketing: true, t: Date.now() }));
    });
    await watchPixel(page);
    await open(page, '/');
    await expect.poll(async () => (await dataLayer(page)).filter(l => l === 'event virtual_page_view').length).toBe(1);

    // ClientRouter swaps the document without a reload; the container's own page view would miss it.
    await page.locator('a[href="/lokacije/"]:visible').first().click();
    await page.waitForURL('**/lokacije/');
    await expect.poll(async () => (await dataLayer(page)).filter(l => l === 'event virtual_page_view').length).toBe(2);
    const paths = await page.evaluate(() => ((window as unknown as { dataLayer: { event?: string; page_path?: string }[] }).dataLayer)
      .filter(m => m.event === 'virtual_page_view').map(m => m.page_path));
    expect(paths).toEqual(['/', '/lokacije/']);
  });

  test('withdrawing deletes the Google Ads cookies and stops loading the container', async ({ page }) => {
    const gtm = await watch(page, GTM);
    await watch(page, PIXEL);
    await open(page, '/kolacici/');
    await page.locator('[data-cc-panel="banner"] [data-cc-accept]').click();
    await expect.poll(() => gtm.length, { timeout: 5000 }).toBeGreaterThan(0);
    // The stub sets nothing, so plant what the real conversion linker would have written.
    await page.evaluate(() => { document.cookie = '_gcl_au=1.1.123.456; path=/'; document.cookie = '_gcl_aw=GCL.1.abc; path=/'; });

    await page.locator('footer [data-cookie-settings]').click();
    await expect(page.locator('[data-cc-marketing]')).toBeChecked();
    await page.locator('[data-cc-marketing]').click();
    const reloaded = page.waitForEvent('load');
    await page.locator('[data-cc-save]').click();
    await reloaded;

    const cookies = (await page.context().cookies()).map(c => c.name);
    expect(cookies).not.toContain('_gcl_au');
    expect(cookies).not.toContain('_gcl_aw');
    const before = gtm.length;
    await page.waitForTimeout(800);
    expect(gtm.length, 'the container loaded again after withdrawal').toBe(before);
    expect(await stored(page)).toMatchObject({ marketing: false });
  });

  test('the panel starts with marketing off and saves what it is set to', async ({ page }) => {
    const hits = await watchPixel(page);
    await open(page, '/');
    await page.locator('[data-cc-open]').click();

    const marketing = page.locator('[data-cc-marketing]');
    await expect(page.locator('[data-cc-panel="prefs"]')).toBeVisible();
    await expect(marketing).not.toBeChecked();
    // Saving with the switch untouched is a refusal, which is the point of an unticked default.
    await marketing.click();
    await expect(marketing).toBeChecked();
    await page.locator('[data-cc-save]').click();

    expect(await stored(page)).toMatchObject({ marketing: true });
    await expect.poll(() => hits.length, { timeout: 5000 }).toBeGreaterThan(0);
  });

  test('the footer button brings the panel back after a decision', async ({ page }) => {
    await open(page, '/kolacici/');
    await page.locator('[data-cc-panel="banner"] [data-cc-reject]').click();
    await expect(page.locator(bar)).toBeHidden();

    await page.locator('footer [data-cookie-settings]').click();
    await expect(page.locator('[data-cc-panel="prefs"]')).toBeVisible();
    await expect(page.locator('[data-cc-marketing]')).not.toBeChecked();
  });

  test('asks again once a stored decision has lapsed', async ({ page }) => {
    await page.addInitScript(() => {
      const twoYearsAgo = Date.now() - 730 * 864e5;
      localStorage.setItem('ukp-consent', JSON.stringify({ v: 2, marketing: true, t: twoYearsAgo }));
    });
    const hits = await watchPixel(page);
    await open(page, '/');
    await expect(page.locator(bar)).toBeVisible();
    // And a lapsed pristanak is not a pristanak: nothing loads while the question stands.
    await page.waitForTimeout(800);
    expect(hits).toEqual([]);
  });

  test('asks again everyone who answered before Google Ads was on the list', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('ukp-consent', JSON.stringify({ v: 1, marketing: true, t: Date.now() }));
    });
    const hits = await watchPixel(page);
    await open(page, '/');
    await expect(page.locator(bar)).toBeVisible();
    await page.waitForTimeout(800);
    expect(hits, 'a pristanak for Meta alone loaded a tag').toEqual([]);
  });
});
