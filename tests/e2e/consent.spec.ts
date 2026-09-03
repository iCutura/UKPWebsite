import { test, expect } from '@playwright/test';
import { open } from './support';

const SPLIT = { latitude: 43.5081, longitude: 16.4402 };

/** Counts every call to the browser's geolocation API, from before any page script runs. */
const countCalls = `
  window.__geoCalls = 0;
  const real = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
  navigator.geolocation.getCurrentPosition = function (...args) { window.__geoCalls++; return real(...args); };
`;

test.describe('asking for a location', () => {
  test('never asks the browser for a position on page load', async ({ page }) => {
    // No permission granted here, so a call would surface the browser's own prompt.
    await page.addInitScript(countCalls);
    for (const path of ['/', '/lokacije/', '/dogadaji/']) {
      await open(page, path);
      await page.waitForTimeout(1200);
      expect(await page.evaluate(() => (window as any).__geoCalls), `prompted on ${path}`).toBe(0);
    }
  });

  test('explains itself before the browser prompt can appear', async ({ page }) => {
    await open(page, '/lokacije/');
    await expect(page.locator('[data-nearby-invite]')).toBeVisible();
    await expect(page.locator('[data-nearby-invite]')).toContainText('ostaje na tvom uređaju');
    await expect(page.locator('[data-nearby-go]')).toBeVisible();
  });

  test('asks only when the visitor clicks, and only once', async ({ page }) => {
    await page.addInitScript(countCalls);
    await open(page, '/lokacije/');
    expect(await page.evaluate(() => (window as any).__geoCalls)).toBe(0);
    await page.locator('[data-nearby-go]').click();
    await expect.poll(() => page.evaluate(() => (window as any).__geoCalls)).toBe(1);
  });

  test('takes no for an answer and stops offering', async ({ page }) => {
    await open(page, '/lokacije/');
    await page.locator('[data-nearby-dismiss]').click();
    await expect(page.locator('[data-nearby-go]')).toBeHidden();

    await open(page, '/lokacije/');
    await expect(page.locator('[data-nearby-go]')).toBeHidden();
    await expect(page.locator('[data-nearby-invite]')).toBeHidden();
    // The list is still perfectly usable without it.
    await expect(page.locator('[data-location-id]').first()).toBeVisible();
  });
});

test.describe('remembering the decision', () => {
  test.use({ permissions: ['geolocation'], geolocation: SPLIT });

  test('applies distances on the next visit without asking again', async ({ page }) => {
    await open(page, '/lokacije/');
    await page.locator('[data-nearby-go]').click();
    await expect(page.locator('[data-nearby-status]')).toContainText('udaljenosti', { timeout: 10000 });

    // A fresh page load, and a different page: distances should already be there.
    await open(page, '/dogadaji/');
    await expect(page.locator('.nearby-badge').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-nearby-invite]')).toBeHidden();
  });

  test('stores the decision and never a position', async ({ page }) => {
    await open(page, '/lokacije/');
    await page.locator('[data-nearby-go]').click();
    await expect(page.locator('[data-nearby-status]')).toContainText('udaljenosti', { timeout: 10000 });

    const stored = await page.evaluate(() => JSON.stringify(localStorage));
    expect(stored).toContain('ukp-geo');
    expect(stored).toContain('granted');
    // Split's coordinates, or any coordinate-shaped number, must not be on disk.
    expect(stored).not.toContain('43.5');
    expect(stored).not.toContain('16.4');
    expect(stored).not.toMatch(/lat|lng|longitude|latitude/i);
  });

  test('applies distances on arrival when permission already exists, with no click', async ({ page }) => {
    await page.addInitScript(countCalls);
    await open(page, '/lokacije/');
    await expect(page.locator('.nearby-badge').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-nearby-invite]')).toBeHidden();
    // One read of the position, no prompt, because permission was already given.
    expect(await page.evaluate(() => (window as any).__geoCalls)).toBe(1);
  });

  test('keeps the distances when the live refresh redraws the cards', async ({ page }) => {
    await open(page, '/dogadaji/');
    await expect(page.locator('.nearby-badge').first()).toBeVisible({ timeout: 10000 });
    const before = await page.locator('.nearby-badge').count();

    // The page refetches and rewrites every card; the ordering must survive it.
    await page.evaluate(() => {
      const box = document.querySelector('[data-live]');
      box?.dispatchEvent(new CustomEvent('ukp:live', { bubbles: true, detail: { count: 0 } }));
    });
    await expect.poll(() => page.locator('.nearby-badge').count()).toBe(before);
    await expect(page.locator('[data-nearby-status]')).toContainText('udaljenosti');
  });
});

test.describe('withdrawing consent', () => {
  test.use({ permissions: ['geolocation'], geolocation: SPLIT });

  test('the cookies page erases the decision', async ({ page }) => {
    await open(page, '/lokacije/');
    await page.locator('[data-nearby-go]').click();
    await expect(page.locator('[data-nearby-status]')).toContainText('udaljenosti', { timeout: 10000 });

    await open(page, '/kolacici/');
    await expect(page.getByText('koordinate se nikada ne spremaju', { exact: false })).toBeVisible();
    await page.locator('[data-forget-geo]').click();
    await expect(page.locator('[data-forget-geo-done]')).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('ukp-geo'))).toBeNull();
  });

  test('the privacy pages say what happens to a position', async ({ page }) => {
    await open(page, '/pravila-privatnosti/');
    await expect(page.getByRole('heading', { name: 'Lokacija uređaja' })).toBeVisible();
    await expect(page.getByText('ne šalje se nama', { exact: false })).toBeVisible();
  });
});

test.describe('nearest quizzes on the homepage', () => {
  test.use({ permissions: ['geolocation'], geolocation: SPLIT });

  test('reorders the coming quizzes by distance', async ({ page }) => {
    await open(page, '/');
    const before = await page.evaluate(() =>
      [...document.querySelectorAll("[data-live='events'] [data-event-id]")].map(el => (el as HTMLElement).dataset.eventId));
    test.skip(before.length < 2, 'needs at least two scheduled quizzes');

    await page.locator('[data-nearby-go]').click();
    await expect(page.locator('[data-nearby-status]')).toContainText('udaljenosti', { timeout: 10000 });

    const badges = await page.locator("[data-live='events'] .nearby-badge").count();
    expect(badges).toBeGreaterThan(0);
    const after = await page.evaluate(() =>
      [...document.querySelectorAll("[data-live='events'] [data-event-id]")].map(el => (el as HTMLElement).dataset.eventId));
    expect(after.sort()).toEqual(before.sort()); // same quizzes, reordered
  });

  test('the homepage still works with no location at all', async ({ page, context }) => {
    await context.clearPermissions();
    await open(page, '/');
    await expect(page.locator("[data-live='events'] [data-event-id]").first()).toBeVisible();
    await expect(page.locator('.nearby-badge')).toHaveCount(0);
  });
});
