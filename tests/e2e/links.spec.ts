import { test, expect } from '@playwright/test';
import { open } from './support';

/**
 * The association files are static and must come back as JSON bodies from the same origin as
 * the site; the landing template must render with its badges and the open button. Apache's
 * rewrites and content types cannot run under astro preview, so scripts/verify-links.sh checks
 * those after a deploy.
 */
test('the association files are served from the build', async ({ request }) => {
  const aasa = await request.get('/.well-known/apple-app-site-association');
  expect(aasa.status()).toBe(200);
  expect(JSON.parse(await aasa.text()).applinks.details[0].appID).toBe('X6P3LG956W.injeel.PubQuiz');
  const links = await request.get('/.well-known/assetlinks.json');
  expect(links.status()).toBe(200);
  expect(JSON.parse(await links.text())[0].target.package_name).toBe('com.injeelit.pubquiz');
});

test('the landing template renders the open button and both store badges', async ({ page }) => {
  await open(page, '/link/');
  await expect(page.locator('[data-open-app]')).toBeVisible();
  await expect(page.locator('[data-open-app]')).toHaveAttribute('href', '{{OPEN_URL}}');
  const landing = page.locator('[data-applink]');
  await expect(landing.locator('a[href*="apps.apple.com"]').first()).toBeVisible();
  await expect(landing.locator('a[href*="play.google.com"]').first()).toBeVisible();
});
