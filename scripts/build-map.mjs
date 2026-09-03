/**
 * Builds the outline the locations map draws, from Natural Earth (public domain, no attribution
 * required). Run once: `npm run map`. The result is committed, so the site never fetches geometry
 * and the map works with no third-party request and no tile server.
 *
 *   src/data/map-outline.json  { viewBox, projection, countries: [{ id, name, d }] }
 */
import fs from 'node:fs/promises';

const SOURCE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries.geojson';
const WANTED = { HRV: 'Hrvatska', BIH: 'Bosna i Hercegovina' };
// Neighbours drawn faintly so the coastline is legible rather than floating in space.
const CONTEXT = { SVN: 'Slovenija', SRB: 'Srbija', MNE: 'Crna Gora', HUN: 'Mađarska', ITA: 'Italija', AUT: 'Austrija' };

// The area the map shows, a little wider than where UKP actually plays.
const BOUNDS = { west: 13.3, east: 19.7, south: 42.3, north: 46.7 };
const W = 1000;
// Mercator keeps country shapes recognisable; at this latitude a plain equirectangular map
// squashes Croatia noticeably.
const merc = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI / 180) / 2));
const yTop = merc(BOUNDS.north), yBottom = merc(BOUNDS.south);
const H = Math.round(W * (yTop - yBottom) / ((BOUNDS.east - BOUNDS.west) * Math.PI / 180));

const px = ([lng, lat]) => [
  ((lng - BOUNDS.west) / (BOUNDS.east - BOUNDS.west)) * W,
  ((yTop - merc(lat)) / (yTop - yBottom)) * H,
];

/**
 * Ramer-Douglas-Peucker: keeps the corners that give a coastline its shape and throws away the
 * rest. The Croatian coast is the reason this file needs simplifying at all.
 */
function simplify(pts, tolerance) {
  if (pts.length < 3) return pts;
  const sqTol = tolerance * tolerance;
  const sqSegDist = (p, a, b) => {
    let [x, y] = a; let dx = b[0] - x, dy = b[1] - y;
    if (dx !== 0 || dy !== 0) {
      const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
      if (t > 1) { x = b[0]; y = b[1]; } else if (t > 0) { x += dx * t; y += dy * t; }
    }
    dx = p[0] - x; dy = p[1] - y;
    return dx * dx + dy * dy;
  };
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    let maxSq = 0, index = 0;
    for (let i = first + 1; i < last; i++) {
      const sq = sqSegDist(pts[i], pts[first], pts[last]);
      if (sq > maxSq) { index = i; maxSq = sq; }
    }
    if (maxSq > sqTol) { keep[index] = 1; stack.push([first, index], [index, last]); }
  }
  return pts.filter((_, i) => keep[i]);
}

function pathFor(geometry, { tolerance, minArea, precision }) {
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  const parts = [];
  for (const poly of polys) {
    const pts = simplify(poly[0].map(px), tolerance); // outer ring only
    if (pts.length < 4) continue;
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const area = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
    if (area < minArea) continue;
    parts.push('M' + pts.map(p => `${p[0].toFixed(precision)},${p[1].toFixed(precision)}`).join('L') + 'Z');
  }
  return parts.join('');
}

console.log('fetching Natural Earth 1:10m admin-0 …');
const geo = await fetch(SOURCE, { signal: AbortSignal.timeout(120000) }).then(r => r.json());

const countries = [];
for (const [code, name] of Object.entries({ ...WANTED, ...CONTEXT })) {
  const f = geo.features.find(x => (x.properties.ADM0_A3 ?? x.properties.ISO_A3) === code);
  if (!f) { console.warn(`  ${code} not found`); continue; }
  const primary = code in WANTED;
  // The two countries UKP plays in keep their islands and their shape; neighbours are context only.
  const d = pathFor(f.geometry, primary
    ? { tolerance: 1.1, minArea: 8, precision: 1 }
    : { tolerance: 3.5, minArea: 120, precision: 0 });
  countries.push({ id: code, name, primary, d });
  console.log(`  ${code} ${name.padEnd(20)} ${(d.length / 1024).toFixed(1)} KB path`);
}
// Draw context first, the two we play in last, so their outlines sit on top.
countries.sort((a, b) => Number(a.primary) - Number(b.primary));

// Crop the frame to the countries UKP actually plays in, plus a margin, so the map is not mostly
// empty sea. Pins still project against the full grid, so only the window changes.
const primaryCoords = countries.filter(c => c.primary).flatMap(c =>
  [...c.d.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map(m => [parseFloat(m[1]), parseFloat(m[2])]));
const pad = 26;
const minX = Math.max(0, Math.min(...primaryCoords.map(p => p[0])) - pad);
const maxX = Math.min(W, Math.max(...primaryCoords.map(p => p[0])) + pad);
const minY = Math.max(0, Math.min(...primaryCoords.map(p => p[1])) - pad);
const maxY = Math.min(H, Math.max(...primaryCoords.map(p => p[1])) + pad);
const view = { x: +minX.toFixed(1), y: +minY.toFixed(1), w: +(maxX - minX).toFixed(1), h: +(maxY - minY).toFixed(1) };

await fs.mkdir('src/data', { recursive: true });
const out = { viewBox: `${view.x} ${view.y} ${view.w} ${view.h}`, width: W, height: H, bounds: BOUNDS, countries };
await fs.writeFile('src/data/map-outline.json', JSON.stringify(out));
console.log(`wrote src/data/map-outline.json (${((await fs.stat('src/data/map-outline.json')).size / 1024).toFixed(0)} KB)`);
console.log(`  grid ${W}x${H}, cropped to ${out.viewBox} (aspect ${(view.w / view.h).toFixed(2)})`);
