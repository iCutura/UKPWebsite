import { describe, it, expect } from 'vitest';
import { project, distanceKm, formatDistance, sortByDistance, hasCoords } from '../../src/lib/geo';
import outline from '../../src/data/map-outline.json';

const ZAGREB = { lat: 45.8150, lng: 15.9819 };
const SPLIT = { lat: 43.5081, lng: 16.4402 };
const OSIJEK = { lat: 45.5550, lng: 18.6955 };

describe('distanceKm', () => {
  it('measures a known distance', () => {
    // Zagreb to Split is about 256 km as the crow flies.
    expect(distanceKm(ZAGREB, SPLIT)).toBeGreaterThan(250);
    expect(distanceKm(ZAGREB, SPLIT)).toBeLessThan(262);
  });

  it('is zero for the same point and symmetric between two', () => {
    expect(distanceKm(ZAGREB, ZAGREB)).toBe(0);
    expect(distanceKm(ZAGREB, OSIJEK)).toBeCloseTo(distanceKm(OSIJEK, ZAGREB), 6);
  });
});

describe('formatDistance', () => {
  it('uses metres below a kilometre', () => {
    expect(formatDistance(0.42)).toBe('420 m');
  });

  it('keeps one decimal up to ten kilometres, with a Croatian comma', () => {
    expect(formatDistance(3.47)).toBe('3,5 km');
  });

  it('rounds to whole kilometres beyond that', () => {
    expect(formatDistance(256.3)).toBe('256 km');
  });
});

describe('sortByDistance', () => {
  it('puts the nearest first', () => {
    const list = [
      { name: 'Split', ...SPLIT }, { name: 'Osijek', ...OSIJEK }, { name: 'Zagreb', ...ZAGREB },
    ];
    expect(sortByDistance(list, ZAGREB).map(l => l.name)).toEqual(['Zagreb', 'Osijek', 'Split']);
  });

  it('attaches the distance it sorted by', () => {
    const [nearest] = sortByDistance([{ name: 'Split', ...SPLIT }], ZAGREB);
    expect(nearest.distanceKm).toBeGreaterThan(250);
  });

  it('keeps locations without coordinates, behind the ones it could measure', () => {
    const list = [
      { name: 'Nema koordinata', lat: null, lng: null },
      { name: 'Split', ...SPLIT },
    ];
    const sorted = sortByDistance(list, ZAGREB);
    expect(sorted.map(l => l.name)).toEqual(['Split', 'Nema koordinata']);
    expect(sorted[1].distanceKm).toBeUndefined();
  });

  it('does not mutate the caller list', () => {
    const list = [{ name: 'Split', ...SPLIT }, { name: 'Zagreb', ...ZAGREB }];
    const before = list.map(l => l.name);
    sortByDistance(list, ZAGREB);
    expect(list.map(l => l.name)).toEqual(before);
  });
});

describe('hasCoords', () => {
  it('rejects the null island and missing values alike', () => {
    expect(hasCoords({ lat: null, lng: null })).toBe(false);
    expect(hasCoords({ lat: 45, lng: null })).toBe(false);
    expect(hasCoords({ lat: 45, lng: 16 })).toBe(true);
  });
});

describe('project', () => {
  const { bounds, width, height } = outline as { bounds: any; width: number; height: number };

  it('places the four corners of the map at its corners', () => {
    const tl = project(bounds.north, bounds.west, bounds, width, height);
    const br = project(bounds.south, bounds.east, bounds, width, height);
    expect(tl.x).toBeCloseTo(0, 3);
    expect(tl.y).toBeCloseTo(0, 3);
    expect(br.x).toBeCloseTo(width, 3);
    expect(br.y).toBeCloseTo(height, 3);
  });

  it('keeps every UKP city inside the drawn area', () => {
    for (const city of [ZAGREB, SPLIT, OSIJEK, { lat: 42.65, lng: 18.09 }, { lat: 46.31, lng: 16.34 }]) {
      const p = project(city.lat, city.lng, bounds, width, height);
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(width);
      expect(p.y).toBeGreaterThan(0);
      expect(p.y).toBeLessThan(height);
    }
  });

  it('puts north above south and east right of west', () => {
    const zg = project(ZAGREB.lat, ZAGREB.lng, bounds, width, height);
    const st = project(SPLIT.lat, SPLIT.lng, bounds, width, height);
    const os = project(OSIJEK.lat, OSIJEK.lng, bounds, width, height);
    expect(zg.y).toBeLessThan(st.y);
    expect(os.x).toBeGreaterThan(zg.x);
  });
});
