import { describe, it, expect } from 'vitest';
import {
  parseApiDate, weekday, weekdayInstrumental, longDate, numericDate, time,
  isToday, isTomorrow, relativeDay, fee, slugify, plural, freeSpots, spotsText,
} from '../../src/lib/format';

describe('parseApiDate', () => {
  it('reads an API date as a calendar date, with no timezone shift', () => {
    // The API sends 2026-09-14T00:00:00 with no zone. new Date() would read that as UTC and,
    // west of Greenwich, render it as the 13th.
    const d = parseApiDate('2026-09-14T00:00:00');
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 8, 14]);
  });

  it('accepts a bare date too', () => {
    expect(parseApiDate('2026-01-01').getDate()).toBe(1);
  });
});

describe('Croatian dates', () => {
  const monday = parseApiDate('2026-09-07');

  it('names the weekday', () => {
    expect(weekday(monday)).toBe('ponedjeljak');
    expect(weekday(parseApiDate('2026-09-13'))).toBe('nedjelja');
  });

  it('uses the instrumental case for a recurring quiz night', () => {
    expect(weekdayInstrumental(monday)).toBe('ponedjeljkom');
    expect(weekdayInstrumental(parseApiDate('2026-09-10'))).toBe('četvrtkom');
    expect(weekdayInstrumental(parseApiDate('2026-09-11'))).toBe('petkom');
    expect(weekdayInstrumental(parseApiDate('2026-09-12'))).toBe('subotom');
  });

  it('puts the month in the genitive, as Croatian dates require', () => {
    expect(longDate(monday)).toBe('ponedjeljak, 7. rujna');
    expect(longDate(parseApiDate('2026-02-01'))).toBe('nedjelja, 1. veljače');
    expect(longDate(parseApiDate('2026-11-30'))).toBe('ponedjeljak, 30. studenoga');
  });

  it('writes numeric dates the Croatian way', () => {
    expect(numericDate(monday)).toBe('7. 9. 2026.');
  });

  it('trims seconds off a time', () => {
    expect(time('20:00:00')).toBe('20:00');
    expect(time(null)).toBe('');
    expect(time(undefined)).toBe('');
  });
});

describe('relativeDay', () => {
  const now = new Date(2026, 8, 7, 12, 0, 0);

  it('says danas and sutra', () => {
    expect(relativeDay(parseApiDate('2026-09-07'), now)).toBe('danas');
    expect(relativeDay(parseApiDate('2026-09-08'), now)).toBe('sutra');
  });

  it('falls back to the full date further out', () => {
    expect(relativeDay(parseApiDate('2026-09-14'), now)).toBe('ponedjeljak, 14. rujna');
  });

  it('does not call yesterday danas', () => {
    expect(isToday(parseApiDate('2026-09-06'), now)).toBe(false);
    expect(isTomorrow(parseApiDate('2026-09-06'), now)).toBe(false);
  });

  it('handles a month boundary', () => {
    const eve = new Date(2026, 8, 30, 23, 0, 0);
    expect(relativeDay(parseApiDate('2026-10-01'), eve)).toBe('sutra');
  });
});

describe('fee', () => {
  it('distinguishes per team from per person', () => {
    expect(fee('PerTeam', 12)).toBe('12 € po ekipi');
    expect(fee('PerMember', 3)).toBe('3 € po osobi');
  });

  it('writes a decimal with a comma', () => {
    expect(fee('PerTeam', 12.5)).toBe('12,50 € po ekipi');
  });

  it('says nothing when no amount is recorded', () => {
    expect(fee('PerTeam', null)).toBeNull();
    expect(fee(null, null)).toBeNull();
  });

  it('treats a free quiz as a real value, not as missing', () => {
    expect(fee('PerTeam', 0)).toBe('0 € po ekipi');
  });
  it('writes the Bosnian mark as KM and leaves an unknown code as it came', () => {
    expect(fee('PerTeam', 25, 'BAM')).toBe('25 KM po ekipi');
    expect(fee('PerMember', 5, 'BAM')).toBe('5 KM po osobi');
    expect(fee('PerTeam', 12, 'EUR')).toBe('12 € po ekipi');
    expect(fee('PerTeam', 12, null)).toBe('12 € po ekipi');
    expect(fee('PerTeam', 12, 'CHF')).toBe('12 CHF po ekipi');
  });
});

describe('plural', () => {
  it('follows the Croatian one / few / many pattern', () => {
    expect(plural(1, 'ekipa', 'ekipe', 'ekipa')).toBe('1 ekipa');
    expect(plural(2, 'ekipa', 'ekipe', 'ekipa')).toBe('2 ekipe');
    expect(plural(4, 'ekipa', 'ekipe', 'ekipa')).toBe('4 ekipe');
    expect(plural(5, 'ekipa', 'ekipe', 'ekipa')).toBe('5 ekipa');
    expect(plural(21, 'ekipa', 'ekipe', 'ekipa')).toBe('21 ekipa');
    expect(plural(22, 'ekipa', 'ekipe', 'ekipa')).toBe('22 ekipe');
  });

  it('applies the 11 to 14 exception', () => {
    expect(plural(11, 'ekipa', 'ekipe', 'ekipa')).toBe('11 ekipa');
    expect(plural(12, 'ekipa', 'ekipe', 'ekipa')).toBe('12 ekipa');
    expect(plural(14, 'ekipa', 'ekipe', 'ekipa')).toBe('14 ekipa');
    expect(plural(112, 'ekipa', 'ekipe', 'ekipa')).toBe('112 ekipa');
  });

  it('uses the many form for zero', () => {
    expect(plural(0, 'mjesto', 'mjesta', 'mjesta')).toBe('0 mjesta');
  });
});

describe('slugify', () => {
  it('folds Croatian diacritics rather than dropping the letters', () => {
    expect(slugify('Caffe bar Đoković')).toBe('caffe-bar-dokovic');
    expect(slugify('Šibenik')).toBe('sibenik');
    expect(slugify('Čakovec')).toBe('cakovec');
    expect(slugify('Ljubuški')).toBe('ljubuski');
  });

  it('collapses punctuation and spacing into single hyphens', () => {
    expect(slugify('VIVA Caffe • Lounge • Bar')).toBe('viva-caffe-lounge-bar');
    expect(slugify('  Zug - Ponedjeljkom  ')).toBe('zug-ponedjeljkom');
  });

  it('never starts or ends with a hyphen', () => {
    const s = slugify('--- Klub ---');
    expect(s.startsWith('-')).toBe(false);
    expect(s.endsWith('-')).toBe(false);
  });
});

describe('slugify symbols', () => {
  it('drops a bullet instead of spelling it', () => {
    expect(slugify('VIVA Caffe • Lounge • Bar - Posušje')).toBe('viva-caffe-lounge-bar-posusje');
  });
});

describe('freeSpots / spotsText', () => {
  it('says how many places are free, with the Croatian plural', () => {
    expect(spotsText({ maxTeams: 18, registered: 12, spotsRemaining: 6 })).toBe('6 slobodnih mjesta za ekipe');
    expect(spotsText({ maxTeams: 18, registered: 17, spotsRemaining: 1 })).toBe('1 slobodno mjesto za ekipe');
    expect(spotsText({ maxTeams: 18, registered: 15, spotsRemaining: 3 })).toBe('3 slobodna mjesta za ekipe');
    expect(spotsText({ maxTeams: 30, registered: 9, spotsRemaining: 21 })).toBe('21 slobodno mjesto za ekipe');
  });
  it('falls back to the cap minus sign-ups when the API sends no remainder', () => {
    expect(freeSpots({ maxTeams: 18, registered: 12, spotsRemaining: null })).toBe('6 slobodnih mjesta za ekipe');
  });
  it('never advertises a negative number of places', () => {
    expect(spotsText({ maxTeams: 10, registered: 12, spotsRemaining: null })).toBe('Nema slobodnih mjesta');
    expect(spotsText({ maxTeams: 10, registered: 10, spotsRemaining: 0 })).toBe('Nema slobodnih mjesta');
  });
  it('describes an uncapped event by its sign-ups', () => {
    expect(freeSpots({ maxTeams: null, registered: 4, spotsRemaining: null })).toBeNull();
    expect(spotsText({ maxTeams: null, registered: 4, spotsRemaining: null })).toBe('4 prijavljene ekipe');
    expect(spotsText({ maxTeams: null, registered: 1, spotsRemaining: null })).toBe('1 prijavljena ekipa');
    expect(spotsText({ maxTeams: null, registered: 0, spotsRemaining: null })).toBe('Bez ograničenja broja ekipa');
  });
});
