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
/**
 * The icon set the isomorphic renderers draw with, mirroring components/Icon.astro on the same
 * 24px stroke grid. Kept here rather than in the Astro component because this file also runs in
 * the browser, where the venue page is redrawn from the snapshot.
 */
const ICON_PATHS = {
  pin: '<path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  users: '<circle cx="9" cy="8.5" r="3.25"/><path d="M3.5 19.5a5.5 5.5 0 0 1 11 0M15.5 5.5a3.25 3.25 0 0 1 0 6.5M17 14.2a5.5 5.5 0 0 1 3.5 5.3"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9M18 13.5V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4.5"/>',
  'arrow-right': '<path d="M5 12h14M13 6l6 6-6 6"/>',
  'arrow-up-right': '<path d="M7 17 17 7M8 7h9v9"/>',
  apple: '<path d="M15.6 12.6c0-2.3 1.9-3.3 2-3.4-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9-.7 0-1.9-.9-3.1-.9-1.6 0-3 .9-3.9 2.4-1.7 2.9-.4 7.2 1.2 9.5.8 1.1 1.7 2.4 3 2.4 1.2 0 1.6-.8 3.1-.8s1.8.8 3.1.8c1.3 0 2.1-1.2 2.9-2.3.9-1.3 1.3-2.6 1.3-2.7 0 0-2.6-1-2.7-4.1ZM13.4 5.9c.6-.8 1.1-1.9.9-3-.9 0-2 .6-2.7 1.4-.6.7-1.1 1.8-1 2.9 1 .1 2.1-.5 2.8-1.3Z" fill="currentColor" stroke="none"/>',
  play: '<path d="M5 3.8v16.4c0 .6.7 1 1.2.7l14-8.2a.8.8 0 0 0 0-1.4l-14-8.2A.8.8 0 0 0 5 3.8Z"/>',
  // WhatsApp's own mark: a solid shape in the brand green, opted out of the stroke grid on purpose.
  whatsapp: '<path fill="#25D366" stroke="none" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413"/>',
};

export function icon(name: keyof typeof ICON_PATHS, size = 14, stroke = 1.75): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name]}</svg>`;
}

const svg = {
  pin: icon('pin'),
  clock: icon('clock'),
  users: icon('users'),
  arrow: icon('arrow-up-right', 18, 2),
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
  const feeTxt = fee(e.feeType, e.feeAmount, e.feeCurrency);
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
