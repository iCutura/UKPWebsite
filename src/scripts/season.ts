import { SEASONS, seasonFor, LOCKED_SEASON, type Season } from '../lib/seasons';

const KEY = 'ukp-season';
type Pick = Season | 'auto';

export function storedPick(): Pick {
  try { const v = localStorage.getItem(KEY); return v && (SEASONS as string[]).includes(v) ? (v as Season) : 'auto'; } catch { return 'auto'; }
}
export function activeSeason(): Season { if (LOCKED_SEASON) return LOCKED_SEASON; const p = storedPick(); return p === 'auto' ? seasonFor() : p; }

export function applySeason(s: Season) {
  const html = document.documentElement;
  if (html.dataset.season !== s) html.dataset.season = s;
  const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (icon) icon.href = `/img/seasons/${s}-icon-64.png`;
  const apple = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
  if (apple) apple.href = `/img/seasons/${s}-icon-192.png`;
  const tc = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (tc) tc.content = getComputedStyle(html).getPropertyValue('--soft-0').trim() || tc.content;
  document.querySelectorAll<HTMLImageElement>('img[data-season-src]').forEach(img => {
    const tpl = img.dataset.seasonSrc!; const next = tpl.replace('{season}', s);
    if (img.getAttribute('src') !== next) { img.src = next; if (img.dataset.seasonSrcset) img.srcset = img.dataset.seasonSrcset.replace(/\{season\}/g, s); }
  });
  document.querySelectorAll<HTMLSourceElement>('source[data-season-srcset]').forEach(src => {
    const next = src.dataset.seasonSrcset!.replace(/\{season\}/g, s); if (src.srcset !== next) src.srcset = next;
  });
  document.querySelectorAll<HTMLElement>('[data-season-pick]').forEach(b => {
    const pick = b.dataset.seasonPick as Pick; const on = pick === storedPick();
    b.setAttribute('aria-pressed', String(on)); b.classList.toggle('is-active', on);
  });
  document.dispatchEvent(new CustomEvent('ukp:season', { detail: s }));
}

export function setPick(p: Pick) {
  if (LOCKED_SEASON) return;
  try { p === 'auto' ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, p); } catch {}
  applySeason(activeSeason());
}

function bind() {
  document.querySelectorAll<HTMLElement>('[data-season-pick]').forEach(b => {
    if (b.dataset.bound) return; b.dataset.bound = '1';
    b.addEventListener('click', () => setPick(b.dataset.seasonPick as Pick));
  });
  document.documentElement.classList.add('js');
  applySeason(activeSeason());
}
document.addEventListener('astro:page-load', bind);
document.addEventListener('astro:after-swap', () => { document.documentElement.classList.add('js'); applySeason(activeSeason()); });
