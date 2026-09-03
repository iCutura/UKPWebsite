/**
 * Refreshes live lists from /data/*.json (rewritten by the SiteGround cron between builds),
 * upgrades dates to "danas/sutra", and drops events that already happened.
 * Containers: [data-live="events"|"locations"|"news"] with optional data-location, data-city, data-limit, data-show-location.
 */
import type { EventItem, Location, NewsItem } from '../lib/data';
import { eventCardHTML, locationCardHTML, newsCardHTML } from '../lib/render';

const cache = new Map<string, Promise<unknown>>();
const load = <T,>(f: string) => { if (!cache.has(f)) cache.set(f, fetch(`/data/${f}`, { cache: 'no-cache' }).then(r => r.ok ? r.json() : Promise.reject(r.status))); return cache.get(f) as Promise<T>; };

export function upcoming(events: EventItem[], now = new Date()): EventItem[] {
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const hm = now.getHours() * 60 + now.getMinutes();
  return events.filter(e => e.date > today || (e.date === today && (parseInt(e.startTime.slice(0, 2)) * 60 + parseInt(e.startTime.slice(3, 5)) + 180 > hm)));
}

async function refresh() {
  const now = new Date();
  const boxes = document.querySelectorAll<HTMLElement>('[data-live]');
  if (!boxes.length) return;
  for (const box of boxes) {
    try {
      const kind = box.dataset.live;
      if (kind === 'events') {
        let list = upcoming(await load<EventItem[]>('events.json'), now);
        if (box.dataset.location) list = list.filter(e => String(e.locationId) === box.dataset.location);
        if (box.dataset.city) list = list.filter(e => e.city?.name === box.dataset.city);
        const limit = parseInt(box.dataset.limit || '0'); if (limit) list = list.slice(0, limit);
        const html = list.map(e => eventCardHTML(e, { now, relative: true, showLocation: box.dataset.showLocation !== 'false' })).join('');
        box.innerHTML = html || `<div class="empty">${box.dataset.empty || 'Trenutno nema zakazanih kvizova.'}</div>`;
        box.dispatchEvent(new CustomEvent('ukp:live', { bubbles: true, detail: { count: list.length } }));
      } else if (kind === 'locations') {
        const list = (await load<Location[]>('locations.json')).slice().sort((a, b) =>
          (b.upcomingCount > 0 ? 1 : 0) - (a.upcomingCount > 0 ? 1 : 0) ||
          (a.nextEventDate ?? '9999').localeCompare(b.nextEventDate ?? '9999') ||
          a.city.name.localeCompare(b.city.name, 'hr') || a.name.localeCompare(b.name, 'hr'));
        box.innerHTML = list.map(l => locationCardHTML(l, { now, relative: true })).join('');
        box.dispatchEvent(new CustomEvent('ukp:live', { bubbles: true, detail: { count: list.length } }));
      } else if (kind === 'news') {
        const list = await load<NewsItem[]>('news.json');
        const limit = parseInt(box.dataset.limit || '0');
        box.innerHTML = (limit ? list.slice(0, limit) : list).map((n, i) => newsCardHTML(n, { featured: box.dataset.featuredFirst === 'true' && i === 0 })).join('');
      }
      box.querySelectorAll('[data-reveal]').forEach(el => el.classList.add('is-in'));
    } catch (e) { /* keep the server-rendered snapshot */ }
  }
  document.querySelectorAll<HTMLElement>('[data-live-count]').forEach(async el => {
    try { const list = upcoming(await load<EventItem[]>('events.json'), now); el.textContent = String(list.length); } catch {}
  });
}
document.addEventListener('astro:page-load', refresh);
