import { describe, it, expect } from 'vitest';
import { project, distanceKm, formatDistance, sortByDistance, hasCoords, inRegion, REGION } from '../../src/lib/geo';
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

  /**
   * Caffe bar Charlie in Dugo Selo was recorded with a longitude that had lost its leading 6
   * (16.2347707491643 -> 1.2347707491643), which put the venue in rural France. Nothing rejected
   * it: the map drew its city pin 710 units off the left edge of its own drawing, and the venue
   * page's "Kako doci" sent a reader to a field near Limoges. A coordinate outside the map we
   * draw is not a venue that travelled - it is a typo, and it is worth less than the address
   * printed beside it.
   */
  it('rejects a point outside the corner of the world we play in', () => {
    expect(hasCoords({ lat: 45.80534547198097, lng: 1.2347707491643 })).toBe(false);
    expect(inRegion({ lat: 45.80534547198097, lng: 16.2347707491643 })).toBe(true);
  });

  it('keeps every edge of the region itself', () => {
    for (const p of [
      { lat: REGION.north, lng: REGION.west }, { lat: REGION.north, lng: REGION.east },
      { lat: REGION.south, lng: REGION.west }, { lat: REGION.south, lng: REGION.east },
    ]) expect(hasCoords(p)).toBe(true);
  });
});

/**
 * The region and the map's bounds are the same claim made twice: the region says which coordinates
 * we accept, `scripts/build-map.mjs` says which ones the outline covers. Let them drift and either
 * a pin lands off the drawing again, or a real venue is thrown away for being outside a map that
 * does in fact contain it.
 */
describe('REGION', () => {
  it('is exactly the bounds the map outline was drawn to', () => {
    expect(REGION).toEqual((outline as { bounds: unknown }).bounds);
  });

  it('puts every accepted point inside the drawing', () => {
    const { bounds, width, height } = outline as { bounds: any; width: number; height: number };
    for (const p of [
      { lat: REGION.north, lng: REGION.west }, { lat: REGION.south, lng: REGION.east },
      { lat: 45.8150, lng: 15.9819 },
    ]) {
      const { x, y } = project(p.lat, p.lng, bounds, width, height);
      expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(width);
      expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(height);
    }
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
