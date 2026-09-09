import { describe, it, expect } from 'vitest';
import { mapsUrl, textToHTML, deadlineText, eventJsonLd, placeLine, eventGoneHTML, eventFactsHTML, aboutUpdate, locationDetailHTML, nextPrijavaUrl, locationEventsView, eventActionsHTML, sectionHeadHTML, registrationPanelHTML } from '../../src/lib/detail';
import type { EventItem, Location } from '../../src/lib/data';

function event(over: Partial<EventItem> = {}): EventItem {
  return {
    id: 3140, url: '/dogadaji/3140/', locationId: 59, locationUrl: '/lokacije/59-la-resistance/',
    locationName: 'Caffe bar La resistance - Pula', venueName: 'Caffe bar La resistance',
    city: { id: 2, name: 'Pula', country: 'Hrvatska' }, address: 'Emova ul. 1, 52100, Pula',
    lat: 44.86, lng: 13.85, logo: null, image: null, date: '2026-09-14', startTime: '20:00:00',
    name: 'Opći kviz', category: null, subCategory: null, maxTeams: 50, registered: 0,
    spotsRemaining: 50, registrationDeadline: '2026-09-14T19:00:00', requiresApproval: true,
    isCancelled: false, feeType: 'PerTeam', feeAmount: 12, feeCurrency: 'EUR', maxPlayersPerTeam: 5,
    resultsPublished: false, season: null, whatsapp: null, ...over,
  };
}

describe('mapsUrl', () => {
  it('uses coordinates when the location has them', () => {
    expect(mapsUrl({ lat: 44.86, lng: 13.85, address: 'x', venueName: 'v', city: { name: 'Pula' } }))
      .toBe('https://www.google.com/maps/search/?api=1&query=44.86,13.85');
  });

  it('falls back to an encoded address', () => {
    const url = mapsUrl({ lat: null, lng: null, address: 'Emova ul. 1', venueName: 'Caffe bar', city: { name: 'Pula' } });
    expect(url).toContain('Caffe%20bar');
    expect(url).toContain('Pula');
  });
});

describe('placeLine', () => {
  it('does not repeat the city when the address already contains it', () => {
    expect(placeLine('Emova ul. 1, 52100, Pula', 'Pula')).toBe('Emova ul. 1, 52100, Pula');
  });

  it('appends the city when the address omits it', () => {
    expect(placeLine('Ilica 16', 'Zagreb')).toBe('Ilica 16 · Zagreb');
  });

  it('copes with a missing address', () => {
    expect(placeLine(null, 'Zagreb')).toBe('Zagreb');
  });
});

describe('deadlineText', () => {
  it('states the cut-off in Croatian day and month order', () => {
    expect(deadlineText(event())).toBe('Prijave do 14. 9. u 19:00');
  });

  it('says nothing when no deadline is recorded', () => {
    expect(deadlineText(event({ registrationDeadline: null }))).toBeNull();
  });
});

describe('textToHTML', () => {
  it('splits blank lines into paragraphs and keeps single breaks', () => {
    const html = textToHTML('Prvi red\nDrugi red\n\nNovi odlomak');
    expect(html).toBe('<p>Prvi red<br>Drugi red</p><p>Novi odlomak</p>');
  });

  it('escapes markup that arrives in the copy', () => {
    expect(textToHTML('<script>alert(1)</script>')).not.toContain('<script>');
  });

  it('links a bare URL and opens it safely', () => {
    const html = textToHTML('Detalji na https://kvizovi.hr/lokacije/');
    expect(html).toContain('href="https://kvizovi.hr/lokacije/"');
    expect(html).toContain('rel="noopener"');
  });

  it('keeps Croatian text intact', () => {
    expect(textToHTML('Čestitke ekipi Šišmiši!')).toContain('Čestitke ekipi Šišmiši!');
  });
});

describe('eventJsonLd', () => {
  it('describes the quiz for search engines', () => {
    const ld = JSON.parse(eventJsonLd(event()));
    expect(ld['@type']).toBe('Event');
    expect(ld.startDate).toBe('2026-09-14T20:00:00');
    expect(ld.eventStatus).toBe('https://schema.org/EventScheduled');
    expect(ld.location.name).toBe('Caffe bar La resistance');
    expect(ld.offers).toMatchObject({ price: 12, priceCurrency: 'EUR' });
    expect(ld.inLanguage).toBe('hr');
  });

  it('marks a cancelled quiz as cancelled', () => {
    expect(JSON.parse(eventJsonLd(event({ isCancelled: true }))).eventStatus)
      .toBe('https://schema.org/EventCancelled');
  });

  it('marks a full quiz as sold out', () => {
    expect(JSON.parse(eventJsonLd(event({ spotsRemaining: 0 }))).offers.availability)
      .toBe('https://schema.org/SoldOut');
  });

  it('omits the offer when no fee is recorded', () => {
    expect(JSON.parse(eventJsonLd(event({ feeAmount: null }))).offers).toBeUndefined();
  });
  it('prices a Bosnian quiz in marks', () => {
    expect(JSON.parse(eventJsonLd(event({ feeAmount: 25, feeCurrency: 'BAM' }))).offers).toMatchObject({ price: 25, priceCurrency: 'BAM' });
  });

  it('always produces valid JSON, even with quotes in the name', () => {
    expect(() => JSON.parse(eventJsonLd(event({ name: 'Kviz "Zvijezde"' })))).not.toThrow();
  });
});

describe('eventGoneHTML', () => {
  it('points the reader at the venue and at the full list', () => {
    const html = eventGoneHTML('/lokacije/9-caffe-bar-urban-zagreb/');
    expect(html).toContain('više nije u ponudi');
    expect(html).toContain('href="/lokacije/9-caffe-bar-urban-zagreb/"');
    expect(html).toContain('href="/dogadaji/"');
    expect(html).not.toContain('data-prijava');
  });
  it('copes without a venue link', () => {
    expect(eventGoneHTML(null)).toContain('href="/dogadaji/"');
  });
});

describe('eventFactsHTML', () => {
  it('prints the fee in the event currency and the free places', () => {
    const html = eventFactsHTML(event({ feeAmount: 25, feeCurrency: 'BAM', maxTeams: 18, registered: 12, spotsRemaining: 6 }));
    expect(html).toContain('25 KM po ekipi');
    expect(html).toContain('5+ slobodnih mjesta za ekipe');
    expect(html).toContain('minimalno 15 pitanja');
  });
  it('leaves the fee tile out when no fee is recorded', () => {
    expect(eventFactsHTML(event({ feeAmount: null }))).not.toContain('Kotizacija');
  });
});

/**
 * The About block is built into the page, so live.ts has to redraw it from the snapshot or an
 * edited description waits for the next deploy. The danger is the opposite one: a cron run that
 * loses a location's detail reports no description at all, and a naive redraw would then wipe the
 * copy the build got right. Hence the completeness flag.
 */
describe('aboutUpdate', () => {
  it('redraws the block when the snapshot has a description', () => {
    const u = aboutUpdate({ description: 'Kviz svakog utorka' }, 'complete');
    expect(u).toEqual({ action: 'set', html: '<p>Kviz svakog utorka</p>' });
  });

  it('keeps the built copy when the location is missing from the snapshot', () => {
    expect(aboutUpdate(undefined, 'complete')).toEqual({ action: 'keep' });
  });

  it('keeps the built copy when a partial snapshot reports no description', () => {
    expect(aboutUpdate({ description: null }, 'partial')).toEqual({ action: 'keep' });
    expect(aboutUpdate({ description: '' }, 'partial')).toEqual({ action: 'keep' });
  });

  it('clears the block only when a whole snapshot says the description is gone', () => {
    expect(aboutUpdate({ description: null }, 'complete')).toEqual({ action: 'clear' });
    expect(aboutUpdate({ description: '   ' }, 'complete')).toEqual({ action: 'clear' });
  });

  it('still redraws a description a partial snapshot did manage to carry', () => {
    expect(aboutUpdate({ description: 'Novi opis' }, 'partial')).toEqual({ action: 'set', html: '<p>Novi opis</p>' });
  });

  it('escapes markup arriving in the description', () => {
    const u = aboutUpdate({ description: '<img src=x onerror=alert(1)>' }, 'complete');
    expect(u.action).toBe('set');
    expect('html' in u && u.html).not.toContain('<img');
  });
});

/**
 * A venue page is built at deploy time, so a venue added in the admin afterwards has no page: the
 * cron carries it into the snapshot, every list links to it, and the link 404s. The 404 page draws
 * it from the same snapshot, so the link an organiser shares works the hour the venue is created.
 */
describe('locationDetailHTML', () => {
  function location(over: Partial<Location> = {}): Location {
    return {
      id: 159, slug: 'out-rooftop-zagreb', url: '/lokacije/159-out-rooftop-zagreb/',
      name: 'OUT Rooftop - Zagreb', venueName: 'OUT Rooftop', address: 'Ilica 16, 10000, Zagreb',
      city: { id: 386, name: 'Zagreb', country: 'Hrvatska' }, lat: 45.813, lng: 15.974,
      logo: null, image: null, description: null, defaultStartTime: '20:00:00', defaultMaxTeams: 20,
      defaultMaxPlayersPerTeam: 5, defaultFeeType: 'PerMember', defaultFeeAmount: 3, defaultFeeCurrency: 'EUR',
      defaultRequiresApproval: false, registrationDeadlineHours: null, whatsapp: null, weekday: 3,
      upcomingCount: 1, nextEventDate: '2026-09-16', nextEventStartTime: '20:00:00', nextEventName: null,
      isActive: true, ...over,
    };
  }
  const at = (over: Partial<EventItem> = {}) => event({ locationId: 159, venueName: 'OUT Rooftop', ...over });

  it('names the venue and its town', () => {
    const html = locationDetailHTML(location(), { events: [] });
    expect(html).toContain('<h1 class="mt-1">OUT Rooftop</h1>');
    expect(html).toContain('Zagreb · Hrvatska');
  });

  it('states the weekly rhythm and the house rules', () => {
    const html = locationDetailHTML(location(), { events: [] });
    expect(html).toContain('srijedom · 20:00');
    expect(html).toContain('najviše 20 ekipa');
    expect(html).toContain('do 5 igrača');
    expect(html).toContain('3 € po osobi');
  });

  it('leaves the rhythm out when no quiz night is recorded', () => {
    const html = locationDetailHTML(location({ weekday: null, defaultStartTime: null }), { events: [] });
    expect(html).not.toContain('chip-dark');
  });

  it('points the address at a map', () => {
    expect(locationDetailHTML(location(), { events: [] }))
      .toContain('https://www.google.com/maps/search/?api=1&amp;query=45.813,15.974');
  });

  it('prints the description the admin wrote', () => {
    const html = locationDetailHTML(location({ description: 'Krovna kvizaška manifestacija.\n\nSrijedom u 20:00.' }), { events: [] });
    expect(html).toContain('<p>Krovna kvizaška manifestacija.</p>');
    expect(html).toContain('<p>Srijedom u 20:00.</p>');
  });

  it('escapes markup arriving in the venue name or the description', () => {
    const html = locationDetailHTML(location({ venueName: '<script>x</script>', description: '<img onerror=x>' }), { events: [] });
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img onerror');
  });

  it('sends the reader to the next quiz, straight to the registration step', () => {
    const html = locationDetailHTML(location(), { events: [at({ id: 3200, url: '/dogadaji/3200/' })] });
    expect(html).toContain('href="/dogadaji/3200/?prijava"');
    expect(html).toContain('Prijavi ekipu na sljedeći kviz');
  });

  it('offers the rest of the list when the venue has no quiz booked yet', () => {
    const html = locationDetailHTML(location({ upcomingCount: 0, nextEventDate: null }), { events: [] });
    expect(html).not.toContain('?prijava');
    expect(html).toContain('Pogledaj druge lokacije');
    expect(html).toContain('Trenutno nema zakazanih termina');
  });

  it('does not invite a sign-up to a cancelled quiz', () => {
    const html = locationDetailHTML(location(), { events: [at({ isCancelled: true })] });
    expect(html).not.toContain('?prijava');
  });

  it('lists the venue\'s upcoming termini', () => {
    const html = locationDetailHTML(location(), { events: [at({ id: 3200, url: '/dogadaji/3200/' }), at({ id: 3201, url: '/dogadaji/3201/' })] });
    expect(html).toContain('data-event-id="3200"');
    expect(html).toContain('data-event-id="3201"');
  });

  it('shows the WhatsApp group only when the venue has one', () => {
    expect(locationDetailHTML(location(), { events: [] })).not.toContain('WhatsApp grupa');
    expect(locationDetailHTML(location({ whatsapp: 'https://chat.whatsapp.com/abc' }), { events: [] }))
      .toContain('https://chat.whatsapp.com/abc');
  });

  it('offers the neighbouring venues it was given', () => {
    const html = locationDetailHTML(location(), { events: [], nearby: [location({ id: 157, venueName: 'Club Roko', url: '/lokacije/157-club-roko/' })] });
    expect(html).toContain('data-location-id="157"');
  });

  it('leaves the neighbours section out entirely when there are none', () => {
    expect(locationDetailHTML(location(), { events: [], nearby: [] })).not.toContain('Kvizovi u blizini');
  });

  it('falls back to the season mascot when the venue has no photo', () => {
    expect(locationDetailHTML(location(), { events: [], season: 'fall' })).toContain('/img/seasons/fall-mascot-820.webp');
    expect(locationDetailHTML(location({ image: { full: '/img/api/9.jpg', small: '/img/api/9.jpg' } }), { events: [] }))
      .toContain('/img/api/9.jpg');
  });
});

describe('nextPrijavaUrl', () => {
  it('is the next quiz that is still on', () => {
    const list = [event({ id: 1, url: '/dogadaji/1/', isCancelled: true }), event({ id: 2, url: '/dogadaji/2/' })];
    expect(nextPrijavaUrl(list)).toBe('/dogadaji/2/?prijava');
  });

  it('is nothing when the venue has no quiz to sign up for', () => {
    expect(nextPrijavaUrl([])).toBeNull();
    expect(nextPrijavaUrl([event({ isCancelled: true })])).toBeNull();
  });
});

/**
 * The venue page's termini heading, its CTA and its ?prijava target were decided in the Astro
 * template at deploy time, while the card grid under them was refreshed live. So a venue whose
 * quizzes were scheduled after the last deploy showed the cards and, directly above them,
 * "Trenutno nema zakazanih termina" (reported 2026-09-08 for Pub 022 and Yesterday) - and, worse,
 * kept the CTA and the ?prijava target it was built with, which is the link the venue prints once
 * and shares for a season. Build and browser now both derive them from here.
 */
describe('locationEventsView', () => {
  const at = (over: Partial<EventItem> = {}) => event({ locationId: 71, venueName: 'Pub 022', ...over });

  it('names the section after the termini it was actually given', () => {
    expect(locationEventsView([at()]).heading).toBe('Nadolazeći kvizovi');
    expect(locationEventsView([]).heading).toBe('Trenutno nema zakazanih termina');
  });

  it('points the CTA and the shared link at the next quiz', () => {
    const view = locationEventsView([at({ id: 3239, url: '/dogadaji/3239/' })]);
    expect(view.prijava).toBe('/dogadaji/3239/?prijava');
    expect(view.cta.href).toBe('/dogadaji/3239/?prijava');
    expect(view.cta.html).toContain('Prijavi ekipu na sljedeći kviz');
    expect(view.cta.className).toContain('btn-accent');
  });

  it('offers the rest of the list when there is nothing to sign up to', () => {
    const view = locationEventsView([]);
    expect(view.prijava).toBeNull();
    expect(view.cta.href).toBe('/lokacije/');
    expect(view.cta.html).toContain('Pogledaj druge lokacije');
    expect(view.cta.className).toContain('btn-dark');
  });

  it('still says a termin exists when the only one is cancelled, but will not sign anyone up to it', () => {
    const view = locationEventsView([at({ isCancelled: true })]);
    expect(view.heading).toBe('Nadolazeći kvizovi');
    expect(view.prijava).toBeNull();
  });
});

describe('eventActionsHTML', () => {
  it('offers directions and a share button', () => {
    const html = eventActionsHTML(event(), 'Pub kviz · Caffe bar La resistance');
    expect(html).toContain('Kako doći');
    expect(html).toContain('Podijeli');
    expect(html).toContain('https://www.google.com/maps/search/?api=1&amp;query=44.86,13.85');
    expect(html).toContain('data-share="https://kvizovi.hr/dogadaji/3140/"');
  });

  it('shows the venue WhatsApp group only when there is one', () => {
    expect(eventActionsHTML(event(), 't')).not.toContain('WhatsApp grupa');
    expect(eventActionsHTML(event({ whatsapp: 'https://chat.whatsapp.com/abc' }), 't')).toContain('https://chat.whatsapp.com/abc');
  });

  it('escapes a share title that carries markup', () => {
    expect(eventActionsHTML(event(), '<script>x</script>')).not.toContain('<script>');
  });
});

describe('sectionHeadHTML', () => {
  it('renders the eyebrow, the heading and an optional link', () => {
    const html = sectionHeadHTML({ eyebrow: 'Termini', title: 'Nadolazeći kvizovi', href: '/lokacije/', linkLabel: 'Sve lokacije' });
    expect(html).toContain('<span class="eyebrow">Termini</span>');
    expect(html).toContain('Nadolazeći kvizovi');
    expect(html).toContain('href="/lokacije/"');
    expect(html).toContain('Sve lokacije');
  });

  it('carries the hook the live layer needs to rewrite the heading', () => {
    expect(sectionHeadHTML({ title: 'x', titleAttr: 'data-termini-title' }))
      .toContain('<h2 data-termini-title>');
  });
});

/**
 * The pixel's `WebRegistration` hangs off a button in this markup, and the attribute that names it
 * is not unique. This pins the shape the listener in `scripts/prijava.ts` has to select against: if
 * a future edit makes `[data-step-go="form"]` unique, that selector can be simplified, and if it
 * adds a third one, the count below says so before the campaign numbers do.
 */
describe('the registration panel, as the pixel selector sees it', () => {
  const panel = () => registrationPanelHTML(event(), true);

  it('carries more than one button that opens the form, so the pixel selector must be scoped', () => {
    const all = [...panel().matchAll(/data-step-go="form"/g)];
    expect(all.length, 'the funnel event would fire once per button that matches').toBeGreaterThan(1);
  });

  it('puts exactly one of them on the apps step, which is the one that counts', () => {
    const apps = panel().split('<section data-step-panel="apps">')[1].split('</section>')[0];
    expect([...apps.matchAll(/data-step-go="form"/g)]).toHaveLength(1);
    expect(apps).toContain('Nemam aplikaciju, prijavi me ovdje');
  });

  it('keeps the other one where a reader goes back to fix a typo', () => {
    // "Promijeni podatke" in the code step: a correction, not a new registration.
    expect(panel()).toContain('data-step-go="form">Promijeni podatke');
  });

  it('has no such button at all once registration is closed, so nothing can fire there', () => {
    expect(registrationPanelHTML(event(), false)).not.toContain('data-step-go');
  });
});
