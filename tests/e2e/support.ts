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
  await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}' });
  await page.evaluate(() => document.querySelectorAll('[data-reveal]').forEach(e => e.classList.add('is-in')));
  await page.waitForTimeout(150);
}

/** Elements a reader can actually see. */
export const visibleCount = (page: Page, selector: string) =>
  page.evaluate(sel => [...document.querySelectorAll(sel)]
    .filter(el => getComputedStyle(el as Element).display !== 'none').length, selector);
