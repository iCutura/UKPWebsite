import { test, expect } from '@playwright/test';
import { open } from './support';

/**
 * Layout faults that look like nothing in the code and are obvious on screen. Each of these
 * shipped: a utility margin silently outranked, a nowrap that did nothing because the row was
 * not flex, and a display face whose word space is narrow enough to run words together.
 */

test('the alternative registration route is not glued to the QR codes', async ({ page }) => {
  await open(page, '/dogadaji/3145/');
  const gap = await page.evaluate(() => {
    const grid = document.querySelector('.qr-grid')!.getBoundingClientRect();
    const btn = document.querySelector('[data-step-panel="apps"] [data-step-go="form"]')!.getBoundingClientRect();
    return Math.round(btn.top - grid.bottom);
  });
  // .prijava-panel .btn-block outranked the mt-3 utility and left this at 4px.
  expect(gap, 'the button sits right on top of the QR tiles').toBeGreaterThanOrEqual(16);
});

test('the city filter is one swipeable row on a phone', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', 'only meaningful on a narrow screen');
  for (const path of ['/dogadaji/', '/lokacije/']) {
    await open(page, path);
    const row = await page.evaluate(() => {
      const el = document.querySelector('.filter-chips') as HTMLElement;
      const cs = getComputedStyle(el);
      const chip = el.querySelector('button')!.getBoundingClientRect().height;
      return { height: Math.round(el.getBoundingClientRect().height), chip: Math.round(chip),
               scrolls: el.scrollWidth > el.clientWidth, overflowX: cs.overflowX };
    });
    // Sixteen cities wrapped onto three rows here because the row was not a flex container.
    expect(row.height, `${path}: the chip row is ${row.height}px, more than one chip tall`).toBeLessThan(row.chip + 14);
    if (row.scrolls) expect(row.overflowX, `${path}: chips overflow with no way to scroll`).toBe('auto');
  }
});

test('display headings keep their words apart', async ({ page }) => {
  await open(page, '/team-building/');
  const { spaceEm, wordSpacing } = await page.evaluate(() => {
    const h = document.querySelector('h2.h3')!;
    const cs = getComputedStyle(h);
    const size = parseFloat(cs.fontSize);
    const c = document.createElement('canvas').getContext('2d')!;
    c.font = `${cs.fontWeight} ${size}px ${cs.fontFamily}`;
    const natural = (c.measureText('n n').width - c.measureText('nn').width) / size;
    const extra = parseFloat(cs.wordSpacing) / size || 0;
    return { spaceEm: natural + extra + parseFloat(cs.letterSpacing) / size, wordSpacing: cs.wordSpacing };
  });
  // Cobe's own space is .16em and the negative letter-spacing trims it further, which ran
  // "Interaktivni izazovi" together into one word.
  expect(spaceEm, `effective word space is ${spaceEm.toFixed(3)}em (word-spacing ${wordSpacing})`).toBeGreaterThan(0.19);
});
