import { test, expect } from '@playwright/test';
import { open, PAGES } from './support';

/**
 * Horizontal overflow is measured by what a reader loses, not by scrollWidth: the site clips the
 * body, so a card wider than the screen cannot be scrolled to and simply has its right edge cut
 * off. Anything inside a deliberate horizontal scroller is exempt, since scrolling is the point.
 */
async function overflowing(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const clipper = (el: Element) => {
      let n = el.parentElement;
      while (n && n !== document.body) {
        if (/auto|hidden|scroll|clip/.test(getComputedStyle(n).overflowX)) return true;
        n = n.parentElement;
      }
      return false;
    };
    const vw = document.documentElement.clientWidth;
    const out: string[] = [];
    // The spam honeypot and the skip link are parked off-screen on purpose.
    const deliberate = (el: Element) => el.closest('.hp, .skip') !== null || el.classList.contains('hp') || el.classList.contains('skip');
    document.querySelectorAll('main *, footer *').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || clipper(el) || deliberate(el)) return;
      if (r.right > vw + 1 || r.left < -1) {
        out.push(`${el.tagName}.${String((el as HTMLElement).className).slice(0, 30)} → ${Math.round(r.left)}..${Math.round(r.right)} of ${vw}`);
      }
    });
    return out;
  });
}

for (const path of PAGES) {
  test(`nothing is cut off the side of ${path}`, async ({ page }) => {
    await open(page, path);
    expect(await overflowing(page)).toEqual([]);
  });

  test(`${path} cannot be dragged sideways`, async ({ page }) => {
    await open(page, path);
    const moved = await page.evaluate(() => { window.scrollTo(4000, 0); const x = window.scrollX; window.scrollTo(0, 0); return x; });
    expect(moved).toBe(0);
  });
}

test('nothing sits on top of the header', async ({ page }) => {
  await open(page, '/dogadaji/');
  const overlaps = await page.evaluate(() => {
    const header = document.querySelector('[data-header]')!.getBoundingClientRect();
    const hits: string[] = [];
    document.querySelectorAll('h1, h2, .lead, .btn').forEach(el => {
      const b = el.getBoundingClientRect();
      if (b.height === 0) return;
      const inside = el.closest('[data-header]');
      if (inside) return;
      if (b.top < header.bottom && b.bottom > header.top && b.left < header.right && b.right > header.left) {
        hits.push(`${el.tagName}: ${el.textContent?.trim().slice(0, 30)}`);
      }
    });
    return hits;
  });
  expect(overlaps).toEqual([]);
});

test('tap targets are big enough to hit', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', 'only meaningful on a touch screen');
  await open(page, '/lokacije/');
  const small = await page.evaluate(() => {
    const out: string[] = [];
    document.querySelectorAll('a.btn, button, .fchip, .chip[role], input, select').forEach(el => {
      const b = el.getBoundingClientRect();
      if (b.width === 0 || b.height === 0) return;
      if (getComputedStyle(el).display === 'none') return;
      if (b.height < 36) out.push(`${el.tagName}.${(el as HTMLElement).className}: ${Math.round(b.height)}px`);
    });
    return out;
  });
  expect(small).toEqual([]);
});

test('the hero dissolves into the page instead of stopping at an edge', async ({ page }) => {
  await open(page, '/');
  const seam = await page.evaluate(() => {
    const hero = document.querySelector('[data-hero]') as HTMLElement;
    const fade = document.querySelector('.hero-dissolve') as HTMLElement;
    if (!fade) return { missing: true } as const;
    const h = hero.getBoundingClientRect(), f = fade.getBoundingClientRect();
    return {
      missing: false,
      fadeHeight: Math.round(f.height),
      reachesBottom: Math.round(f.bottom) >= Math.round(h.bottom),
      contentClearsFade: Math.round(document.querySelector('.hero-cta')!.getBoundingClientRect().bottom) <= Math.round(f.top) + 8,
    } as const;
  });
  expect(seam.missing).toBe(false);
  if (!seam.missing) {
    expect(seam.fadeHeight).toBeGreaterThan(90);
    expect(seam.reachesBottom).toBe(true);
    expect(seam.contentClearsFade).toBe(true);
  }
});

test('the artwork does not cover the headline', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'the layers stack above the text on a phone by design');
  await open(page, '/');
  const gap = await page.evaluate(() => {
    const text = document.querySelector('.hero-text')!.getBoundingClientRect();
    const mascot = document.querySelector('.layer-mascot')!.getBoundingClientRect();
    return Math.round(mascot.left - text.right);
  });
  expect(gap).toBeGreaterThan(0);
});
