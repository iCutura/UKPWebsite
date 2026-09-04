import { describe, it, expect } from 'vitest';
import { mapsUrl, textToHTML, deadlineText, eventJsonLd, placeLine, eventGoneHTML, eventFactsHTML, aboutUpdate } from '../../src/lib/detail';
import type { EventItem } from '../../src/lib/data';

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
    expect(html).toContain('6 slobodnih mjesta za ekipe');
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
