/**
 * Isomorphic HTML renderers for the live-data cards. Used by Astro at build time (set:html)
 * and by scripts/live.ts in the browser when it refreshes lists from /data/*.json.
 * Keep this file free of Node/Astro imports.
 */
import type { EventItem, Location, NewsItem } from './data';
import { parseApiDate, longDate, relativeDay, time, fee, plural, weekdayInstrumental, numericDate, isToday, isTomorrow } from './format';

export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const MON_SHORT = ['sij', 'velj', 'ožu', 'tra', 'svi', 'lip', 'srp', 'kol', 'ruj', 'lis', 'stu', 'pro'];
const DAY_SHORT = ['ned', 'pon', 'uto', 'sri', 'čet', 'pet', 'sub'];
const svg = {
  pin: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
  clock: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
  users: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8.5" r="3.25"/><path d="M3.5 19.5a5.5 5.5 0 0 1 11 0M15.5 5.5a3.25 3.25 0 0 1 0 6.5M17 14.2a5.5 5.5 0 0 1 3.5 5.3"/></svg>',
  arrow: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9"/></svg>',
};

export function logoTile(logo: { small: string } | null, name: string, size = 56): string {
  const initial = esc((name || '?').trim().charAt(0).toUpperCase());
  return logo
    ? `<span class="logo-tile" style="width:${size}px;height:${size}px"><img src="${esc(logo.small)}" alt="" width="${size}" height="${size}" loading="lazy" decoding="async" onerror="this.parentElement.innerHTML='<span class=\\'logo-tile-fallback\\'>${initial}</span>'"></span>`
    : `<span class="logo-tile" style="width:${size}px;height:${size}px"><span class="logo-tile-fallback">${initial}</span></span>`;
}

export interface EventCardOpts { now?: Date; showLocation?: boolean; relative?: boolean; compact?: boolean }

export function eventStatus(e: EventItem, now = new Date()): { key: 'cancelled' | 'full' | 'closed' | 'few' | 'open' | 'results'; label: string } {
  if (e.isCancelled) return { key: 'cancelled', label: 'Otkazano' };
  // A quiz that has not been played yet cannot have results, whatever the flag says.
  if (e.resultsPublished && parseApiDate(e.date) < now) return { key: 'results', label: 'Rezultati objavljeni' };
  if (e.registrationDeadline && new Date(e.registrationDeadline) < now) return { key: 'closed', label: 'Prijave zatvorene' };
  if (e.spotsRemaining != null && e.spotsRemaining <= 0) return { key: 'full', label: 'Popunjeno' };
  if (e.spotsRemaining != null && e.spotsRemaining <= 3) return { key: 'few', label: `Još ${plural(e.spotsRemaining, 'mjesto', 'mjesta', 'mjesta')}` };
  if (e.maxTeams) return { key: 'open', label: `${e.registered}/${e.maxTeams} ekipa` };
  return { key: 'open', label: e.registered ? `${plural(e.registered, 'ekipa prijavljena', 'ekipe prijavljene', 'ekipa prijavljeno')}` : 'Prijave otvorene' };
}

export function eventCardHTML(e: EventItem, o: EventCardOpts = {}): string {
  const now = o.now ?? new Date();
  const d = parseApiDate(e.date);
  const st = eventStatus(e, now);
  const showLoc = o.showLocation !== false;
  // Today and tomorrow take over the date block itself rather than adding a line.
  const urgent = isToday(d, now) ? 'danas' : isTomorrow(d, now) ? 'sutra' : null;
  // Unnamed events are the norm (a location's regular quiz night). The venue is the useful headline then,
  // otherwise three cards in a row all read "Pub kviz".
  const title = e.name || (showLoc ? e.venueName : 'Pub kviz');
  const sub = e.name
    ? (showLoc ? [e.venueName, e.city?.name].filter(Boolean).join(', ') : null)
    : (showLoc ? e.city?.name || null : null);
  const feeTxt = fee(e.feeType, e.feeAmount);
  // Kept deliberately short: the rest of the detail lives one click away.
  const chips = [
    `<span class="chip">${svg.clock} ${esc(time(e.startTime))}</span>`,
    `<span class="chip chip-status chip-${st.key}">${esc(st.label)}</span>`,
    feeTxt ? `<span class="chip">${esc(feeTxt)}</span>` : '',
    e.category && e.category !== 'General' ? `<span class="chip">${esc(e.category)}</span>` : '',
  ].filter(Boolean).join('');
  return `<a href="${esc(e.url)}" class="card-dark ev-card${e.isCancelled ? ' is-cancelled' : ''}${urgent ? ' is-urgent' : ''}" data-event-id="${e.id}" data-reveal>
  <div class="ev-head">
    <div class="ev-date num" aria-label="${esc(longDate(d))}">
      <span class="ev-dow">${DAY_SHORT[d.getDay()]}</span>
      <span class="ev-day">${d.getDate()}</span>
      <span class="ev-mon">${urgent ? esc(urgent) : MON_SHORT[d.getMonth()]}</span>
    </div>
    <div class="ev-body">
      <h3 class="ev-title">${esc(title)}</h3>
      ${sub ? `<p class="ev-loc">${svg.pin} ${esc(sub)}</p>` : ''}
    </div>
    ${logoTile(e.logo, e.venueName, 40)}
  </div>
  <div class="ev-foot">
    <div class="ev-chips">${chips}</div>
    <span class="ev-arrow" aria-hidden="true">${svg.arrow}</span>
  </div>
</a>`;
}

/**
 * The extra line under a venue name, when the quiz series is called something else. Suppressed
 * when it only repeats the weekday the rhythm line already carries ("Gossip Ponedjeljkom" above
 * "Ponedjeljkom · 20:00"), which was making those cards 37px taller than their row siblings.
 */
function seriesLine(l: Location, day: string | null): string | null {
  if (l.name === l.venueName || l.name.startsWith(l.venueName)) return null;
  if (day && l.name.toLowerCase().includes(day.toLowerCase())) return null;
  return l.name;
}

export function locationCardHTML(l: Location, o: { now?: Date; relative?: boolean } = {}): string {
  const now = o.now ?? new Date();
  // A time on its own says nothing about when the quiz runs, so the weekday carries the line: no
  // weekday, no rhythm. 43 of 137 locations used to render a naked "20:00" here.
  const day = l.weekday != null ? weekdayInstrumental(new Date(2024, 0, 7 + l.weekday)) : null;
  const at = l.defaultStartTime ? time(l.defaultStartTime) : (l.nextEventStartTime ? time(l.nextEventStartTime) : null);
  const rhythm = day ? [day, at].filter(Boolean).join(' · ') : '';
  let next: string;
  if (l.nextEventDate) {
    const d = parseApiDate(l.nextEventDate);
    next = `<span class="loc-next-label">Sljedeći kviz</span><strong>${esc(o.relative ? relativeDay(d, now) : longDate(d))}${l.nextEventStartTime ? ' u ' + esc(time(l.nextEventStartTime)) : ''}</strong>`;
  } else next = '<span class="loc-next-label">Trenutno nema zakazanih termina</span>';
  return `<a href="${esc(l.url)}" class="card-light loc-card${l.nextEventDate ? '' : ' is-quiet'}" data-location-id="${l.id}" data-city="${esc(l.city.name)}" data-reveal>
  <div class="loc-top">${logoTile(l.logo, l.venueName, 48)}<span class="chip">${svg.pin} ${esc(l.city.name)}</span></div>
  <div class="loc-body">
    <h3 class="loc-title">${esc(l.venueName)}</h3>
    ${seriesLine(l, day) ? `<p class="loc-series">${esc(seriesLine(l, day)!)}</p>` : ''}
    ${rhythm ? `<p class="loc-rhythm">${esc(rhythm)}</p>` : ''}
  </div>
  <div class="loc-foot">
    <p class="loc-next${l.nextEventDate ? ' has-next' : ''}">${next}</p>
    <span class="ev-arrow" aria-hidden="true">${svg.arrow}</span>
  </div>
</a>`;
}

export function newsCardHTML(n: NewsItem, o: { featured?: boolean } = {}): string {
  const d = new Date(n.publishedDate);
  return `<a href="${esc(n.url)}" class="card-dark news-card${o.featured ? ' is-featured' : ''}" data-reveal>
  ${n.image ? `<img class="news-img" src="${esc(o.featured ? n.image.full : n.image.small)}" alt="" loading="lazy" decoding="async">` : ''}
  <div class="news-body">
    <p class="news-meta"><time datetime="${esc(n.publishedDate)}">${esc(numericDate(d))}</time>${n.locationName ? ` · ${esc(n.locationName)}` : ''}</p>
    <h3 class="news-title">${esc(n.title)}</h3>
    <p class="news-summary">${esc(n.summary)}</p>
  </div>
  <span class="ev-arrow" aria-hidden="true">${svg.arrow}</span>
</a>`;
}
