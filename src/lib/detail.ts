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
  const feeTxt = fee(e.feeType, e.feeAmount);
  return `<div class="evd-head">
  <p class="eyebrow">${e.isCancelled ? 'Otkazani kviz' : (e.category && e.category !== 'General' ? esc(e.category) + ' kviz' : 'Pub kviz')}</p>
  <h1 class="evd-title">${esc(e.name || `Kviz ${DAY[d.getDay()].toLowerCase() === 'nedjelja' ? 'u nedjelju' : ''}`.trim() || 'Pub kviz')}</h1>
  <p class="evd-when num"><span class="evd-dow">${DAY[d.getDay()]}</span> <span class="evd-day">${d.getDate()}. ${MON[d.getMonth()]}</span> <span class="evd-time">${esc(time(e.startTime))}</span></p>
  <a class="evd-loc" href="${esc(e.locationUrl || '/lokacije/')}">${logoTile(e.logo, e.venueName, 48)}<span><strong>${esc(e.venueName)}</strong><br><span class="muted">${esc(placeLine(e.address, e.city?.name) || e.locationName)}</span></span></a>
  <div class="cluster gap-1 mt-3">
    <span class="chip chip-status chip-${st.key}">${esc(st.label)}</span>
    ${feeTxt ? `<span class="chip">${esc(feeTxt)}</span>` : ''}
    ${e.maxPlayersPerTeam ? `<span class="chip">do ${e.maxPlayersPerTeam} igrača po ekipi</span>` : ''}
    ${e.maxTeams ? `<span class="chip">najviše ${plural(e.maxTeams, 'ekipa', 'ekipe', 'ekipa')}</span>` : ''}
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

  <section data-step-panel="apps">
    <h2 class="h3">Najbrže kroz UKP Quiz aplikaciju.</h2>
    <p class="mt-2 muted">Skeniraj kod, preuzmi aplikaciju i prijavi ekipu u par dodira. U aplikaciji su i rezultati, lige i podsjetnici za svaki kviz.</p>
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
      <div class="field"><label for="p-team">Ime ekipe</label><input id="p-team" name="teamName" class="input" required minlength="2" maxlength="100" autocomplete="off" placeholder="npr. Pametnjakovići"></div>
      <div class="field"><label for="p-name">Ime i prezime kapetana</label><input id="p-name" name="contactName" class="input" required minlength="2" maxlength="100" autocomplete="name"></div>
      <div class="field"><label for="p-email">E-mail</label><input id="p-email" name="contactEmail" class="input" type="email" required autocomplete="email" placeholder="ti@primjer.hr"></div>
      <div class="field"><label for="p-phone">Mobitel</label><input id="p-phone" name="contactPhone" class="input" type="tel" required minlength="6" autocomplete="tel" inputmode="tel" placeholder="+385 9x xxx xxxx"></div>
      <div class="field"><label for="p-count">Broj igrača <span class="muted">(nije obavezno)</span></label><select id="p-count" name="playerCount" class="input"><option value="">Još ne znamo</option>${opts}</select></div>
      <input type="text" name="website" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
      <label class="consent"><input type="checkbox" name="consent" required> <span>Slažem se da UKP koristi ove podatke za prijavu na kviz. <a href="/pravila-privatnosti/">Pravila privatnosti</a></span></label>
      <button class="btn btn-accent btn-lg btn-block" type="submit">Pošalji kod za potvrdu</button>
      <button class="link-btn" type="button" data-step-go="apps">Natrag na aplikaciju</button>
      <p class="prijava-msg" role="status" aria-live="polite" hidden></p>
    </div>
  </form>

  <form data-step-panel="code" novalidate hidden>
    <h2 class="h3">Upiši kod iz e-maila.</h2>
    <p class="hint mt-1">Poslali smo ga na <strong data-masked-email></strong>. Vrijedi 15 minuta; provjeri i neželjenu poštu.</p>
    <div class="stack gap-2 mt-3">
      <div class="field"><label for="p-code">Kod za potvrdu</label><input id="p-code" name="code" class="input code-input" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]*" maxlength="4" minlength="4" required placeholder="••••"></div>
      <button class="btn btn-accent btn-lg btn-block" type="submit">Potvrdi prijavu</button>
      <div class="cluster gap-3">
        <button class="link-btn" type="button" data-resend>Pošalji novi kod</button>
        <button class="link-btn" type="button" data-step-go="form">Promijeni podatke</button>
      </div>
      <p class="prijava-msg" role="status" aria-live="polite" hidden></p>
    </div>
  </form>

  <section data-step-panel="done" hidden>
    <h2 class="h3" data-done-title>Ekipa je prijavljena.</h2>
    <p class="mt-2 muted" data-done-text></p>
    <p class="hint mt-3">Za rezultate, lige i podsjetnike: <a href="${SITE.apps.ios}" rel="noopener" target="_blank">App Store</a> · <a href="${SITE.apps.android}" rel="noopener" target="_blank">Google Play</a></p>
  </section>
</div>`;
}

export function textToHTML(text: string): string {
  return text.split(/\n\s*\n/).map(p => `<p>${esc(p.trim()).replace(/\n/g, '<br>').replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" rel="noopener" target="_blank">$1</a>')}</p>`).join('');
}

export function newsArticleHTML(n: NewsItem): string {
  const d = new Date(n.publishedDate);
  return `<article class="article">
  <header class="article-head">
    <p class="eyebrow"><time datetime="${esc(n.publishedDate)}">${esc(numericDate(d))}</time>${n.locationName ? ` · <a href="${esc(n.locationUrl || '/lokacije/')}">${esc(n.locationName)}</a>` : ''}</p>
    <h1>${esc(n.title)}</h1>
    ${n.summary ? `<p class="lead mt-3">${esc(n.summary)}</p>` : ''}
  </header>
  ${n.image ? `<img class="article-img" src="${esc(n.image.full)}" alt="" width="1200" height="675" decoding="async">` : ''}
  <div class="article-body">${textToHTML(n.content)}</div>
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
  if (e.feeAmount != null) obj.offers = { '@type': 'Offer', price: e.feeAmount, priceCurrency: 'EUR', availability: e.spotsRemaining === 0 ? 'https://schema.org/SoldOut' : 'https://schema.org/InStock' };
  if (e.image) obj.image = SITE.url + e.image.full;
  return JSON.stringify(obj);
}
