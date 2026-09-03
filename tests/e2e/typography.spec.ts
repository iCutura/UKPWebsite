import { test, expect } from '@playwright/test';
import { open, PAGES } from './support';

/**
 * Croatian sets marks above the cap height (Š Č Ć Ž Đ) and at display sizes they overflow the
 * line box by roughly a tenth of the font size. The caron on "Što" once sat inside the label
 * above it on every page head except one. This measures where the ink actually starts.
 */
async function clearances(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const inkTop = (el: HTMLElement) => {
      const cs = getComputedStyle(el);
      const ctx = document.createElement('canvas').getContext('2d')!;
      ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const m = ctx.measureText(el.textContent?.trim().slice(0, 40) || 'Š');
      const lineHeight = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2;
      const halfLeading = (lineHeight - (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent)) / 2;
      const overshoot = m.fontBoundingBoxAscent - m.actualBoundingBoxAscent;
      return el.getBoundingClientRect().top + parseFloat(cs.paddingTop) + halfLeading + overshoot;
    };
    const out: { heading: string; clearance: number }[] = [];
    document.querySelectorAll('.eyebrow').forEach(e => {
      const next = e.nextElementSibling as HTMLElement | null;
      if (!next || !/^H[12]$/.test(next.tagName)) return;
      if (!next.textContent?.trim()) return;
      out.push({
        heading: next.textContent.trim().slice(0, 40),
        clearance: Math.round(inkTop(next) - e.getBoundingClientRect().bottom),
      });
    });
    return out;
  });
}

for (const path of PAGES) {
  test(`headings clear the label above them on ${path}`, async ({ page }) => {
    await open(page, path);
    const rows = await clearances(page);
    for (const row of rows) {
      expect(row.clearance, `"${row.heading}" overlaps the eyebrow above it`).toBeGreaterThan(4);
    }
  });
}

test('the page head reserves room for a caron', async ({ page }) => {
  // "Što ima ovaj tjedan." is the heading that first showed the problem.
  await open(page, '/dogadaji/');
  const rows = await clearances(page);
  const head = rows.find(r => r.heading.startsWith('Što'));
  expect(head, 'expected the events page head to be measured').toBeDefined();
  expect(head!.clearance).toBeGreaterThan(8);
});

test('the clearance scales with the heading rather than being a fixed nudge', async ({ page }) => {
  await open(page, '/dogadaji/');
  const big = await page.evaluate(() => getComputedStyle(document.querySelector('.page-head h1')!).paddingTop);
  await page.setViewportSize({ width: 380, height: 800 });
  await page.waitForTimeout(150);
  const small = await page.evaluate(() => getComputedStyle(document.querySelector('.page-head h1')!).paddingTop);
  expect(parseFloat(big)).toBeGreaterThan(parseFloat(small));
});
