// Build-time snapshot of the PubQuiz API -> public/data/*.json (+ mirrored images in public/img/api/).
// The browser never talks to the API; it reads these files. Same shape is produced by server/refresh-data.php on the host.
// Run: npm run data   (needs UKP_API_BASE + UKP_API_KEY in .env)
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import sharp from 'sharp';

// --- env (.env without a dependency) ---
try {
  const env = await fs.readFile('.env', 'utf8');
  for (const line of env.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*'([^']*)'\s*$/) || line.match(/^\s*([A-Z0-9_]+)\s*=\s*"([^"]*)"\s*$/) || line.match(/^\s*([A-Z0-9_]+)\s*=\s*([^#\s]+)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}
const BASE = (process.env.UKP_API_BASE || 'https://api.injeel-it.hr').replace(/\/$/, '');
const KEY = process.env.UKP_API_KEY;
if (!KEY) { console.error('UKP_API_KEY missing (put it in .env)'); process.exit(1); }
const H = { 'X-API-Key': KEY, 'Accept-Language': 'hr', Accept: 'application/json', 'User-Agent': 'kvizovi.hr build' };

async function get(p, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(BASE + p, { headers: H, signal: AbortSignal.timeout(30000) });
      if (r.status === 429) { await new Promise(res => setTimeout(res, 5000 * (i + 1))); continue; }
      if (!r.ok) throw new Error(`${r.status} ${p}`);
      return await r.json();
    } catch (e) { if (i === tries - 1) throw e; await new Promise(res => setTimeout(res, 1000 * (i + 1))); }
  }
}
async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } }));
  return out;
}
const slugify = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

// --- images: mirror to public/img/api/<key>.webp (+ -s small) ---
const IMG_DIR = 'public/img/api';
await fs.mkdir(IMG_DIR, { recursive: true });
const imgCache = new Map();
async function mirror(url) {
  if (!url) return null;
  if (imgCache.has(url)) return imgCache.get(url);
  const p = (async () => {
    let key, src;
    const m = url.match(/^\/api\/image\/(\d+)$/);
    if (m) { key = m[1]; src = BASE + url; }
    else if (/^https?:\/\//.test(url)) { key = 'x' + crypto.createHash('sha1').update(url).digest('hex').slice(0, 12); src = url; }
    else return null;
    const full = `${IMG_DIR}/${key}.webp`, small = `${IMG_DIR}/${key}-s.webp`;
    try {
      await fs.access(full); await fs.access(small);
    } catch {
      try {
        const r = await fetch(src, { headers: m ? H : { 'User-Agent': H['User-Agent'] }, signal: AbortSignal.timeout(30000) });
        if (!r.ok) throw new Error(String(r.status));
        const buf = Buffer.from(await r.arrayBuffer());
        const img = sharp(buf, { animated: false }).rotate();
        await img.clone().resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 78 }).toFile(full);
        await img.clone().resize({ width: 480, withoutEnlargement: true }).webp({ quality: 74 }).toFile(small);
      } catch (e) { console.warn(`  image failed ${url.slice(0, 80)}: ${String(e.message).slice(0, 60)}`); return m ? { full: src, small: src } : null; }
    }
    return { full: '/' + full.replace(/^public\//, ''), small: '/' + small.replace(/^public\//, '') };
  })();
  imgCache.set(url, p); return p;
}

const t0 = Date.now();
console.log('fetching locations...');
const locList = await get('/api/pub-quiz-locations');
const details = await pool(locList, 6, l => get(`/api/pub-quiz-locations/${l.pubQuizLocationId}`).catch(e => { console.warn('  detail failed', l.pubQuizLocationId, e.message); return null; }));
console.log(`  ${locList.length} locations, ${details.filter(Boolean).length} details`);
const today = new Date(); const from = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
const [events, news, reasons] = await Promise.all([
  get(`/api/pub-quiz-events?from=${from}`), get('/api/news?limit=100'), get('/api/cancellation-reasons'),
]);
console.log(`  ${events.length} upcoming events, ${news.length} news, ${reasons.length} cancellation reasons`);

const cityOf = c => c ? { id: c.cityId ?? c.id ?? null, name: c.name ?? '', country: c.countryName ?? c.country?.name ?? c.countryCode ?? c.country ?? null } : { id: null, name: '', country: null };
const WEEKDAY_SUFFIX = { ponedjeljkom: 1, utorkom: 2, srijedom: 3, cetvrtkom: 4, četvrtkom: 4, petkom: 5, subotom: 6, nedjeljom: 0 };
function weekdayFromName(name) { const w = (name || '').toLowerCase().match(/(ponedjeljkom|utorkom|srijedom|četvrtkom|cetvrtkom|petkom|subotom|nedjeljom)/); return w ? WEEKDAY_SUFFIX[w[1]] : null; }

const locations = await Promise.all(locList.map(async (l, i) => {
  const d = details[i] || {};
  const id = l.pubQuizLocationId, slug = slugify(l.name);
  const nextDate = l.nextEventDate || d.nextEventDate || null;
  return {
    id, slug, url: `/lokacije/${id}-${slug}/`,
    name: l.name, venueName: l.venueName, address: d.address ?? l.address ?? null,
    city: cityOf(l.city), lat: l.latitude ?? d.latitude ?? null, lng: l.longitude ?? d.longitude ?? null,
    logo: await mirror(l.logoImageUrl || d.logoImageUrl), image: await mirror(l.imageUrl || d.imageUrl),
    description: (d.description || '').trim() || null,
    defaultStartTime: d.defaultStartTime ?? l.defaultStartTime ?? null,
    defaultMaxTeams: d.defaultMaxTeams ?? null, defaultMaxPlayersPerTeam: d.defaultMaxPlayersPerTeam ?? null,
    defaultFeeType: d.defaultFeeType ?? null, defaultFeeAmount: d.defaultFeeAmount ?? null,
    defaultRequiresApproval: !!d.defaultRequiresApproval, registrationDeadlineHours: d.registrationDeadlineHours ?? null,
    whatsapp: d.whatsAppCommunityLink || l.whatsAppCommunityLink || null,
    weekday: weekdayFromName(l.name) ?? (nextDate ? new Date(nextDate.slice(0, 10) + 'T12:00:00').getDay() : null),
    upcomingCount: l.upcomingEventsCount ?? 0, nextEventDate: nextDate, nextEventStartTime: l.nextEventStartTime ?? null, nextEventName: l.nextEventName ?? null,
    isActive: d.isActive !== false,
  };
}));
const locById = new Map(locations.map(l => [l.id, l]));

const eventsOut = await Promise.all(events.filter(e => !e.isHidden).map(async e => {
  const loc = locById.get(e.locationId);
  return {
    id: e.pubQuizEventId, url: `/dogadaji/${e.pubQuizEventId}/`,
    locationId: e.locationId, locationUrl: loc?.url ?? null, locationName: e.locationName, venueName: e.venueName,
    city: cityOf(e.city), address: loc?.address ?? null, lat: loc?.lat ?? null, lng: loc?.lng ?? null,
    logo: loc?.logo ?? null, image: (await mirror(e.eventImageUrl)) ?? loc?.image ?? null,
    date: e.eventDate.slice(0, 10), startTime: e.startTime, name: (e.name || '').trim() || null,
    category: e.categoryName ?? null, subCategory: e.subCategoryName ?? null,
    maxTeams: e.maxTeams ?? null, registered: e.registeredTeamsCount ?? 0, spotsRemaining: e.spotsRemaining ?? null,
    registrationDeadline: e.registrationDeadline ?? null, requiresApproval: !!e.requiresApproval,
    isCancelled: !!e.isCancelled, feeType: e.feeType ?? null, feeAmount: e.feeAmount ?? null, maxPlayersPerTeam: e.maxPlayersPerTeam ?? null,
    resultsPublished: !!e.resultsPublished, season: e.season?.name ?? null, whatsapp: loc?.whatsapp ?? null,
  };
}));
eventsOut.sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));

// The API's `from=<today>` still returns events that started earlier today. A quiz that began at 03:00
// is not "danas" to a visitor at 10:00, so drop anything more than 3h past its start.
const startedBefore = new Date(Date.now() - 3 * 3600 * 1000);
const stillUpcoming = e => new Date(`${e.date}T${e.startTime}`) > startedBefore;
const staleCount = eventsOut.length - eventsOut.filter(stillUpcoming).length;
const upcomingEvents = eventsOut.filter(stillUpcoming);

// Recompute each location's "next quiz" from the events that are actually still ahead, so the
// locations list never advertises a termin that has already happened.
const nextByLocation = new Map();
for (const e of upcomingEvents) if (!e.isCancelled && !nextByLocation.has(e.locationId)) nextByLocation.set(e.locationId, e);
for (const l of locations) {
  const next = nextByLocation.get(l.id) ?? null;
  l.upcomingCount = upcomingEvents.filter(e => e.locationId === l.id && !e.isCancelled).length;
  l.nextEventDate = next ? next.date : null;
  l.nextEventStartTime = next ? next.startTime : null;
  l.nextEventName = next ? next.name : null;
}
for (const c of []) void c;

const newsOut = await Promise.all(news.map(async n => ({
  id: n.newsId, url: `/novosti/${n.newsId}/`, title: (n.title || '').trim(), summary: (n.summary || '').trim(), content: (n.content || '').replace(/\r\n/g, '\n').trim(),
  image: await mirror(n.imageUrl), publishedDate: n.publishedDate, locationId: n.locationId ?? null, locationName: n.locationName ?? null,
  locationUrl: n.locationId ? (locById.get(n.locationId)?.url ?? null) : null,
})));
newsOut.sort((a, b) => b.publishedDate.localeCompare(a.publishedDate));

const cityMap = new Map();
for (const l of locations) {
  if (!l.city.name) continue;
  const c = cityMap.get(l.city.name) || { id: l.city.id, name: l.city.name, slug: slugify(l.city.name), country: l.city.country, locations: 0, upcoming: 0 };
  c.locations++; c.upcoming += l.upcomingCount; cityMap.set(l.city.name, c);
}
const cities = [...cityMap.values()].sort((a, b) => a.name.localeCompare(b.name, 'hr'));
const reasonsOut = reasons.filter(r => r.isActive !== false).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
  .map(r => ({ code: r.code, name: r.translations?.find(t => t.languageCode === 'hr')?.displayName || r.displayName }));

await fs.mkdir('public/data', { recursive: true });
const write = (f, d) => fs.writeFile(`public/data/${f}`, JSON.stringify(d));
await Promise.all([
  write('locations.json', locations), write('events.json', upcomingEvents), write('news.json', newsOut), write('cities.json', cities), write('reasons.json', reasonsOut),
  write('meta.json', { generatedAt: new Date().toISOString(), locations: locations.length, cities: cities.length, events: upcomingEvents.length, news: newsOut.length }),
]);
console.log(`done in ${((Date.now() - t0) / 1000).toFixed(0)}s: ${locations.length} locations, ${cities.length} cities, ${upcomingEvents.length} events${staleCount ? ` (${staleCount} already started, dropped)` : ''}, ${newsOut.length} news, ${imgCache.size} images`);
