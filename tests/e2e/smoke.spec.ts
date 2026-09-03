import { test, expect } from '@playwright/test';
import { open, PAGES } from './support';

for (const path of PAGES) {
  test(`${path} renders without errors`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

    const response = await page.goto(path + '?motion=off');
    expect(response?.status()).toBe(200);

    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('h1')).not.toBeEmpty();
    await expect(page).toHaveTitle(/UKP|Urbana kviz priča/);
    expect(errors).toEqual([]);
  });
}

test('every page is in Croatian and says so', async ({ page }) => {
  for (const path of PAGES) {
    await page.goto(path + '?motion=off');
    await expect(page.locator('html')).toHaveAttribute('lang', 'hr');
  }
});

test('a location page carries its venue, city and a way back', async ({ page }) => {
  await open(page, '/lokacije/');
  const first = page.locator('[data-location-id]').first();
  const venue = (await first.locator('.loc-title').textContent())!.trim();
  await first.click();
  await page.waitForLoadState('load');

  await expect(page.locator('h1')).toContainText(venue);
  await expect(page.locator('.crumbs a').first()).toHaveAttribute('href', '/lokacije/');
});

test('an event page states the date, the venue and how to register', async ({ page }) => {
  await open(page, '/dogadaji/');
  const count = await page.locator('[data-event-id]').count();
  test.skip(count === 0, 'no upcoming quizzes in the current snapshot');

  await page.locator('[data-event-id]').first().click();
  await page.waitForLoadState('load');

  await expect(page.locator('.evd-when')).toBeVisible();
  await expect(page.locator('.evd-loc')).toBeVisible();
  await expect(page.locator('[data-prijava]')).toBeVisible();
  // Registration leads with the apps; the form is the fallback.
  await expect(page.locator('[data-step-panel="apps"]')).toBeVisible();
  await expect(page.locator('[data-step-panel="form"]')).toBeHidden();
});

test('the registration flow steps forward to the form', async ({ page }) => {
  await open(page, '/dogadaji/');
  test.skip(await page.locator('[data-event-id]').count() === 0, 'no upcoming quizzes');
  await page.locator('[data-event-id]').first().click();
  await page.waitForLoadState('load');

  await page.locator('[data-step-panel="apps"] [data-step-go="form"]').click();
  await expect(page.locator('[data-step-panel="form"]')).toBeVisible();
  await expect(page.locator('[data-step-panel="apps"]')).toBeHidden();
  for (const name of ['teamName', 'contactName', 'contactEmail', 'contactPhone']) {
    await expect(page.locator(`[data-step-panel="form"] [name="${name}"]`)).toBeVisible();
  }
});

test('an unknown address returns the 404 page, and legacy URLs point somewhere useful', async ({ page }) => {
  const res = await page.goto('/ne-postoji/?motion=off');
  expect(res?.status()).toBe(404);
  await expect(page.locator('h1')).toBeVisible();
  await expect(page.locator('main a[href="/lokacije/"]').first()).toBeVisible();
});
