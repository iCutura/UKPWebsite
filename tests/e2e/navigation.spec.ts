import { test, expect } from '@playwright/test';
import { open, PAGES } from './support';

/**
 * Two faults that shipped and that the existing suite could not see.
 *
 * The overflow test scanned `main *, footer *`, so a stray element in the header was invisible to
 * it, and it checked `scrollX`, which stays 0 because the body clips horizontally. Measuring the
 * document against the viewport catches what a reader actually experiences: a page wider than the
 * phone, with the menu button off the right edge.
 */
test('no page is wider than the screen it is on', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', 'only meaningful on a narrow screen');
  for (const path of [...PAGES, '/lokacije/?grad=Zagreb', '/lokacije/24-zeppelin-pub-bjelovar/']) {
    await open(page, path);
    const { inner, doc, toggleRight } = await page.evaluate(() => ({
      inner: window.innerWidth,
      doc: document.documentElement.scrollWidth,
      toggleRight: document.querySelector('[data-nav-toggle]')?.getBoundingClientRect().right ?? 0,
    }));
    expect(doc, `${path} lays out ${doc}px wide on a ${inner}px screen`).toBeLessThanOrEqual(inner + 1);
    expect(toggleRight, `${path}: the menu button sits off the right edge`).toBeLessThanOrEqual(inner);
  }
});

/**
 * The locations filter wrote `history.replaceState(null, …)` on every apply, wiping the router's
 * own state. Astro ignores a popstate entry with none, so Back changed the URL and left the venue
 * page on screen.
 */
test('Back from a venue returns to the list', async ({ page }) => {
  await open(page, '/lokacije/');
  expect(await page.evaluate(() => history.state), 'the router state was overwritten').not.toBeNull();

  const first = page.locator('[data-location-id]').first();
  const box = await first.boundingBox();
  if (box) await page.evaluate(y => window.scrollTo({ top: y, behavior: 'instant' as ScrollBehavior }), Math.max(0, box.y - 200));
  await page.waitForTimeout(120);
  await first.click();
  await page.waitForURL(/\/lokacije\/\d+-/, { timeout: 10000 });

  await page.goBack();
  await expect(page).toHaveURL(/\/lokacije\/(\?|$)/);
  // The URL is the easy half; the page behind it is what was broken.
  await expect(page.locator('[data-filter-bar]')).toBeVisible({ timeout: 8000 });
  expect(await page.locator('[data-location-id]').count()).toBeGreaterThan(50);
});

test('Back works from an event too', async ({ page }) => {
  await open(page, '/dogadaji/');
  const first = page.locator('[data-event-id]').first();
  await first.scrollIntoViewIfNeeded();
  await first.click();
  await page.waitForURL(/\/dogadaji\/\d+\//, { timeout: 10000 });
  await page.goBack();
  await expect(page.locator('[data-ev-grid]')).toBeVisible({ timeout: 8000 });
});
