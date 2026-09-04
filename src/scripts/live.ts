/**
 * Refreshes live lists from /data/*.json (rewritten by the SiteGround cron between builds),
 * upgrades dates to "danas/sutra", and drops events that already happened.
 * Containers: [data-live="events"|"locations"|"news"] with optional data-location, data-city, data-limit, data-show-location.
 */
import type { EventItem, Location, NewsItem } from '../lib/data';
import { sortLocations, upcomingEvents } from '../lib/order';
import { eventCardHTML, locationCardHTML, newsCardHTML } from '../lib/render';
import { eventGoneHTML } from '../lib/detail';

const cache = new Map<string, Promise<unknown>>();
const load = <T,>(f: string) => { if (!cache.has(f)) cache.set(f, fetch(`/data/${f}`, { cache: 'no-cache' }).then(r => r.ok ? r.json() : Promise.reject(r.status))); return cache.get(f) as Promise<T>; };

/**
 * A detail page is built for every upcoming event and the host keeps it until the next deploy, so
 * an event hidden or removed in the meantime still has a live-looking page with an open
 * registration panel. Checked against the snapshot the cron rewrites every 15 minutes: when the
 * event is gone, the panel says so instead of inviting a sign-up the API will refuse.
 */
async function checkEventPage() {
  const page = document.querySelector<HTMLElement>('[data-event-page]');
  if (!page || page.dataset.liveChecked) return;
  page.dataset.liveChecked = '1';
  try {
    const list = await load<EventItem[]>('events.json');
    // An empty snapshot is more likely a failed refresh than a season with no quizzes at all.
    if (!list.length || list.some(e => String(e.id) === page.dataset.eventPage)) return;
    page.classList.add('is-gone');
    const chip = page.querySelector<HTMLElement>('.chip-status');
    if (chip) { chip.className = 'chip chip-status chip-closed'; chip.textContent = 'Termin nije dostupan'; }
    const side = page.querySelector<HTMLElement>('.evd-side');
    if (side) side.innerHTML = eventGoneHTML(page.dataset.locationUrl);
  } catch { /* keep the built page */ }
}

async function refresh() {
  const now = new Date();
  await checkEventPage();
  const boxes = document.querySelectorAll<HTMLElement>('[data-live]');
  if (!boxes.length) return;
  for (const box of boxes) {
    try {
      const kind = box.dataset.live;
      if (kind === 'events') {
        let list = upcomingEvents(await load<EventItem[]>('events.json'), now);
        if (box.dataset.location) list = list.filter(e => String(e.locationId) === box.dataset.location);
        if (box.dataset.city) list = list.filter(e => e.city?.name === box.dataset.city);
        const limit = parseInt(box.dataset.limit || '0'); if (limit) list = list.slice(0, limit);
        const html = list.map(e => eventCardHTML(e, { now, relative: true, showLocation: box.dataset.showLocation !== 'false' })).join('');
        box.innerHTML = html || `<div class="empty">${box.dataset.empty || 'Trenutno nema zakazanih kvizova.'}</div>`;
        box.dispatchEvent(new CustomEvent('ukp:live', { bubbles: true, detail: { count: list.length } }));
      } else if (kind === 'locations') {
        const list = sortLocations(await load<Location[]>('locations.json'));
        box.innerHTML = list.map(l => locationCardHTML(l, { now, relative: true })).join('');
        box.dispatchEvent(new CustomEvent('ukp:live', { bubbles: true, detail: { count: list.length } }));
      } else if (kind === 'news') {
        const list = await load<NewsItem[]>('news.json');
        const limit = parseInt(box.dataset.limit || '0');
        box.innerHTML = (limit ? list.slice(0, limit) : list).map((n, i) => newsCardHTML(n, { featured: box.dataset.featuredFirst === 'true' && i === 0 })).join('');
      }
      box.querySelectorAll('[data-reveal]').forEach(el => el.classList.add('is-in'));
    } catch (e) { /* keep the server-rendered snapshot */ }
    // Marked whether the refresh succeeded or fell back, so a waiting test never hangs.
    box.dataset.liveDone = '1';
  }
  document.querySelectorAll<HTMLElement>('[data-live-count]').forEach(async el => {
    try { const list = upcomingEvents(await load<EventItem[]>('events.json'), now); el.textContent = String(list.length); } catch {}
  });
}
document.addEventListener('astro:page-load', refresh);
