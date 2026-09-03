import { describe, it, expect } from 'vitest';
import { eventCardHTML, locationCardHTML, eventStatus, esc } from '../../src/lib/render';
import type { EventItem, Location } from '../../src/lib/data';

const NOW = new Date(2026, 8, 7, 12, 0, 0); // Monday 7 September 2026, midday

function event(over: Partial<EventItem> = {}): EventItem {
  return {
    id: 1, url: '/dogadaji/1/', locationId: 10, locationUrl: '/lokacije/10-zeppelin/',
    locationName: 'Zeppelin pub - Bjelovar', venueName: 'Zeppelin pub',
    city: { id: 1, name: 'Bjelovar', country: 'Hrvatska' }, address: null, lat: null, lng: null,
    logo: null, image: null, date: '2026-09-14', startTime: '20:00:00', name: null,
    category: null, subCategory: null, maxTeams: 18, registered: 12, spotsRemaining: 6,
    registrationDeadline: null, requiresApproval: false, isCancelled: false,
    feeType: null, feeAmount: null, maxPlayersPerTeam: null, resultsPublished: false,
    season: null, whatsapp: null, ...over,
  };
}

function location(over: Partial<Location> = {}): Location {
  return {
    id: 10, slug: 'zeppelin-pub-bjelovar', url: '/lokacije/10-zeppelin-pub-bjelovar/',
    name: 'Zeppelin pub - Bjelovar', venueName: 'Zeppelin pub', address: null,
    city: { id: 1, name: 'Bjelovar', country: 'Hrvatska' }, lat: null, lng: null,
    logo: null, image: null, description: null, defaultStartTime: null, defaultMaxTeams: null,
    defaultMaxPlayersPerTeam: null, defaultFeeType: null, defaultFeeAmount: null,
    defaultRequiresApproval: false, registrationDeadlineHours: null, whatsapp: null,
    weekday: 1, upcomingCount: 1, nextEventDate: '2026-09-14', nextEventStartTime: '20:00:00',
    nextEventName: null, isActive: true, ...over,
  };
}

/** Text a reader actually sees, with markup and therefore attributes removed. */
const visibleText = (html: string) => html.replace(/<[^>]*>/g, ' ');

/** How many times the visible card states the date, in any form. */
const dateMentions = (html: string) => (visibleText(html).match(/RUJ|rujna|ponedjeljak/gi) ?? []).length;

describe('eventCardHTML: what titles a card', () => {
  it('titles an unnamed quiz by its venue, not by a generic label', () => {
    // Most quiz nights have no name of their own. A shared fallback produced three
    // neighbouring cards all reading "Pub kviz".
    const html = eventCardHTML(event(), { now: NOW });
    expect(html).toContain('>Zeppelin pub<');
    expect(html).not.toContain('Pub kviz');
  });

  it('keeps a real name when the quiz has one, and moves the venue underneath', () => {
    const html = eventCardHTML(event({ name: 'Znanjem za Pčelice' }), { now: NOW });
    expect(html).toContain('>Znanjem za Pčelice<');
    expect(html).toContain('Zeppelin pub, Bjelovar');
  });

  it('shows the city under an unnamed quiz', () => {
    expect(eventCardHTML(event(), { now: NOW })).toContain('Bjelovar');
  });

  it('falls back to a generic title only where the venue is already the page', () => {
    const html = eventCardHTML(event(), { now: NOW, showLocation: false });
    expect(html).toContain('Pub kviz');
    expect(html).not.toContain('Bjelovar');
  });

  it('gives distinct titles to three unnamed quizzes at different venues', () => {
    const titles = [
      event({ id: 1, venueName: 'Zeppelin pub' }),
      event({ id: 2, venueName: 'Caffe bar Urban' }),
      event({ id: 3, venueName: 'Ilpalco' }),
    ].map(e => eventCardHTML(e, { now: NOW }).match(/class="ev-title">([^<]*)/)![1]);
    expect(new Set(titles).size).toBe(3);
  });
});

describe('eventCardHTML: the date appears once', () => {
  it('states the date only in the date block', () => {
    // The card used to carry "PON 7 RUJ" and "PONEDJELJAK, 7. RUJNA" sixty pixels apart.
    expect(dateMentions(eventCardHTML(event(), { now: NOW }))).toBe(1);
  });

  it('marks a quiz happening today without adding a second date', () => {
    const html = eventCardHTML(event({ date: '2026-09-07' }), { now: NOW });
    expect(html).toContain('danas');
    expect(html).toContain('is-urgent');
    expect(dateMentions(html)).toBe(0); // the month slot now reads "danas"
  });

  it('still spells the full date out for screen readers', () => {
    // The visible block is abbreviated to PON 14 RUJ, so the accessible name carries the long form.
    expect(eventCardHTML(event(), { now: NOW })).toContain('aria-label="ponedjeljak, 14. rujna"');
  });

  it('marks tomorrow the same way', () => {
    const html = eventCardHTML(event({ date: '2026-09-08' }), { now: NOW });
    expect(html).toContain('sutra');
  });

  it('leaves a distant quiz unmarked', () => {
    const html = eventCardHTML(event({ date: '2026-09-30' }), { now: NOW });
    expect(html).not.toContain('is-urgent');
    expect(html).not.toContain('danas');
  });
});

describe('eventStatus', () => {
  it('reports capacity while places remain', () => {
    expect(eventStatus(event(), NOW)).toMatchObject({ key: 'open', label: '12/18 ekipa' });
  });

  it('warns when only a few places are left, with Croatian plurals', () => {
    expect(eventStatus(event({ spotsRemaining: 1 }), NOW).label).toBe('Još 1 mjesto');
    expect(eventStatus(event({ spotsRemaining: 3 }), NOW).label).toBe('Još 3 mjesta');
  });

  it('reports a full quiz', () => {
    expect(eventStatus(event({ spotsRemaining: 0 }), NOW)).toMatchObject({ key: 'full', label: 'Popunjeno' });
  });

  it('puts cancellation ahead of everything else', () => {
    expect(eventStatus(event({ isCancelled: true, spotsRemaining: 0 }), NOW).key).toBe('cancelled');
  });

  it('closes registration once the deadline has passed', () => {
    const past = eventStatus(event({ registrationDeadline: '2026-09-06T19:00:00' }), NOW);
    expect(past.key).toBe('closed');
    const future = eventStatus(event({ registrationDeadline: '2026-09-14T19:00:00' }), NOW);
    expect(future.key).toBe('open');
  });

  it('reports published results', () => {
    expect(eventStatus(event({ resultsPublished: true }), NOW).key).toBe('results');
  });

  it('says registration is open when no capacity is recorded', () => {
    expect(eventStatus(event({ maxTeams: null, spotsRemaining: null, registered: 0 }), NOW).label)
      .toBe('Prijave otvorene');
  });
});

describe('escaping', () => {
  it('escapes venue names so data cannot inject markup', () => {
    const html = eventCardHTML(event({ venueName: 'Bar <script>alert(1)</script>' }), { now: NOW });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes quotes and ampersands', () => {
    expect(esc(`Tom & "Jerry" <b>'x'`)).toBe('Tom &amp; &quot;Jerry&quot; &lt;b&gt;&#39;x&#39;');
  });

  it('keeps Croatian letters intact', () => {
    expect(esc('Šibenik Čakovec Đakovo Ljubuški')).toBe('Šibenik Čakovec Đakovo Ljubuški');
  });
});

describe('locationCardHTML', () => {
  it('announces the next quiz when one is scheduled', () => {
    const html = locationCardHTML(location(), { now: NOW });
    expect(html).toContain('Sljedeći kviz');
    expect(html).not.toContain('is-quiet');
  });

  it('says so plainly, and recedes, when nothing is scheduled', () => {
    const html = locationCardHTML(location({ nextEventDate: null, upcomingCount: 0 }), { now: NOW });
    expect(html).toContain('Trenutno nema zakazanih termina');
    expect(html).toContain('is-quiet');
  });

  it('carries the city as a filter hook so the list can be narrowed', () => {
    expect(locationCardHTML(location(), { now: NOW })).toContain('data-city="Bjelovar"');
  });

  it('names the recurring night in the instrumental case', () => {
    expect(locationCardHTML(location({ weekday: 1, defaultStartTime: '20:00:00' }), { now: NOW }))
      .toContain('ponedjeljkom');
  });
});
