import { test, expect } from '@playwright/test';
import { open } from './support';

/**
 * Links a venue hands to its teams. The point is that scanning a code at the bar puts someone in
 * front of the form, rather than on a page they have to read and navigate.
 */

test('an event link opens the registration form directly', async ({ page }) => {
  await open(page, '/dogadaji/3145/?prijava');
  const panel = page.locator('[data-prijava]');
  await expect(panel).toHaveAttribute('data-step', 'form');
  await expect(page.locator('#p-team')).toBeVisible();
  // And the reader is actually looking at it, not at the top of the page.
  const inView = await panel.evaluate(el => {
    const r = el.getBoundingClientRect();
    return r.top < window.innerHeight && r.bottom > 0;
  });
  expect(inView, 'the panel is off screen after following the link').toBe(true);
});

test('the same page without the parameter is unchanged', async ({ page }) => {
  await open(page, '/dogadaji/3145/');
  await expect(page.locator('[data-prijava]')).toHaveAttribute('data-step', 'apps');
  await expect(page.locator('#p-team')).toBeHidden();
});

test('a venue link forwards to whichever quiz is next', async ({ page }) => {
  // A printed code at the bar must keep working after this week's quiz has passed, so the venue
  // link resolves at load time rather than pointing at one fixed event. Navigated directly,
  // because the helper's post-load work races the forward.
  await page.goto('/lokacije/24-zeppelin-pub-bjelovar/?prijava', { waitUntil: 'load' });
  await page.waitForURL(/\/dogadaji\/\d+\/\?prijava/, { timeout: 10000 });
  await expect(page.locator('[data-prijava]')).toHaveAttribute('data-step', 'form');
});

test('the venue CTA goes to the form, not just to the event page', async ({ page }) => {
  await open(page, '/lokacije/24-zeppelin-pub-bjelovar/');
  const cta = page.getByRole('link', { name: /Prijavi ekipu na sljedeći kviz/ });
  await expect(cta).toHaveAttribute('href', /\/dogadaji\/\d+\/\?prijava$/);
});

test('the hash form works too, for links that lose their query string', async ({ page }) => {
  // Navigated directly: the shared open() helper appends ?motion=off, which lands after the
  // fragment and breaks the URL rather than the feature.
  await page.goto('/dogadaji/3145/#prijava', { waitUntil: 'load' });
  await expect(page.locator('[data-prijava]')).toHaveAttribute('data-step', 'form', { timeout: 10000 });
});
