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

export function hasCoords(p: Point): p is { lat: number; lng: number } {
  return typeof p.lat === 'number' && typeof p.lng === 'number';
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
