import { consentState, readConsent, writeConsent } from '../lib/cookieConsent';

/**
 * Wiring for the cookie bar.
 *
 * The bar appears exactly once per decision: when nothing is stored, when the stored decision was
 * made against an older cookie inventory, or when it has lapsed (all three are `unknown` as far as
 * `cookieConsent.ts` is concerned). After a decision it never returns on its own, not even after a
 * refusal, because a banner that keeps asking is how a refusal gets worn down.
 *
 * The way back is `[data-cookie-settings]`, which sits in the footer of every page and on
 * /kolacici. Those live outside this component, so they are bound here rather than in the markup:
 * the pages that carry them do not need to know how consent is stored.
 *
 * Every decision leaves through one door, `ukp:consent`, which is what `pixel.ts` listens to. That
 * is the seam: nothing here knows what a pixel is.
 */
type Step = 'banner' | 'prefs';

function bind() {
  const root = document.querySelector<HTMLElement>('[data-cookie-consent]');
  if (!root) return;

  const panels = Array.from(root.querySelectorAll<HTMLElement>('[data-cc-panel]'));
  const marketing = root.querySelector<HTMLInputElement>('[data-cc-marketing]');
  const stateChip = root.querySelector<HTMLElement>('[data-cc-state]');

  const card = root.querySelector<HTMLElement>('[data-cc-card]');

  /** Publish the bar's height so the page can keep its own last line out from under it. */
  const reserve = () => {
    const h = root.hidden || !card ? 0 : Math.ceil(card.getBoundingClientRect().height + 32);
    document.documentElement.style.setProperty('--cc-space', `${h}px`);
  };

  const step = (name: Step) => {
    root.dataset.ccStep = name;
    panels.forEach(p => { p.hidden = p.dataset.ccPanel !== name; });
    reserve();
  };
  const sync = () => {
    const on = marketing ? marketing.checked : false;
    if (stateChip) stateChip.textContent = on ? 'Uključeno' : 'Isključeno';
  };
  const open = (name: Step) => {
    if (marketing) marketing.checked = readConsent()?.marketing === true;
    sync();
    root.hidden = false;
    step(name);
  };
  const close = () => { root.hidden = true; reserve(); };

  /** One door out for every decision, so nothing here has to know what listens on the other side. */
  const decide = (allowed: boolean) => {
    writeConsent(allowed);
    close();
    document.dispatchEvent(new CustomEvent('ukp:consent', { detail: { marketing: allowed } }));
  };

  const on = (selector: string, fn: (el: HTMLElement) => void, scope: ParentNode = root) => {
    scope.querySelectorAll<HTMLElement>(selector).forEach(el => {
      if (el.dataset.ccBound) return;
      el.dataset.ccBound = '1';
      el.addEventListener('click', () => fn(el));
    });
  };

  on('[data-cc-accept]', () => decide(true));
  on('[data-cc-reject]', () => decide(false));
  on('[data-cc-save]', () => decide(marketing?.checked === true));
  on('[data-cc-open]', () => { step('prefs'); marketing?.focus(); });
  on('[data-cc-back]', () => (consentState() === 'unknown' ? step('banner') : close()));
  // Lives in the footer and on /kolacici, which is how a decision is changed after the fact.
  on('[data-cookie-settings]', () => { open('prefs'); marketing?.focus(); }, document);

  if (marketing && !marketing.dataset.ccBound) {
    marketing.dataset.ccBound = '1';
    marketing.addEventListener('change', sync);
  }

  if (!root.dataset.ccKeys) {
    root.dataset.ccKeys = '1';
    root.addEventListener('keydown', ev => {
      if ((ev as KeyboardEvent).key !== 'Escape' || root.dataset.ccStep !== 'prefs') return;
      consentState() === 'unknown' ? step('banner') : close();
    });
  }

  // The panel is taller than the banner and both reflow on resize, so the reservation is measured
  // rather than guessed.
  if (card && !card.dataset.ccObserved && typeof ResizeObserver !== 'undefined') {
    card.dataset.ccObserved = '1';
    new ResizeObserver(reserve).observe(card);
  }

  if (consentState() === 'unknown') open('banner');
  else close();
}

document.addEventListener('astro:page-load', bind);
