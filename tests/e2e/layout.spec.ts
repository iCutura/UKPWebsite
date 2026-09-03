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

test('the hero dissolves into the page with no visible seam', async ({ page }) => {
  // The scene used to stop on a hard edge against the paper below. It is now masked away at the
  // foot, so the artwork thins out and the page shows through. Measured, because it looked
  // "nearly right" twice before it actually was.
  await open(page, '/');
  const step = await page.evaluate(async () => {
    const hero = document.querySelector('[data-hero]') as HTMLElement;
    const heroBottom = hero.getBoundingClientRect().height;
    window.scrollTo(0, heroBottom - 400);
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

    // Read the rendered colours either side of the join straight out of the compositor.
    const y = Math.round(hero.getBoundingClientRect().bottom);
    const probe = (yy: number) => {
      const el = document.elementFromPoint(20, yy);
      return el ? getComputedStyle(el).backgroundColor : '';
    };
    return { above: probe(y - 6), below: probe(y + 6), heroHasOwnDarkGround: getComputedStyle(hero).backgroundColor };
  });
  // The hero must not paint its own opaque ground, or the mask has nothing to reveal.
  expect(step.heroHasOwnDarkGround).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);

  const masked = await page.evaluate(() => {
    const scene = document.querySelector('[data-scene]') as HTMLElement;
    const cs = getComputedStyle(scene);
    return (cs.maskImage || (cs as unknown as { webkitMaskImage: string }).webkitMaskImage || '');
  });
  expect(masked, 'the scene needs a fade-out mask at its foot').toContain('gradient');
});

test('the hero content clears the faded foot', async ({ page }) => {
  await open(page, '/');
  const ok = await page.evaluate(() => {
    const hero = document.querySelector('[data-hero]')!.getBoundingClientRect();
    const cta = document.querySelector('.hero-cta')!.getBoundingClientRect();
    // getPropertyValue hands back the unresolved clamp(), so measure it on a throwaway element.
    const heroEl = document.querySelector('[data-hero]') as HTMLElement;
    const probe = document.createElement('div');
    probe.style.cssText = 'height: var(--hero-fade); position: absolute; visibility: hidden';
    heroEl.appendChild(probe);
    const fade = probe.getBoundingClientRect().height;
    probe.remove();
    return { gap: Math.round(hero.bottom - cta.bottom), fade: Math.round(fade) };
  });
  // Buttons must sit above the region where the artwork has thinned to paper.
  expect(ok.gap).toBeGreaterThanOrEqual(ok.fade - 4);
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
