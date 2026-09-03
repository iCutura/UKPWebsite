import { test, expect } from '@playwright/test';
import { open, visibleCount } from './support';

const SPLIT = { latitude: 43.5081, longitude: 16.4402 };

test.describe('quizzes near me', () => {
  test.use({ permissions: ['geolocation'], geolocation: SPLIT });

  test('reorders locations by distance and labels each one', async ({ page, context }) => {
    // Permission is already granted here, so the page applies distances on arrival. Take the
    // built order from a visit without permission, which is what a first-time visitor sees.
    await context.clearPermissions();
    await open(page, '/lokacije/');
    const before = await page.evaluate(() =>
      [...document.querySelectorAll('[data-location-id]')].slice(0, 3).map(el => (el as HTMLElement).dataset.city));

    await context.grantPermissions(['geolocation']);
    await open(page, '/lokacije/');
    await expect(page.locator('[data-nearby-status]')).toContainText('udaljenosti', { timeout: 10000 });

    const after = await page.evaluate(() =>
      [...document.querySelectorAll('[data-location-id]')].slice(0, 3).map(el => (el as HTMLElement).dataset.city));
    expect(after).not.toEqual(before);

    // Standing in Split, the first card should be in or very near Split.
    const first = await page.locator('[data-location-id]').first();
    await expect(first.locator('.nearby-badge')).toBeVisible();
    const km = parseFloat((await first.locator('.nearby-badge').textContent())!.replace(',', '.'));
    expect(km).toBeLessThan(60);

    // Distances must not decrease down the list.
    const order = await page.evaluate(() => [...document.querySelectorAll('.nearby-badge')].map(b => {
      const t = b.textContent!.trim();
      return t.endsWith('m') && !t.endsWith('km') ? parseFloat(t) / 1000 : parseFloat(t.replace(',', '.'));
    }));
    for (let i = 1; i < order.length; i++) expect(order[i]).toBeGreaterThanOrEqual(order[i - 1] - 0.01);
  });

  test('locations without coordinates stay on the page, behind the measured ones', async ({ page }) => {
    await open(page, '/lokacije/');
    const total = await visibleCount(page, '[data-location-id]');
    await page.locator('[data-nearby-go]').click();
    await expect(page.locator('[data-nearby-status]')).toContainText('udaljenosti', { timeout: 10000 });

    expect(await visibleCount(page, '[data-location-id]')).toBe(total);
    const badges = await page.locator('.nearby-badge').count();
    expect(badges).toBeGreaterThan(0);
    expect(badges).toBeLessThan(total); // 43 locations have no coordinates

    // The unmeasured ones sit at the end.
    const lastHasBadge = await page.evaluate(() =>
      !!document.querySelector('[data-location-id]:last-of-type .nearby-badge'));
    expect(lastHasBadge).toBe(false);
  });

  test('reset puts the original order back', async ({ page, context }) => {
    // The order the page was built in, seen without permission the way a first visit is.
    await context.clearPermissions();
    await open(page, '/lokacije/');
    const before = await page.evaluate(() =>
      [...document.querySelectorAll('[data-location-id]')].map(el => (el as HTMLElement).dataset.locationId));

    await context.grantPermissions(['geolocation']);
    await open(page, '/lokacije/');
    await expect(page.locator('[data-nearby-reset]')).toBeVisible({ timeout: 10000 });
    await page.locator('[data-nearby-reset]').click();

    const after = await page.evaluate(() =>
      [...document.querySelectorAll('[data-location-id]')].map(el => (el as HTMLElement).dataset.locationId));
    expect(after).toEqual(before);
    expect(await page.locator('.nearby-badge').count()).toBe(0);
  });

  test('the events page sorts quizzes by distance too', async ({ page }) => {
    await open(page, '/dogadaji/');
    test.skip(await page.locator('[data-event-id]').count() === 0, 'no upcoming quizzes');
    await page.locator('[data-nearby-go]').click();
    await expect(page.locator('[data-nearby-status]')).toContainText('udaljenosti', { timeout: 10000 });
    expect(await page.locator('.nearby-badge').count()).toBeGreaterThan(0);
  });
});

test.describe('when the visitor refuses', () => {
  test.use({ permissions: [] });

  test('says so in Croatian and leaves the list alone', async ({ page, context }) => {
    await context.clearPermissions();
    await open(page, '/lokacije/');
    const before = await page.evaluate(() =>
      [...document.querySelectorAll('[data-location-id]')].map(el => (el as HTMLElement).dataset.locationId));

    await page.locator('[data-nearby-go]').click();
    await expect(page.locator('[data-nearby-status]')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-nearby-status]')).toHaveClass(/is-error/);

    const after = await page.evaluate(() =>
      [...document.querySelectorAll('[data-location-id]')].map(el => (el as HTMLElement).dataset.locationId));
    expect(after).toEqual(before);
    await expect(page.locator('[data-nearby-go]')).toBeEnabled();
  });
});

test.describe('map view', () => {
  test('switches between the list and the map, and remembers the choice', async ({ page }) => {
    await open(page, '/lokacije/');
    await expect(page.locator('[data-view-panel="list"]')).toBeVisible();
    await expect(page.locator('[data-view-panel="map"]')).toBeHidden();

    await page.locator('[data-view="map"]').click();
    await expect(page.locator('[data-view-panel="map"]')).toBeVisible();
    await expect(page.locator('[data-view-panel="list"]')).toBeHidden();

    await open(page, '/lokacije/');
    await expect(page.locator('[data-view-panel="map"]')).toBeVisible();
  });

  test('draws a pin for every city that has coordinates, and links it to that city', async ({ page }) => {
    await open(page, '/lokacije/');
    await page.locator('[data-view="map"]').click();

    const pins = page.locator('[data-pin]');
    expect(await pins.count()).toBeGreaterThan(30);

    const zagreb = page.locator('[data-pin][data-city="Zagreb"]');
    await expect(zagreb).toHaveCount(1);
    await expect(zagreb).toHaveAttribute('href', '/lokacije/?grad=Zagreb');
    await expect(zagreb).toHaveAttribute('aria-label', /Zagreb/);
  });

  test('pins sit inside the drawn map, not off its edge', async ({ page }) => {
    await open(page, '/lokacije/');
    await page.locator('[data-view="map"]').click();
    const outside = await page.evaluate(() => {
      const svg = document.querySelector('[data-map] svg')!.getBoundingClientRect();
      return [...document.querySelectorAll('[data-pin] circle.pin')].filter(c => {
        const b = c.getBoundingClientRect();
        return b.left < svg.left - 1 || b.right > svg.right + 1 || b.top < svg.top - 1 || b.bottom > svg.bottom + 1;
      }).length;
    });
    expect(outside).toBe(0);
  });

  test('a pin explains itself on hover', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'hover is a pointer gesture');
    await open(page, '/lokacije/');
    await page.locator('[data-view="map"]').click();
    await page.locator('[data-pin][data-city="Zagreb"]').hover();
    const tip = page.locator('[data-map-tip]');
    await expect(tip).toBeVisible();
    await expect(tip).toContainText('Zagreb');
  });

  test('the map needs no third-party request', async ({ page }) => {
    const external: string[] = [];
    page.on('request', r => {
      const url = new URL(r.url());
      if (!['127.0.0.1', 'localhost'].includes(url.hostname)) external.push(url.hostname);
    });
    await open(page, '/lokacije/');
    await page.locator('[data-view="map"]').click();
    await page.waitForTimeout(400);
    expect([...new Set(external)]).toEqual([]);
  });
});
