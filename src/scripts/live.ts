/**
 * Refreshes live lists from /data/*.json (rewritten by the SiteGround cron between builds),
 * upgrades dates to "danas/sutra", and drops events that already happened.
 * Containers: [data-live="events"|"locations"|"news"] with optional data-location, data-city, data-limit, data-show-location.
 * Detail pages additionally redraw their About block ([data-about]) from the location snapshot.
 */
import type { EventItem, Location, NewsItem } from '../lib/data';
import { sortLocations, upcomingEvents } from '../lib/order';
import { eventCardHTML, locationCardHTML, newsCardHTML } from '../lib/render';
import { eventGoneHTML, eventHeaderHTML, eventFactsHTML, aboutUpdate, type DetailsState } from '../lib/detail';

const cache = new Map<string, Promise<unknown>>();
const load = <T,>(f: string) => { if (!cache.has(f)) cache.set(f, fetch(`/data/${f}`, { cache: 'no-cache' }).then(r => r.ok ? r.json() : Promise.reject(r.status))); return cache.get(f) as Promise<T>; };

/**
 * How whole the last snapshot was. Anything but an explicit "complete" - an older meta.json without
 * the field, a failed fetch - counts as partial, so an uncertain answer can only ever add a
 * description to a page, never take one away.
 */
async function detailsState(): Promise<DetailsState> {
  try {
    const meta = await load<{ locationDetails?: string }>('meta.json');
    return meta.locationDetails === 'complete' ? 'complete' : 'partial';
  } catch { return 'partial'; }
}

/**
 * The venue's About copy is built into the page, so an admin's edit used to sit unseen until the
 * next deploy - one venue was still showing a description two revisions old. Redrawn here from the
 * snapshot; see aboutUpdate for why a missing description is not automatically a removal.
 */
async function applyAbout(scope: HTMLElement, locationId: string | undefined) {
  const box = scope.querySelector<HTMLElement>('[data-about]');
  // Marked whether the block was redrawn or left alone, so a waiting test never hangs.
  const done = () => { scope.dataset.aboutDone = '1'; };
  if (!box || !locationId) return done();
  try { await redrawAbout(box, locationId); } finally { done(); }
}

async function redrawAbout(box: HTMLElement, locationId: string) {
  const list = await load<Location[]>('locations.json');
  // An empty snapshot is a failed refresh, not a site with no venues.
  if (!list.length) return;
  const update = aboutUpdate(list.find(l => String(l.id) === locationId), await detailsState());
  if (update.action === 'keep') return;
  if (update.action === 'clear') { box.innerHTML = ''; box.hidden = true; return; }
  box.innerHTML = update.html;
  box.hidden = false;
  box.classList.add('is-in'); // [data-reveal] starts at opacity 0 and its observer has already run
}

/** The venue page: only the About block is redrawn; its termini ride the [data-live] grid. */
async function checkLocationPage() {
  const page = document.querySelector<HTMLElement>('[data-location-page]');
  if (!page || page.dataset.liveChecked) return;
  page.dataset.liveChecked = '1';
  try { await applyAbout(page, page.dataset.locationPage); } catch { /* keep the built page */ }
}

/**
 * A detail page is built for every upcoming event and the host keeps it until the next deploy, so
 * it shows the event as it was at build time. Checked against the snapshot the cron rewrites
 * every 15 minutes: the header (status, fee, time) and the fact tiles are redrawn from the fresh
 * record, so a fee or a cap corrected in the admin shows within the quarter hour; and when the
 * event is gone (hidden or deleted), the panel says so instead of inviting a sign-up the API will
 * refuse. The registration panel itself is left alone: it is already wired up, and the API
 * re-checks every rule at submit time anyway.
 */
async function checkEventPage() {
  const page = document.querySelector<HTMLElement>('[data-event-page]');
  if (!page || page.dataset.liveChecked) return;
  page.dataset.liveChecked = '1';
  try {
    const list = await load<EventItem[]>('events.json');
    // An empty snapshot is more likely a failed refresh than a season with no quizzes at all.
    if (!list.length) return;
    // The About copy belongs to the venue, so it is redrawn whether or not the termin still stands.
    await applyAbout(page, page.dataset.locationId).catch(() => {});
    const fresh = list.find(e => String(e.id) === page.dataset.eventPage);
    if (fresh) {
      const head = page.querySelector<HTMLElement>('.evd-head'), facts = page.querySelector<HTMLElement>('.facts');
      if (head) head.outerHTML = eventHeaderHTML(fresh);
      if (facts) facts.outerHTML = eventFactsHTML(fresh);
      return;
    }
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
  await checkLocationPage();
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
