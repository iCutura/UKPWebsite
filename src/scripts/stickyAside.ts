/**
 * The event page pins its registration panel while the description scrolls past. A panel taller
 * than the viewport, which the form step is on a small laptop, then had its bottom cut off: sticky
 * holds the top edge, and the rest stays out of reach until the main column runs out. When the
 * panel does not fit, pin its bottom edge instead, so scrolling down always brings the last field
 * and the submit button into view. Re-measured whenever the panel changes height (step changes,
 * validation messages) or the window is resized.
 */
const GAP = 16;

function fit(el: HTMLElement) {
  const header = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 72;
  const top = Math.min(header + GAP, window.innerHeight - el.offsetHeight - GAP);
  el.style.top = `${Math.round(top)}px`;
}

function bind() {
  document.querySelectorAll<HTMLElement>('.evd-side').forEach(el => {
    if (el.dataset.stickyFit) return;
    el.dataset.stickyFit = '1';
    fit(el);
    new ResizeObserver(() => fit(el)).observe(el);
  });
}

document.addEventListener('astro:page-load', bind);
window.addEventListener('resize', () => document.querySelectorAll<HTMLElement>('.evd-side').forEach(fit));
