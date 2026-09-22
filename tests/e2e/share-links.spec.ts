import { test, expect } from '@playwright/test';
import { open, openEvent, venueForPrijava } from './support';

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
  const e = await openEvent(page);
  test.skip(!e, 'no quiz is open for registration');
  await open(page, `${e!.url}?prijava`);
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
  const e = await openEvent(page);
  test.skip(!e, 'no quiz is open for registration');
  await open(page, e!.url);
  await expect(page.locator('[data-prijava]')).toHaveAttribute('data-step', 'apps');
  await expect(page.locator('#p-team')).toBeHidden();
});

test('a venue link forwards to whichever quiz is next', async ({ page }) => {
  // A printed code at the bar must keep working after this week's quiz has passed, so the venue
  // link resolves at load time rather than pointing at one fixed event. Navigated directly,
  // because the helper's post-load work races the forward.
  const v = await venueForPrijava(page);
  test.skip(!v, 'no venue has an open quiz next on its calendar');
  await page.goto(`${v!.locationUrl}?prijava`, { waitUntil: 'load' });
  await page.waitForURL(/\/dogadaji\/\d+\/\?prijava/, { timeout: 10000 });
  await expect(page.locator('[data-prijava]')).toHaveAttribute('data-step', 'apps');
});

test('the venue CTA carries the registration link, not just the event page', async ({ page }) => {
  const v = await venueForPrijava(page);
  test.skip(!v, 'no venue has an open quiz next on its calendar');
  await open(page, v!.locationUrl);
  const cta = page.getByRole('link', { name: /Prijavi ekipu na sljedeći kviz/ });
  await expect(cta).toHaveAttribute('href', /\/dogadaji\/\d+\/\?prijava$/);
});

/**
 * The other half of the same rule: a venue with nothing on its calendar must not offer a link into
 * a registration that does not exist. This is what Zeppelin pub became, and the two tests above
 * used to name it by hand and read its silence as a failure.
 */
test('a venue with no termini offers another way on, not a dead sign-up link', async ({ page }) => {
  const list = (await (await page.request.get('/data/locations.json')).json()) as { url: string; upcomingCount: number }[];
  const quiet = list.find(l => !l.upcomingCount);
  test.skip(!quiet, 'every venue has a quiz scheduled');
  await open(page, quiet!.url);
  await expect(page.getByRole('link', { name: /Prijavi ekipu na sljedeći kviz/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Pogledaj druge lokacije/ })).toBeVisible();
});

test('the hash form works too, for links that lose their query string', async ({ page }) => {
  const e = await openEvent(page);
  test.skip(!e, 'no quiz is open for registration');
  // Navigated directly: the shared open() helper appends ?motion=off, which lands after the
  // fragment and breaks the URL rather than the feature.
  await page.goto(`${e!.url}#prijava`, { waitUntil: 'load' });
  const panel = page.locator('[data-prijava]');
  await expect(panel).toHaveAttribute('data-step', 'apps', { timeout: 10000 });
  await expect.poll(() => inView(panel), { timeout: 5000 }).toBe(true);
});

test('stepping from the apps to the form and back keeps the panel whole', async ({ page }) => {
  const e = await openEvent(page);
  test.skip(!e, 'no quiz is open for registration');
  await open(page, `${e!.url}?prijava`);
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
