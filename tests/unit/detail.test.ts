import { describe, it, expect } from 'vitest';
import { mapsUrl, textToHTML, deadlineText, eventJsonLd, placeLine, eventGoneHTML } from '../../src/lib/detail';
import type { EventItem } from '../../src/lib/data';

function event(over: Partial<EventItem> = {}): EventItem {
  return {
    id: 3140, url: '/dogadaji/3140/', locationId: 59, locationUrl: '/lokacije/59-la-resistance/',
    locationName: 'Caffe bar La resistance - Pula', venueName: 'Caffe bar La resistance',
    city: { id: 2, name: 'Pula', country: 'Hrvatska' }, address: 'Emova ul. 1, 52100, Pula',
    lat: 44.86, lng: 13.85, logo: null, image: null, date: '2026-09-14', startTime: '20:00:00',
    name: 'Opći kviz', category: null, subCategory: null, maxTeams: 50, registered: 0,
    spotsRemaining: 50, registrationDeadline: '2026-09-14T19:00:00', requiresApproval: true,
    isCancelled: false, feeType: 'PerTeam', feeAmount: 12, maxPlayersPerTeam: 5,
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
