/** Isomorphic renderers for event / location / news detail blocks (build time + 404 client fallback). */
import type { EventItem, Location, NewsItem } from './data';
import { esc, logoTile, eventStatus, eventCardHTML, locationCardHTML, icon } from './render';
import { parseApiDate, longDate, numericDate, time, fee, plural, spotsText, weekdayInstrumental } from './format';
import { seasonFor } from './seasons';
import { SITE } from '../config';

export function mapsUrl(x: { lat: number | null; lng: number | null; address: string | null; venueName: string; city: { name: string } }): string {
  return x.lat && x.lng ? `https://www.google.com/maps/search/?api=1&query=${x.lat},${x.lng}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([x.venueName, x.address, x.city?.name].filter(Boolean).join(', '))}`;
}
export function placeLine(address: string | null, city?: string | null): string {
  if (!address) return city || '';
  if (city && address.toLowerCase().includes(city.toLowerCase())) return address;
  return [address, city].filter(Boolean).join(' · ');
}
const MON = ['siječnja', 'veljače', 'ožujka', 'travnja', 'svibnja', 'lipnja', 'srpnja', 'kolovoza', 'rujna', 'listopada', 'studenoga', 'prosinca'];
const DAY = ['Nedjelja', 'Ponedjeljak', 'Utorak', 'Srijeda', 'Četvrtak', 'Petak', 'Subota'];

export function deadlineText(e: EventItem): string | null {
  if (!e.registrationDeadline) return null;
  const d = new Date(e.registrationDeadline);
  return `Prijave do ${d.getDate()}. ${d.getMonth() + 1}. u ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function eventHeaderHTML(e: EventItem): string {
  const d = parseApiDate(e.date); const st = eventStatus(e);
  const feeTxt = fee(e.feeType, e.feeAmount, e.feeCurrency);
  return `<div class="evd-head">
  <p class="eyebrow">${e.isCancelled ? 'Otkazani kviz' : (e.category && e.category !== 'General' ? esc(e.category) + ' kviz' : 'Pub kviz')}</p>
  <h1 class="evd-title">${esc(e.name || e.venueName || 'Pub kviz')}</h1>
  <p class="evd-when num"><span class="evd-dow">${DAY[d.getDay()]}</span> <span class="evd-day">${d.getDate()}. ${MON[d.getMonth()]}</span> <span class="evd-time">${esc(time(e.startTime))}</span></p>
  <a class="evd-loc" href="${esc(e.locationUrl || '/lokacije/')}">${logoTile(e.logo, e.venueName, 48)}<span>${e.name ? `<strong>${esc(e.venueName)}</strong><br>` : ''}<span class="muted">${esc(placeLine(e.address, e.city?.name) || e.locationName)}</span></span></a>
  <div class="cluster gap-1 mt-3">
    <span class="chip chip-status chip-${st.key}">${esc(st.label)}</span>
    ${feeTxt ? `<span class="chip">${esc(feeTxt)}</span>` : ''}
    ${e.maxPlayersPerTeam ? `<span class="chip">do ${e.maxPlayersPerTeam} igrača po ekipi</span>` : ''}
    ${e.requiresApproval ? `<span class="chip">voditelj potvrđuje prijave</span>` : ''}
    ${e.season ? `<span class="chip">${esc(e.season)}</span>` : ''}
  </div>
</div>`;
}

/** The fact tiles under the event header: format, team size, fee (only when one is recorded), places. */
export function eventFactsHTML(e: EventItem): string {
  const feeTxt = fee(e.feeType, e.feeAmount, e.feeCurrency);
  return `<dl class="facts mt-4">
  <div class="fact"><dt>Format</dt><dd>3 kruga · minimalno 15 pitanja u svakom krugu</dd></div>
  <div class="fact"><dt>Ekipa</dt><dd>${e.maxPlayersPerTeam ? `do ${e.maxPlayersPerTeam} igrača` : 'do 5 igrača'}</dd></div>
  ${feeTxt ? `<div class="fact"><dt>Kotizacija</dt><dd>${esc(feeTxt)}</dd></div>` : ''}
  <div class="fact"><dt>Mjesta</dt><dd>${esc(spotsText(e))}</dd></div>
</dl>`;
}

export function registrationPanelHTML(e: EventItem, enabled: boolean): string {
  const st = eventStatus(e); const closed = ['cancelled', 'full', 'closed', 'results'].includes(st.key);
  const dl = deadlineText(e);
  if (closed) {
    const why = st.key === 'cancelled' ? 'Ovaj je termin otkazan.' : st.key === 'full' ? 'Sva su mjesta popunjena.' : st.key === 'results' ? 'Kviz je odigran i rezultati su objavljeni.' : 'Rok za prijave je prošao.';
    return `<div class="card-dark card-pad prijava-panel"><p class="eyebrow">Prijava ekipe</p><h2 class="h3">${esc(st.label)}</h2><p class="mt-2 muted">${why} ${e.locationUrl ? `Pogledaj <a href="${esc(e.locationUrl)}">ostale termine na ovoj lokaciji</a>.` : ''}</p></div>`;
  }
  if (!enabled) {
    return `<div class="card-dark card-pad prijava-panel">
  <p class="eyebrow">Prijava ekipe</p>
  <h2 class="h3">Prijavi ekipu kroz UKP Quiz aplikaciju.</h2>
  <p class="mt-2 muted">Napravi ekipu, prijavi se u par dodira i prati potvrdu voditelja. ${dl ? esc(dl) + '.' : ''}</p>
  <div class="cluster gap-1 mt-3">
    <a class="btn btn-light" href="${SITE.apps.ios}" rel="noopener" target="_blank">App Store</a>
    <a class="btn btn-ghost" href="${SITE.apps.android}" rel="noopener" target="_blank">Google Play</a>
  </div>
  ${e.whatsapp ? `<a class="btn btn-ghost btn-block mt-2" href="${esc(e.whatsapp)}" rel="noopener" target="_blank">WhatsApp grupa lokacije</a>` : ''}
  <p class="hint mt-3">Radije telefonom? <a href="${SITE.phoneHref}">${SITE.phone}</a></p>
</div>`;
  }
  const max = Math.min(e.maxPlayersPerTeam || 6, 20);
  const opts = Array.from({ length: max }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join('');
  return `<div class="card-dark card-pad prijava-panel prijava" data-prijava data-event-id="${e.id}" data-step="apps">
  <p class="eyebrow">Prijava ekipe</p>
  <ol class="steps" data-steps aria-hidden="true">
    <li data-step-dot="form"><span class="steps-n">1</span>Podaci</li>
    <li data-step-dot="code"><span class="steps-n">2</span>Kod</li>
    <li data-step-dot="done"><span class="steps-n">3</span>Gotovo</li>
  </ol>

  <section data-step-panel="apps">
    <h2 class="h3">Najbrže kroz UKP Quiz aplikaciju.</h2>
    <p class="mt-2 muted">Preuzmi aplikaciju i prijavi ekipu u par dodira. U aplikaciji su i rezultati, lige i podsjetnici za svaki kviz.</p>
    <div class="qr-grid mt-3">
      <a class="qr-tile" href="${SITE.apps.ios}" rel="noopener" target="_blank"><img src="/img/qr/app-store.svg" alt="QR kod za App Store" width="132" height="132" loading="lazy"><span>App Store</span></a>
      <a class="qr-tile" href="${SITE.apps.android}" rel="noopener" target="_blank"><img src="/img/qr/google-play.svg" alt="QR kod za Google Play" width="132" height="132" loading="lazy"><span>Google Play</span></a>
    </div>
    <button type="button" class="btn btn-ghost btn-block mt-3" data-step-go="form">Nemam aplikaciju, prijavi me ovdje</button>
    ${dl ? `<p class="hint mt-3">${esc(dl)}${e.requiresApproval ? ' · voditelj potvrđuje prijave' : ''}</p>` : ''}
  </section>

  <form data-step-panel="form" novalidate hidden>
    <h2 class="h3">Prijava bez aplikacije.</h2>
    <p class="hint mt-1">Na e-mail ti šaljemo četveroznamenkasti kod. Prijava vrijedi tek kad ga upišeš.</p>
    <div class="stack gap-2 mt-3">
      <p class="prijava-msg" role="status" aria-live="polite" hidden></p>
      <div class="field"><label for="p-team">Ime ekipe</label><input id="p-team" name="teamName" class="input" required minlength="2" maxlength="100" autocomplete="off" placeholder="npr. Pametnjakovići"></div>
      <div class="field"><label for="p-name">Ime i prezime kapetana</label><input id="p-name" name="contactName" class="input" required minlength="2" maxlength="100" autocomplete="name" placeholder="npr. Ana Anić"></div>
      <div class="field"><label for="p-email">E-mail</label><input id="p-email" name="contactEmail" class="input" type="email" required autocomplete="email" placeholder="ti@primjer.hr"></div>
      <div class="field"><label for="p-phone">Mobitel</label><input id="p-phone" name="contactPhone" class="input" type="tel" required minlength="6" autocomplete="tel" inputmode="tel" placeholder="+385 9x xxx xxxx"></div>
      <div class="field"><label for="p-count">Broj igrača <span class="muted">(nije obavezno)</span></label><select id="p-count" name="playerCount" class="input"><option value="">Još ne znamo</option>${opts}</select></div>
      <input type="text" name="website" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
      <label class="consent"><input type="checkbox" name="consent" required> <span>Slažem se da UKP koristi ove podatke za prijavu na kviz, kako je opisano u <a href="/pravila-privatnosti/">pravilima privatnosti</a>.</span></label>
      <button class="btn btn-accent btn-lg btn-block" type="submit">Pošalji kod za potvrdu</button>
      <button class="link-btn" type="button" data-step-go="apps">Natrag na aplikaciju</button>
    </div>
  </form>

  <form data-step-panel="code" novalidate hidden>
    <h2 class="h3">Upiši kod iz e-maila.</h2>
    <p class="hint mt-1">Poslali smo ga na <strong data-masked-email></strong>. Vrijedi 15 minuta; provjeri i neželjenu poštu.</p>
    <div class="stack gap-2 mt-3">
      <p class="prijava-msg" role="status" aria-live="polite" hidden></p>
      <div class="field">
        <span class="field-label" id="code-label">Kod za potvrdu</span>
        <div class="code-boxes" data-code-boxes role="group" aria-labelledby="code-label">
          ${[0, 1, 2, 3].map(i => `<input class="code-box" data-code-box="${i}" inputmode="numeric" autocomplete="${i === 0 ? 'one-time-code' : 'off'}" pattern="[0-9]*" maxlength="1" aria-label="${i + 1}. znamenka">`).join('')}
        </div>
        <input type="hidden" name="code" data-code-value>
      </div>
      <button class="btn btn-accent btn-lg btn-block" type="submit">Potvrdi prijavu</button>
      <div class="cluster gap-3">
        <button class="link-btn" type="button" data-resend>Pošalji novi kod</button>
        <button class="link-btn" type="button" data-step-go="form">Promijeni podatke</button>
      </div>
    </div>
  </form>

  <section data-step-panel="done" hidden>
    <div class="done-mark" data-done-mark aria-hidden="true">
      <svg viewBox="0 0 52 52" width="52" height="52"><circle cx="26" cy="26" r="23" /><path d="M15 27l8 8 15-16" /></svg>
    </div>
    <h2 class="h3" data-done-title>Ekipa je prijavljena.</h2>
    <p class="mt-2 muted" data-done-text></p>
    <p class="hint mt-3">Za rezultate, lige i podsjetnike: <a href="${SITE.apps.ios}" rel="noopener" target="_blank">App Store</a> · <a href="${SITE.apps.android}" rel="noopener" target="_blank">Google Play</a></p>
  </section>
</div>`;
}

/** Replaces the registration panel on a built page whose event has since vanished from the snapshot. */
export function eventGoneHTML(locationUrl?: string | null): string {
  const more = locationUrl
    ? `Pogledaj <a href="${esc(locationUrl)}">ostale termine na ovoj lokaciji</a> ili <a href="/dogadaji/">sve nadolazeće kvizove</a>.`
    : `Pogledaj <a href="/dogadaji/">sve nadolazeće kvizove</a>.`;
  return `<div class="card-dark card-pad prijava-panel"><p class="eyebrow">Prijava ekipe</p><h2 class="h3">Ovaj termin više nije u ponudi.</h2><p class="mt-2 muted">Možda je pomaknut ili otkazan. ${more}</p></div>`;
}

/** Inline markup allowed inside a paragraph or a list item: links, and **bold**. */
function inline(t: string): string {
  return esc(t)
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" rel="noopener" target="_blank">$1</a>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

/**
 * Article bodies come from the admin's Markdown editor, but were printed as plain text: bullets
 * arrived as literal "• " and "- " inside ordinary paragraphs, and a heading line like
 * "PROGRAM FINALA:" sat on the same rhythm as prose. This renders the small subset that actually
 * appears in the content: headings, bullet lists, and paragraphs.
 */
export function textToHTML(text: string, skip?: string): string {
  const bullet = /^\s*(?:[•*\u2022-]|\d+[.)])\s+/;
  const strip = (t: string) => t.replace(/^\s*(?:[•*\u2022-]|\d+[.)])\s+/, '').trim();
  const normalise = (t: string) => strip(t).replace(/\s+/g, ' ').toLowerCase();
  const skipKey = skip ? normalise(skip) : null;

  return text.split(/\n\s*\n/).map(block => {
    const lines = block.trim().split('\n').map(l => l.trim()).filter(Boolean);
    if (!lines.length) return '';
    // The summary is already printed as the lead; the body usually opens by repeating it.
    if (skipKey && lines.length === 1 && normalise(lines[0]) === skipKey) return '';

    const bullets = lines.filter(l => bullet.test(l));
    if (bullets.length && bullets.length === lines.length)
      return `<ul>${lines.map(l => `<li>${inline(strip(l))}</li>`).join('')}</ul>`;

    // A short line ending in a colon, or one wrapped in markdown hashes, is a heading.
    if (lines.length === 1 && /^#{1,3}\s+/.test(lines[0]))
      return `<h2>${inline(lines[0].replace(/^#{1,3}\s+/, ''))}</h2>`;
    if (lines.length === 1 && lines[0].length < 60 && /:$/.test(lines[0]) && !/[.!?]/.test(lines[0].slice(0, -1)))
      return `<h2>${inline(lines[0].replace(/:$/, ''))}</h2>`;

    // A run of lines that is not a list keeps its own line breaks (address and time blocks).
    return `<p>${lines.map(inline).join('<br>')}</p>`;
  }).filter(Boolean).join('')
    // Bullets separated by blank lines arrive as one block each; they are one list to a reader.
    .replace(/<\/ul><ul>/g, '');
}

export function newsArticleHTML(n: NewsItem, size?: { w: number; h: number }): string {
  const d = new Date(n.publishedDate);
  return `<article class="article">
  <header class="article-head">
    <p class="eyebrow"><time datetime="${esc(n.publishedDate)}">${esc(numericDate(d))}</time>${n.locationName ? ` · <a href="${esc(n.locationUrl || '/lokacije/')}">${esc(n.locationName)}</a>` : ''}</p>
    <h1>${esc(n.title)}</h1>
    ${n.summary ? `<p class="lead mt-3">${esc(n.summary)}</p>` : ''}
  </header>
  ${n.image ? `<img class="article-img" src="${esc(n.image.full)}" alt=""${size ? ` width="${size.w}" height="${size.h}"` : ''} decoding="async">` : ''}
  <div class="article-body">${textToHTML(n.content, n.summary)}</div>
</article>`;
}

/**
 * The next quiz someone can still sign up for, as the link that opens on the registration step.
 * `/lokacije/<venue>/?prijava` is the link a venue prints once and shares for a season, so it has
 * to land on whichever termin is next rather than on a fixed one.
 */
export function nextPrijavaUrl(events: EventItem[]): string | null {
  const next = events.find(e => !e.isCancelled);
  return next ? `${next.url}?prijava` : null;
}

const NO_TERMINI = 'Trenutno nema zakazanih termina na ovoj lokaciji. Zaprati nas i javit ćemo ti se čim krene nova sezona.';

/** The venue page's rhythm line, "srijedom · 20:00", from whichever of the two the admin recorded. */
function rhythmLine(l: Location): string {
  return [
    l.weekday != null ? weekdayInstrumental(new Date(2024, 0, 7 + l.weekday)) : null,
    l.defaultStartTime ? time(l.defaultStartTime) : null,
  ].filter(Boolean).join(' · ');
}

/**
 * A whole venue page, drawn from the snapshot.
 *
 * Venue pages are static: `getStaticPaths` builds one per venue in the snapshot on disk, so a venue
 * added in the admin after the last deploy has no page at all. The cron carries it into
 * locations.json within the quarter hour and every list on the site starts linking to it, and until
 * now each of those links was a 404 - the two venues added on 7 September 2026 were unreachable
 * from the moment they were created. The 404 page renders this instead, the way it already renders
 * an event or an article created after the build. Keep it in step with pages/lokacije/[slug].astro,
 * which is the same page built ahead of time.
 */
export function locationDetailHTML(
  l: Location,
  o: { events: EventItem[]; nearby?: Location[]; now?: Date; season?: string },
): string {
  const now = o.now ?? new Date();
  const nearby = o.nearby ?? [];
  const season = o.season ?? seasonFor(now);
  const rhythm = rhythmLine(l);
  const feeTxt = fee(l.defaultFeeType, l.defaultFeeAmount, l.defaultFeeCurrency);
  const prijava = nextPrijavaUrl(o.events);
  const series = l.name !== l.venueName && !l.name.startsWith(l.venueName) ? l.name : null;
  const sameCity = nearby.length > 0 && nearby.every(x => x.city.name === l.city.name);
  const mascot = `/img/seasons/${season}-mascot-820.webp`;
  return `<nav class="crumbs" aria-label="Putanja"><a href="/lokacije/">Lokacije</a> › <a href="/lokacije/?grad=${encodeURIComponent(l.city.name)}">${esc(l.city.name)}</a></nav>
<div class="locd-hero mt-4">
  <div>
    <div class="cluster gap-2">
      ${logoTile(l.logo, l.venueName, 88)}
      <div>
        <span class="eyebrow">${esc(l.city.name)}${l.city.country ? ` · ${esc(l.city.country)}` : ''}</span>
        <h1 class="mt-1">${esc(l.venueName)}</h1>
      </div>
    </div>
    ${series ? `<p class="muted mt-2">Kvizaški termin: <strong>${esc(series)}</strong></p>` : ''}
    <div class="cluster gap-1 mt-3">
      ${rhythm ? `<span class="chip chip-dark">${icon('calendar')} <span style="text-transform: capitalize">${esc(rhythm)}</span></span>` : ''}
      ${l.defaultMaxTeams ? `<span class="chip">najviše ${l.defaultMaxTeams} ekipa</span>` : ''}
      ${l.defaultMaxPlayersPerTeam ? `<span class="chip">${icon('users')} do ${l.defaultMaxPlayersPerTeam} igrača</span>` : ''}
      ${feeTxt ? `<span class="chip">${esc(feeTxt)}</span>` : ''}
      ${l.defaultRequiresApproval ? '<span class="chip">voditelj potvrđuje prijave</span>' : ''}
    </div>
    ${l.address ? `<p class="mt-3"><a class="sec-link" href="${esc(mapsUrl(l))}" rel="noopener" target="_blank">${icon('pin', 18)} ${esc(l.address)} ${icon('external', 16)}</a></p>` : ''}
    ${l.description ? `<div class="prose mt-3">${textToHTML(l.description)}</div>` : ''}
    <div class="cluster gap-2 mt-4">
      ${prijava
        ? `<a href="${esc(prijava)}" class="btn btn-accent btn-lg">Prijavi ekipu na sljedeći kviz ${icon('arrow-right', 20)}</a>`
        : '<a href="/lokacije/" class="btn btn-dark btn-lg">Pogledaj druge lokacije</a>'}
      ${l.whatsapp ? `<a href="${esc(l.whatsapp)}" class="btn btn-ghost btn-lg" rel="noopener" target="_blank">${icon('whatsapp', 20)} WhatsApp grupa</a>` : ''}
    </div>
  </div>
  <figure class="locd-photo${l.image ? '' : ' is-mascot'}">
    ${l.image
      ? `<img src="${esc(l.image.full)}" alt="${esc(`${l.venueName}, ${l.city.name}`)}" width="1200" height="900" decoding="async">`
      : `<img src="${mascot}" data-season-src="/img/seasons/{season}-mascot-820.webp" alt="" width="820" height="740" decoding="async">`}
  </figure>
</div>
<section class="section-tight">
  <div class="sec-head"><div><span class="eyebrow">Termini</span><h2>${o.events.length ? 'Nadolazeći kvizovi' : 'Trenutno nema zakazanih termina'}</h2></div></div>
  <div class="grid grid-3" data-live="events" data-location="${l.id}" data-show-location="false" data-empty="${esc(NO_TERMINI)}">${o.events.length
    ? o.events.map(e => eventCardHTML(e, { now, relative: true, showLocation: false })).join('')
    : `<div class="empty">${NO_TERMINI}</div>`}</div>
</section>
${nearby.length ? `<section class="section-tight">
  <div class="sec-head">
    <div><span class="eyebrow">${sameCity ? `Još kvizova u gradu ${esc(l.city.name)}` : 'Kvizovi u blizini'}</span><h2>${sameCity ? 'Isti grad, drugi dan.' : 'Nije daleko.'}</h2></div>
    <a class="sec-link" href="/lokacije/?grad=${encodeURIComponent(l.city.name)}">Sve lokacije ${icon('arrow-right', 18)}</a>
  </div>
  <div class="grid grid-3">${nearby.map(x => locationCardHTML(x, { now, relative: true })).join('')}</div>
</section>` : ''}
<section class="section-tight">
  <div class="card-dark card-pad">
    <span class="eyebrow">UKP Quiz aplikacija</span>
    <h2 class="h3">Prijave i rezultati ove lokacije, u džepu.</h2>
    <p class="mt-2 muted" style="max-width: 48ch">Zaprati lokaciju u aplikaciji i dobij obavijest kad voditelj objavi novi termin ili rezultate.</p>
    <div class="cluster gap-1 mt-3">
      <a class="btn btn-sm btn-light" href="${SITE.apps.ios}" rel="noopener" target="_blank">${icon('apple', 18)} App Store</a>
      <a class="btn btn-sm btn-ghost" href="${SITE.apps.android}" rel="noopener" target="_blank">${icon('play', 18)} Google Play</a>
    </div>
  </div>
</section>`;
}

/** A section heading, shared so the build and the browser cannot draw it differently. */
export function sectionHeadHTML(o: { eyebrow?: string; title: string; href?: string; linkLabel?: string; titleAttr?: string }): string {
  return `<div class="sec-head" data-reveal>
  <div>${o.eyebrow ? `<span class="eyebrow">${esc(o.eyebrow)}</span>` : ''}<h2${o.titleAttr ? ` ${o.titleAttr}` : ''}>${esc(o.title)}</h2></div>
  ${o.href ? `<a class="sec-link" href="${esc(o.href)}">${esc(o.linkLabel ?? 'Sve')} ${icon('arrow-right', 18)}</a>` : ''}
</div>`;
}

/** Directions, the venue's WhatsApp group and the share button, under an event's facts. */
export function eventActionsHTML(e: EventItem, shareTitle: string): string {
  return `<div class="cluster gap-2 mt-4">
  <a class="btn btn-ghost" href="${esc(mapsUrl(e))}" rel="noopener" target="_blank">${icon('map', 20)} Kako doći</a>
  ${e.whatsapp ? `<a class="btn btn-ghost" href="${esc(e.whatsapp)}" rel="noopener" target="_blank">${icon('whatsapp', 20)} WhatsApp grupa</a>` : ''}
  <button class="btn btn-ghost" type="button" data-share="${esc(SITE.url + e.url)}" data-share-title="${esc(shareTitle)}">${icon('arrow-up-right', 20)} Podijeli</button>
</div>`;
}

/**
 * The parts of a venue page that are decided by its termini.
 *
 * These lived in the Astro template, so they were frozen at deploy time while the card grid under
 * them was refreshed live from the cron snapshot. A venue whose quizzes were scheduled after the
 * last deploy therefore showed the cards and, immediately above them, "Trenutno nema zakazanih
 * termina" - and kept a CTA and a ?prijava target that pointed nowhere, which is the link the venue
 * prints once and shares for a season. The list pages never had this problem because they recompute
 * everything derived on the `ukp:live` event; the venue page simply never subscribed.
 *
 * Build and browser both call this, so the two cannot disagree. See `applyLocationEvents` in
 * scripts/live.ts for the browser half.
 */
export interface LocationEventsView {
  heading: string;
  /** Ready to apply to the built anchor: href, class list and inner markup all come from here. */
  cta: { href: string; className: string; html: string };
  /** Where `/lokacije/<venue>/?prijava` should land, or null when there is nothing to sign up to. */
  prijava: string | null;
}

export function locationEventsView(events: EventItem[]): LocationEventsView {
  const prijava = nextPrijavaUrl(events);
  return {
    // A cancelled termin is still a termin: the section is not empty, but nobody is signed up to it.
    heading: events.length ? 'Nadolazeći kvizovi' : 'Trenutno nema zakazanih termina',
    cta: prijava
      ? { href: prijava, className: 'btn btn-accent btn-lg', html: `Prijavi ekipu na sljedeći kviz ${icon('arrow-right', 20)}` }
      : { href: '/lokacije/', className: 'btn btn-dark btn-lg', html: 'Pogledaj druge lokacije' },
    prijava,
  };
}

/** Whether a snapshot carried every location's detail; see meta.json's `locationDetails`. */
export type DetailsState = 'complete' | 'partial';

/**
 * What the live snapshot should do to an About block that was rendered at build time.
 *
 * A description edited in the admin otherwise waits for the next deploy, because the block is
 * static HTML and live.ts only ever redrew `[data-live]` card grids. Redrawing it is safe in one
 * direction and not the other: the snapshot reports no description both when the venue genuinely
 * has none and when the cron lost that venue's detail request, and those look identical here. So a
 * removal is only honoured when the run reported itself whole; otherwise the built copy stands.
 */
export function aboutUpdate(
  fresh: { description: string | null } | undefined,
  details: DetailsState,
): { action: 'keep' } | { action: 'clear' } | { action: 'set'; html: string } {
  if (!fresh) return { action: 'keep' };
  const text = (fresh.description || '').trim();
  if (text) return { action: 'set', html: textToHTML(text) };
  return details === 'complete' ? { action: 'clear' } : { action: 'keep' };
}

export function eventJsonLd(e: EventItem): string {
  const obj: Record<string, unknown> = {
    '@context': 'https://schema.org', '@type': 'Event', name: e.name || `Pub kviz · ${e.venueName}`,
    startDate: `${e.date}T${e.startTime.slice(0, 5)}:00`, eventStatus: e.isCancelled ? 'https://schema.org/EventCancelled' : 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: { '@type': 'Place', name: e.venueName, address: [e.address, e.city?.name].filter(Boolean).join(', ') },
    organizer: { '@type': 'Organization', name: SITE.name, url: SITE.url },
    url: SITE.url + e.url, inLanguage: 'hr',
  };
  if (e.feeAmount != null) obj.offers = { '@type': 'Offer', price: e.feeAmount, priceCurrency: e.feeCurrency || 'EUR', availability: e.spotsRemaining === 0 ? 'https://schema.org/SoldOut' : 'https://schema.org/InStock' };
  if (e.image) obj.image = SITE.url + e.image.full;
  return JSON.stringify(obj);
}
