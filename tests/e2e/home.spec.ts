import { test, expect } from '@playwright/test';
import { open } from './support';

test('the hero offers both app stores', async ({ page }) => {
  await open(page, '/');
  const hero = page.locator('[data-hero]');
  await expect(hero.getByRole('link', { name: /App Store/ })).toBeVisible();
  await expect(hero.getByRole('link', { name: /Google Play/ })).toBeVisible();
});

test('the format tiles promise prizes rather than quoting a fee', async ({ page }) => {
  await open(page, '/');
  const grid = page.locator('.format-grid');
  await expect(grid).toContainText('nagrađenih ekipa');
  await expect(grid).not.toContainText(/kotizacija/i);
});

/**
 * The flat mascot photo used to sit beside the format tiles, in the app pitch and on the 404 page.
 * The first and last now carry the hero's layered scene; the pitch carries the phone.
 */
for (const path of ['/', '/ne-postoji/']) {
  test(`${path} shows the layered scene in place of the flat mascot`, async ({ page }) => {
    await page.goto(path + '?motion=off', { waitUntil: 'load' });
    const scene = page.locator('[data-scene-card]').first();
    await scene.scrollIntoViewIfNeeded();
    await expect(scene).toBeVisible();
    await expect(scene.locator('img')).toHaveCount(5);
    await expect.poll(() => scene.locator('img').evaluateAll(imgs => imgs.every(i => (i as HTMLImageElement).naturalWidth > 0)), { timeout: 10000 }).toBe(true);
    expect(await page.locator('img[src*="/img/seasons/"][src*="mascot"]').count(), 'the flat mascot is gone').toBe(0);
  });
}

test('the app pitch fans out the three captures from the promo slide', async ({ page }) => {
  await open(page, '/');
  const stage = page.locator('[data-phone-stage]');
  await stage.scrollIntoViewIfNeeded();
  await expect(stage.locator('[data-phone]')).toHaveCount(3);
  await expect.poll(() => stage.locator('[data-phone]').evaluateAll(imgs => imgs.every(i => (i as HTMLImageElement).naturalWidth > 0)), { timeout: 10000 }).toBe(true);
  // The front phone is the one in the middle and on top of the other two.
  const z = await stage.locator('[data-phone]').evaluateAll(els => els.map(e => parseInt(getComputedStyle(e).zIndex)));
  expect(Math.max(...z)).toBe(z[1]);
});
