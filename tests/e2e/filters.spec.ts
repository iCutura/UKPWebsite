import { test, expect } from '@playwright/test';
import { open, visibleCount } from './support';

/**
 * Filtering used to update the counter while every card stayed on screen: the cards set the
 * hidden attribute, but display:flex in the card class outranked the browser's [hidden] rule.
 * These tests assert what a reader sees, never the attribute.
 */

test.describe('locations filter', () => {
  test('narrowing by city removes the other cards from view', async ({ page }) => {
    await open(page, '/lokacije/');
    const all = await visibleCount(page, '[data-location-id]');
    expect(all).toBeGreaterThan(20);

    await page.locator('[data-filter-city="Zagreb"]').click();
    await page.waitForTimeout(200);

    const shown = await visibleCount(page, '[data-location-id]');
    expect(shown).toBeGreaterThan(0);
    expect(shown).toBeLessThan(all);

    // The counter has to agree with the page; it used to be the only thing that changed.
    await expect(page.locator('[data-filter-count]')).toHaveText(String(shown));

    const cities = await page.evaluate(() => [...document.querySelectorAll('[data-location-id]')]
      .filter(el => getComputedStyle(el).display !== 'none')
      .map(el => (el as HTMLElement).dataset.city));
    expect(new Set(cities)).toEqual(new Set(['Zagreb']));
  });

  test('clearing the filter brings every location back', async ({ page }) => {
    await open(page, '/lokacije/');
    const all = await visibleCount(page, '[data-location-id]');
    await page.locator('[data-filter-city="Zagreb"]').click();
    await page.waitForTimeout(150);
    await page.locator('[data-filter-city="Zagreb"]').click();
    await page.waitForTimeout(150);
    expect(await visibleCount(page, '[data-location-id]')).toBe(all);
  });

  test('the scheduled-only filter keeps just locations with a date', async ({ page }) => {
    await open(page, '/lokacije/');
    await page.locator('[data-filter-upcoming]').click();
    await page.waitForTimeout(200);

    const texts = await page.evaluate(() => [...document.querySelectorAll('[data-location-id]')]
      .filter(el => getComputedStyle(el).display !== 'none')
      .map(el => el.textContent ?? ''));
    expect(texts.length).toBeGreaterThan(0);
    for (const t of texts) expect(t).not.toContain('Trenutno nema zakazanih termina');
  });

  test('search and city narrow together, and the empty state appears', async ({ page }) => {
    await open(page, '/lokacije/');
    await page.locator('[data-filter-city="Zagreb"]').click();
    await page.locator('[data-filter-q]').fill('zeppelin'); // Zeppelin pub is in Bjelovar
    await page.waitForTimeout(250);

    expect(await visibleCount(page, '[data-location-id]')).toBe(0);
    await expect(page.locator('[data-filter-empty]')).toBeVisible();
  });

  test('search alone finds a venue', async ({ page }) => {
    await open(page, '/lokacije/');
    await page.locator('[data-filter-q]').fill('zeppelin');
    await page.waitForTimeout(250);
    expect(await visibleCount(page, '[data-location-id]')).toBe(1);
  });

  test('a city in the address bar is applied on load', async ({ page }) => {
    await open(page, '/lokacije/?grad=Zagreb');
    const cities = await page.evaluate(() => [...document.querySelectorAll('[data-location-id]')]
      .filter(el => getComputedStyle(el).display !== 'none')
      .map(el => (el as HTMLElement).dataset.city));
    expect(cities.length).toBeGreaterThan(0);
    expect(new Set(cities)).toEqual(new Set(['Zagreb']));
  });
});

test.describe('events filter', () => {
  test('narrowing by city removes the other quizzes from view', async ({ page }) => {
    await open(page, '/dogadaji/');
    const all = await visibleCount(page, '[data-event-id]');
    test.skip(all === 0, 'no upcoming quizzes in the current snapshot');

    const chip = page.locator('[data-ev-city]').nth(1);
    const city = await chip.getAttribute('data-ev-city');
    await chip.click();
    await page.waitForTimeout(200);

    const shown = await visibleCount(page, '[data-event-id]');
    expect(shown).toBeGreaterThan(0);
    expect(shown).toBeLessThanOrEqual(all);
    await expect(page.locator('[data-ev-count]')).toHaveText(String(shown));

    const texts = await page.evaluate(() => [...document.querySelectorAll('[data-event-id]')]
      .filter(el => getComputedStyle(el).display !== 'none').map(el => el.textContent ?? ''));
    for (const t of texts) expect(t).toContain(city!);
  });

  test('"svi gradovi" restores the full list', async ({ page }) => {
    await open(page, '/dogadaji/');
    const all = await visibleCount(page, '[data-event-id]');
    test.skip(all === 0, 'no upcoming quizzes in the current snapshot');
    await page.locator('[data-ev-city]').nth(1).click();
    await page.waitForTimeout(150);
    await page.locator('[data-ev-city=""]').click();
    await page.waitForTimeout(150);
    expect(await visibleCount(page, '[data-event-id]')).toBe(all);
  });
});
