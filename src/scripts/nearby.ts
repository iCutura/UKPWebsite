/**
 * "Quizzes near me": asks the browser for a position, then reorders a card grid by distance and
 * labels each card with how far it is. Everything without coordinates keeps its place behind the
 * measured ones, and the original order is restored on reset, so nothing is lost either way.
 */
import { sortByDistance, formatDistance } from '../lib/geo';

type Coords = { lat: number; lng: number };

const MESSAGES = {
  denied: 'Bez dopuštenja za lokaciju ne možemo izračunati udaljenost. Odaberi grad iz popisa.',
  unavailable: 'Lokacija trenutno nije dostupna. Pokušaj ponovno ili odaberi grad.',
  timeout: 'Predugo traje dohvaćanje lokacije. Pokušaj ponovno ili odaberi grad.',
  unsupported: 'Ovaj preglednik ne može odrediti lokaciju. Odaberi grad iz popisa.',
};

function position(): Promise<Coords> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new Error('unsupported'));
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      err => reject(new Error(err.code === err.PERMISSION_DENIED ? 'denied' : err.code === err.TIMEOUT ? 'timeout' : 'unavailable')),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 5 * 60 * 1000 },
    );
  });
}

function bind(root: HTMLElement) {
  if (root.dataset.bound) return;
  root.dataset.bound = '1';

  const grid = document.querySelector<HTMLElement>(root.dataset.nearbyGrid ?? '');
  const button = root.querySelector<HTMLButtonElement>('[data-nearby-go]')!;
  const reset = root.querySelector<HTMLButtonElement>('[data-nearby-reset]');
  const status = root.querySelector<HTMLElement>('[data-nearby-status]')!;
  const itemAttr = root.dataset.nearbyItem || 'data-location-id';
  if (!grid) return;
  const cardGrid: HTMLElement = grid;

  /** The order the page was built in, so "reset" really does put it back. */
  let original: HTMLElement[] | null = null;

  const cards = () => Array.from(cardGrid.querySelectorAll<HTMLElement>(`[${itemAttr}]`));

  const say = (text: string, kind: 'info' | 'error' | '' = '') => {
    status.textContent = text;
    status.className = `nearby-status${kind ? ' is-' + kind : ''}`;
    status.hidden = !text;
  };

  async function locate() {
    button.disabled = true;
    const label = button.querySelector('[data-nearby-label]') ?? button;
    const previous = label.textContent;
    label.textContent = 'Tražimo…';
    say('');
    try {
      const me = await position();
      const data: Record<string, { lat: number | null; lng: number | null }> = JSON.parse(root.dataset.nearbyCoords || '{}');
      if (!original) original = cards();

      const measured = sortByDistance(
        cards().map(el => ({ el, ...(data[el.getAttribute(itemAttr)!] ?? { lat: null, lng: null }) })),
        me,
      );

      const frag = document.createDocumentFragment();
      let counted = 0;
      for (const row of measured) {
        const el = row.el as HTMLElement;
        el.querySelector('.nearby-badge')?.remove();
        if (typeof row.distanceKm === 'number') {
          counted++;
          const badge = document.createElement('span');
          badge.className = 'nearby-badge';
          badge.textContent = formatDistance(row.distanceKm);
          (el.querySelector('.loc-top') ?? el.querySelector('.ev-head') ?? el).appendChild(badge);
        }
        frag.appendChild(el);
      }
      cardGrid.appendChild(frag);
      cardGrid.dataset.sortedByDistance = 'true';

      say(counted ? `Poredano po udaljenosti od tebe. ${counted} lokacija ima koordinate.` : 'Nijedna lokacija nema koordinate.', 'info');
      reset?.removeAttribute('hidden');
    } catch (e) {
      say(MESSAGES[(e as Error).message as keyof typeof MESSAGES] ?? MESSAGES.unavailable, 'error');
    } finally {
      button.disabled = false;
      label.textContent = previous;
    }
  }

  function restore() {
    if (!original) return;
    const frag = document.createDocumentFragment();
    for (const el of original) { el.querySelector('.nearby-badge')?.remove(); frag.appendChild(el); }
    cardGrid.appendChild(frag);
    delete cardGrid.dataset.sortedByDistance;
    say('');
    reset?.setAttribute('hidden', '');
  }

  button.addEventListener('click', locate);
  reset?.addEventListener('click', restore);
}

function init() {
  document.querySelectorAll<HTMLElement>('[data-nearby]').forEach(bind);
}
document.addEventListener('astro:page-load', init);
