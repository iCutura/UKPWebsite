/** Isomorphic renderers for event / news detail blocks (build time + 404 client fallback). */
import type { EventItem, Location, NewsItem } from './data';
import { esc, logoTile, eventStatus } from './render';
import { parseApiDate, longDate, numericDate, time, fee, plural } from './format';
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
