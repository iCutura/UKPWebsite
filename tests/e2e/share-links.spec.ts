import { test, expect } from '@playwright/test';
import { open } from './support';

/**
 * Links a venue hands to its teams. Scanning a code at the bar should put someone in front of the
 * ways to register, the apps first with the form one tap below, rather than on a page they have to
 * read and navigate.
 */

const inView = (panel: import('@playwright/test').Locator) => panel.evaluate(el => {
  const r = el.getBoundingClientRect();
  return r.top < window.innerHeight && r.bottom > 0;
});

test('an event link lands on the apps step of the registration panel', async ({ page }) => {
  await open(page, '/dogadaji/3145/?prijava');
  const panel = page.locator('[data-prijava]');
  await expect(panel).toHaveAttribute('data-step', 'apps');
  // QR codes, store buttons, and the way in for people without the app.
  await expect(page.locator('[data-step-panel="apps"] .qr-tile')).toHaveCount(2);
  await expect(page.locator('[data-step-panel="apps"] [data-step-go="form"]')).toBeVisible();
  await expect(page.locator('#p-team')).toBeHidden();
  // And the reader is actually looking at it, not at the top of the page.
  expect(await inView(panel), 'the panel is off screen after following the link').toBe(true);
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
  await expect(page.locator('[data-prijava]')).toHaveAttribute('data-step', 'apps');
});

test('the venue CTA carries the registration link, not just the event page', async ({ page }) => {
  await open(page, '/lokacije/24-zeppelin-pub-bjelovar/');
  const cta = page.getByRole('link', { name: /Prijavi ekipu na sljedeći kviz/ });
  await expect(cta).toHaveAttribute('href', /\/dogadaji\/\d+\/\?prijava$/);
});

test('the hash form works too, for links that lose their query string', async ({ page }) => {
  // Navigated directly: the shared open() helper appends ?motion=off, which lands after the
  // fragment and breaks the URL rather than the feature.
  await page.goto('/dogadaji/3145/#prijava', { waitUntil: 'load' });
  const panel = page.locator('[data-prijava]');
  await expect(panel).toHaveAttribute('data-step', 'apps', { timeout: 10000 });
  await expect.poll(() => inView(panel), { timeout: 5000 }).toBe(true);
});

test('stepping from the apps to the form and back keeps the panel whole', async ({ page }) => {
  await open(page, '/dogadaji/3145/?prijava');
  const panel = page.locator('[data-prijava]');
  await page.locator('[data-step-panel="apps"] [data-step-go="form"]').click();
  await expect(page.locator('[data-step-panel="form"]')).toBeVisible();
  await expect(page.locator('[data-step-panel="apps"]')).toBeHidden();
  await page.locator('[data-step-panel="form"] [data-step-go="apps"]').click();
  await expect(page.locator('[data-step-panel="apps"]')).toBeVisible();
  await expect(page.locator('[data-step-panel="form"]')).toBeHidden();
  // The height tween clears itself; a panel left with an inline height would clip the next step.
  await expect.poll(() => panel.evaluate(el => (el as HTMLElement).style.height), { timeout: 3000 }).toBe('');
});
