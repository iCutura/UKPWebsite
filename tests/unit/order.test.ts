import { describe, it, expect } from 'vitest';
import { sortLocations, upcomingEvents, isStillUpcoming } from '../../src/lib/order';

const loc = (name: string, city: string, upcomingCount: number, nextEventDate: string | null) =>
  ({ name, city: { name: city }, upcomingCount, nextEventDate });

describe('sortLocations', () => {
  it('puts locations with a scheduled quiz first, however late in the alphabet they sit', () => {
    // The bug this guards: the page sorted by city, so Banja Luka with no quiz opened the list
    // while Zagreb venues playing this week were pages down.
    const sorted = sortLocations([
      loc('The Engineer bar', 'Banja Luka', 0, null),
      loc('Zeppelin pub', 'Bjelovar', 1, '2026-09-07'),
      loc('Caffe bar Vertigo', 'Benkovac', 0, null),
    ]);
    expect(sorted.map(l => l.name)).toEqual(['Zeppelin pub', 'The Engineer bar', 'Caffe bar Vertigo']);
  });

  it('orders the scheduled ones by date, soonest first', () => {
    const sorted = sortLocations([
      loc('Later', 'Split', 1, '2026-09-20'),
      loc('Sooner', 'Zagreb', 1, '2026-09-08'),
      loc('Middle', 'Rijeka', 2, '2026-09-14'),
    ]);
    expect(sorted.map(l => l.name)).toEqual(['Sooner', 'Middle', 'Later']);
  });

  it('falls back to city then name for locations with nothing scheduled', () => {
    const sorted = sortLocations([
      loc('B bar', 'Zagreb', 0, null),
      loc('A bar', 'Zagreb', 0, null),
      loc('C bar', 'Osijek', 0, null),
    ]);
    expect(sorted.map(l => l.name)).toEqual(['C bar', 'A bar', 'B bar']);
  });

  it('sorts Croatian city names by Croatian collation', () => {
    const sorted = sortLocations([
      loc('a', 'Čakovec', 0, null), loc('b', 'Cavtat', 0, null), loc('c', 'Daruvar', 0, null),
    ]);
    // Č sorts after C and before D in Croatian.
    expect(sorted.map(l => l.city.name)).toEqual(['Cavtat', 'Čakovec', 'Daruvar']);
  });

  it('does not mutate the caller list', () => {
    const input = [loc('Z', 'Zagreb', 0, null), loc('A', 'Split', 1, '2026-09-08')];
    const copy = [...input];
    sortLocations(input);
    expect(input).toEqual(copy);
  });

  it('treats a stale upcomingCount without a date as unscheduled', () => {
    const sorted = sortLocations([loc('No date', 'Zagreb', 1, null), loc('Dated', 'Split', 1, '2026-09-08')]);
    expect(sorted[0].name).toBe('Dated');
  });
});

describe('isStillUpcoming', () => {
  const now = new Date('2026-09-07T10:00:00');

  it('drops a quiz that finished this morning', () => {
    // The API returns everything from today onward, so a 03:00 quiz was being advertised as "danas".
    expect(isStillUpcoming({ date: '2026-09-07', startTime: '03:00:00' }, now)).toBe(false);
  });

  it('keeps a quiz that started within the grace window', () => {
    expect(isStillUpcoming({ date: '2026-09-07', startTime: '08:00:00' }, now)).toBe(true);
  });

  it('keeps tonight and later', () => {
    expect(isStillUpcoming({ date: '2026-09-07', startTime: '20:00:00' }, now)).toBe(true);
    expect(isStillUpcoming({ date: '2026-09-14', startTime: '20:00:00' }, now)).toBe(true);
  });

  it('drops yesterday', () => {
    expect(isStillUpcoming({ date: '2026-09-06', startTime: '20:00:00' }, now)).toBe(false);
  });

  it('reads the start time as local, so an evening quiz is not shifted out of today', () => {
    const justBefore = new Date('2026-09-07T19:59:00');
    expect(isStillUpcoming({ date: '2026-09-07', startTime: '20:00:00' }, justBefore)).toBe(true);
  });
});

describe('upcomingEvents', () => {
  it('filters the list and keeps the given order', () => {
    const now = new Date('2026-09-07T10:00:00');
    const list = [
      { id: 1, date: '2026-09-07', startTime: '03:00:00' },
      { id: 2, date: '2026-09-07', startTime: '20:00:00' },
      { id: 3, date: '2026-09-08', startTime: '20:00:00' },
    ];
    expect(upcomingEvents(list, now).map(e => e.id)).toEqual([2, 3]);
  });
});
