import type { Page } from '@playwright/test';

/** Every route the site serves from its own templates. */
export const PAGES = [
  '/', '/lokacije/', '/dogadaji/', '/novosti/', '/o-nama/',
  '/team-building/', '/partneri/', '/kontakt/', '/pravila-privatnosti/', '/kolacici/',
];

/** Load a page with animation disabled so reveals do not hide content from the assertions. */
export async function open(page: Page, path: string) {
  const url = path + (path.includes('?') ? '&' : '?') + 'motion=off';
  await page.goto(url, { waitUntil: 'load' });
  // Smooth scrolling is its own property: without pinning it, a click races the scroll animation
  // and lands on whatever is passing under the pointer.
  await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}html{scroll-behavior:auto!important}' });
  await page.evaluate(() => document.querySelectorAll('[data-reveal]').forEach(e => e.classList.add('is-in')));
  // The live refresh replaces whole card grids; clicking one mid-swap is a guaranteed flake.
  await page.waitForFunction(
    () => [...document.querySelectorAll('[data-live]')].every(b => (b as HTMLElement).dataset.liveDone === '1'),
    null, { timeout: 5000 },
  ).catch(() => {});
  // And for the near-me control to settle into its mode, which can hide a line of text.
  await page.waitForFunction(
    () => [...document.querySelectorAll('[data-nearby]')].every(b => (b as HTMLElement).dataset.ready === '1'),
    null, { timeout: 5000 },
  ).catch(() => {});
  await page.evaluate(() => document.querySelectorAll('[data-reveal]').forEach(e => e.classList.add('is-in')));
  await page.waitForTimeout(150);
}

/** Elements a reader can actually see. */
export const visibleCount = (page: Page, selector: string) =>
  page.evaluate(sel => [...document.querySelectorAll(sel)]
    .filter(el => getComputedStyle(el as Element).display !== 'none').length, selector);

/**
 * Click a card in a long list. scrollIntoView() will not move this page for the first card in a
 * grid, so scroll by coordinates first and click what is genuinely on screen, the way a reader
 * would after a swipe.
 */
export async function clickCard(page: Page, selector: string, index = 0) {
  const card = page.locator(selector).nth(index);
  const box = await card.boundingBox();
  if (box) await page.evaluate(y => window.scrollTo({ top: y, behavior: 'instant' as ScrollBehavior }),
    Math.max(0, box.y + (await page.evaluate(() => window.scrollY)) - 120));
  await page.waitForTimeout(120);
  await card.click();
}
