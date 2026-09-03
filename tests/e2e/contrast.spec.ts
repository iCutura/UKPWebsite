import { test, expect } from '@playwright/test';
import { open, PAGES } from './support';

/**
 * Text that cannot be read. Every case below shipped: a ghost button kept its light-mode dark ink
 * inside a dark card and came out near-black on near-black, the status chips were written for the
 * dark event card and reused on the light detail hero as pale mint on pale paper, and the form
 * placeholders stayed dark inside a dark panel. All three are structural, so they are checked
 * structurally rather than by sampling pixels.
 */

const luminance = (c: string) => {
  const [r, g, b] = c.match(/[\d.]+/g)!.map(Number);
  const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};

test('no text is painted on a ground of its own colour', async ({ page }) => {
  await open(page, '/dogadaji/3145/');
  const unreadable = await page.evaluate(() => {
    const parse = (c: string) => { const m = c.match(/[\d.]+/g); return m && m.length >= 3
      ? { r: +m[0], g: +m[1], b: +m[2], a: m.length > 3 ? +m[3] : 1 } : null; };
    const over = (f: any, b: any) => ({ r: f.r * f.a + b.r * (1 - f.a), g: f.g * f.a + b.g * (1 - f.a), b: f.b * f.a + b.b * (1 - f.a), a: 1 });
    const lum = (c: any) => { const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };

    const out: any[] = [];
    document.querySelectorAll('.card-dark *, .on-dark *, .band-dark *').forEach(el => {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || (el as HTMLElement).offsetHeight === 0) return;
      if ((el as HTMLInputElement).disabled) return;
      if (![...el.childNodes].some(n => n.nodeType === 3 && n.textContent!.trim().length > 1)) return;

      // Walk to the first opaque background, compositing the translucent layers on the way.
      const stack: any[] = [];
      let n: Element | null = el, bailed = false;
      while (n) {
        const s = getComputedStyle(n);
        if (s.backgroundImage !== 'none') { bailed = true; break; }   // art or a gradient: cannot judge
        const c = parse(s.backgroundColor);
        if (c && c.a > 0) { stack.push(c); if (c.a === 1) break; }
        n = n.parentElement;
      }
      if (bailed) return;
      let bg = { r: 253, g: 247, b: 243, a: 1 };
      for (let i = stack.length - 1; i >= 0; i--) bg = over(stack[i], bg);

      const fgRaw = parse(cs.color); if (!fgRaw) return;
      const fg = fgRaw.a < 1 ? over(fgRaw, bg) : fgRaw;
      const [x, y] = [lum(fg), lum(bg)];
      const ratio = (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
      if (ratio < 3) out.push({ sel: el.tagName.toLowerCase() + '.' + String(el.className).split(/\s+/).slice(0, 2).join('.'),
        text: el.textContent!.trim().slice(0, 28), colour: cs.color, ratio: +ratio.toFixed(2) });
    });
    return out;
  });

  expect(unreadable, `text that all but disappears:\n${JSON.stringify(unreadable, null, 1)}`).toEqual([]);
});

test('a placeholder inside a dark panel is legible', async ({ page }) => {
  await open(page, '/dogadaji/3145/');
  const input = page.locator('.prijava-panel .input[placeholder]').first();
  await expect(input).toHaveCount(1);
  const colour = await input.evaluate(el => getComputedStyle(el, '::placeholder').color);
  expect(luminance(colour), `placeholder ${colour} is too dark for a dark panel`).toBeGreaterThan(0.3);
});

test('a status chip flips with the surface it sits on', async ({ page }) => {
  // On the light detail hero it must be dark text; the pale-on-pale version was unreadable.
  await open(page, '/dogadaji/3145/');
  const hero = page.locator('.chip-status').first();
  await expect(hero).toBeVisible();
  const onLight = await hero.evaluate(el => ({ colour: getComputedStyle(el).color, dark: !!el.closest('.card-dark, .on-dark, .band-dark') }));
  expect(onLight.dark, 'this chip is expected to sit on a light surface').toBe(false);
  expect(luminance(onLight.colour), 'pale chip text on a light hero').toBeLessThan(0.18);

  // On the dark event card the same chip stays pale.
  await open(page, '/dogadaji/');
  const card = page.locator('.ev-card .chip-status').first();
  await expect(card).toBeVisible();
  expect(luminance(await card.evaluate(el => getComputedStyle(el).color))).toBeGreaterThan(0.4);
});

test('no visible text is set in the faintest ink', async ({ page }) => {
  const faint: string[] = [];
  for (const path of PAGES) {
    await open(page, path);
    faint.push(...await page.evaluate(p => {
      const out: string[] = [];
      document.querySelectorAll('body *').forEach(el => {
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') return;
        if ((el as HTMLElement).offsetHeight === 0) return;
        if ((el as HTMLInputElement).disabled) return;
        if (!([...el.childNodes].some(n => n.nodeType === 3 && n.textContent!.trim().length > 1))) return;
        const a = cs.color.match(/[\d.]+/g);
        // 0.45 and 0.4 alpha inks were the faint tier; anything under half opacity is unreadable.
        if (a && a.length > 3 && Number(a[3]) < 0.5)
          out.push(`${p} ${el.tagName.toLowerCase()}.${String(el.className).split(/\s+/)[0]} ${cs.color} "${el.textContent!.trim().slice(0, 24)}"`);
      });
      return out;
    }, path));
  }
  expect(faint, `text at under half ink:\n${faint.join('\n')}`).toEqual([]);
});
