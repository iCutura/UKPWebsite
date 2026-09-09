import { test, expect, type Page } from '@playwright/test';
import { open } from './support';

/**
 * The bar exists for one promise: nothing reaches Meta before the visitor says so. That promise is
 * a network fact, so these tests count requests rather than reading the markup, and the pixel is
 * stubbed so a test run never actually contacts Facebook.
 */
const PIXEL = /connect\.facebook\.net/;

async function watchPixel(page: Page): Promise<string[]> {
  const hits: string[] = [];
  await page.route(PIXEL, route => {
    hits.push(route.request().url());
    return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
  });
  return hits;
}

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

  test('sends nothing to Meta before a decision', async ({ page }) => {
    const hits = await watchPixel(page);
    await open(page, '/');
    await page.waitForTimeout(1200);
    expect(hits, 'the pixel loaded before anyone was asked').toEqual([]);
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
    expect(hits, 'the pixel loaded after a refusal').toEqual([]);
  });

  test('accepting loads the pixel and remembers the answer', async ({ page }) => {
    const hits = await watchPixel(page);
    await open(page, '/');
    await page.locator('[data-cc-panel="banner"] [data-cc-accept]').click();

    await expect(page.locator(bar)).toBeHidden();
    expect(await stored(page)).toMatchObject({ marketing: true });
    await expect.poll(() => hits.length, { timeout: 5000 }).toBeGreaterThan(0);
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
      localStorage.setItem('ukp-consent', JSON.stringify({ v: 1, marketing: true, t: twoYearsAgo }));
    });
    const hits = await watchPixel(page);
    await open(page, '/');
    await expect(page.locator(bar)).toBeVisible();
    // And a lapsed pristanak is not a pristanak: nothing loads while the question stands.
    await page.waitForTimeout(800);
    expect(hits).toEqual([]);
  });
});
