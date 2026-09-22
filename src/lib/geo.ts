/**
 * Projection and distance helpers shared by the locations map and the "quizzes near me" sorting.
 * Pure, so it runs at build time and in the browser, and can be tested without either.
 */

export interface Bounds { west: number; east: number; south: number; north: number }
export interface Point { lat: number | null; lng: number | null }

/** Web Mercator y, in radians of projected latitude. */
const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI / 180) / 2));

/**
 * Latitude and longitude to a position inside the map's viewBox. Must stay identical to the
 * projection in scripts/build-map.mjs, or the pins drift off the coastline.
 */
export function project(lat: number, lng: number, bounds: Bounds, width: number, height: number): { x: number; y: number } {
  const yTop = mercY(bounds.north), yBottom = mercY(bounds.south);
  return {
    x: ((lng - bounds.west) / (bounds.east - bounds.west)) * width,
    y: ((yTop - mercY(lat)) / (yTop - yBottom)) * height,
  };
}

const R = 6371; // km

/** Great-circle distance in kilometres. */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/**
 * The corner of the world UKP plays in, and the exact rectangle `src/data/map-outline.json` was
 * drawn to (`BOUNDS` in scripts/build-map.mjs). `tests/unit/geo.test.ts` pins the two together,
 * because they are one claim made twice: loosen this and a pin lands off the drawing, tighten it
 * and a real venue is thrown away for being outside a map that does contain it.
 */
export const REGION: Bounds = { west: 13.3, east: 19.7, south: 42.3, north: 46.7 };

export function inRegion(p: { lat: number; lng: number }): boolean {
  return p.lat >= REGION.south && p.lat <= REGION.north && p.lng >= REGION.west && p.lng <= REGION.east;
}

/**
 * Whether a place has coordinates worth using.
 *
 * A number is not enough. Caffe bar Charlie in Dugo Selo was recorded with a longitude that had
 * lost its leading 6 - 16.2347707491643 became 1.2347707491643 - which put the venue in rural
 * France, and nothing in the site disagreed: its city pin was drawn 710 units off the left edge of
 * a map 1063 wide, and "Kako doci" on its page sent readers to a field near Limoges. A coordinate
 * outside the map we draw is not a venue that travelled, it is a typo, and it is worth less than
 * the address printed next to it - so it is treated as no coordinate at all and every caller falls
 * back to the path it already has for a venue that never had one.
 *
 * This hides a data error rather than fixing it, which is the right trade for a reader and the
 * wrong one for the record: when this fires, the venue still needs correcting in the admin.
 */
export function hasCoords(p: Point): p is { lat: number; lng: number } {
  return typeof p.lat === 'number' && typeof p.lng === 'number' && inRegion({ lat: p.lat, lng: p.lng });
}

/** Croatian distance wording: under a kilometre is metres, then whole kilometres. */
export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 100) * 10} m`;
  if (km < 10) return `${km.toFixed(1).replace('.', ',')} km`;
  return `${Math.round(km)} km`;
}

/**
 * Nearest first for everything that has coordinates; everything else keeps its existing order
 * behind them, because a location without coordinates is still a real place to play.
 */
export function sortByDistance<T extends Point>(list: T[], from: { lat: number; lng: number }): (T & { distanceKm?: number })[] {
  const withCoords: (T & { distanceKm: number })[] = [];
  const without: T[] = [];
  for (const item of list) {
    if (hasCoords(item)) withCoords.push({ ...item, distanceKm: distanceKm(from, item) });
    else without.push(item);
  }
  withCoords.sort((a, b) => a.distanceKm - b.distanceKm);
  return [...withCoords, ...without];
}
