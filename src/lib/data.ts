/** Build-time access to the API snapshots in public/data (written by scripts/fetch-data.mjs). */
import fs from 'node:fs';
import path from 'node:path';

export interface Img { full: string; small: string }
export interface City { id: number | null; name: string; slug: string; country: string | null; locations: number; upcoming: number }
export interface Location {
  id: number; slug: string; url: string; name: string; venueName: string; address: string | null;
  city: { id: number | null; name: string; country: string | null }; lat: number | null; lng: number | null;
  logo: Img | null; image: Img | null; description: string | null;
  defaultStartTime: string | null; defaultMaxTeams: number | null; defaultMaxPlayersPerTeam: number | null;
  defaultFeeType: string | null; defaultFeeAmount: number | null; defaultRequiresApproval: boolean; registrationDeadlineHours: number | null;
  whatsapp: string | null; weekday: number | null; upcomingCount: number;
  nextEventDate: string | null; nextEventStartTime: string | null; nextEventName: string | null; isActive: boolean;
}
export interface EventItem {
  id: number; url: string; locationId: number; locationUrl: string | null; locationName: string; venueName: string;
  city: { id: number | null; name: string; country: string | null }; address: string | null; lat: number | null; lng: number | null;
  logo: Img | null; image: Img | null; date: string; startTime: string; name: string | null; category: string | null; subCategory: string | null;
  maxTeams: number | null; registered: number; spotsRemaining: number | null; registrationDeadline: string | null; requiresApproval: boolean;
  isCancelled: boolean; feeType: string | null; feeAmount: number | null; maxPlayersPerTeam: number | null; resultsPublished: boolean; season: string | null; whatsapp: string | null;
}
export interface NewsItem {
  id: number; url: string; title: string; summary: string; content: string; image: Img | null; publishedDate: string;
  locationId: number | null; locationName: string | null; locationUrl: string | null;
}
export interface Reason { code: string; name: string }
export interface Meta { generatedAt: string; locations: number; cities: number; events: number; news: number }

const cache = new Map<string, unknown>();
function load<T>(file: string, fallback: T): T {
  if (cache.has(file)) return cache.get(file) as T;
  const p = path.join(process.cwd(), 'public', 'data', file);
  let v: T = fallback;
  try { v = JSON.parse(fs.readFileSync(p, 'utf8')) as T; }
  catch { console.warn(`[data] ${file} missing; run \`npm run data\`. Using empty fallback.`); }
  cache.set(file, v);
  return v;
}
/** Locations with a scheduled quiz lead: a visitor came to find a quiz, not to read an alphabetical directory. */
export const getLocations = () => load<Location[]>('locations.json', [])
  .filter(l => l.isActive !== false)
  .slice()
  .sort((a, b) =>
    (b.upcomingCount > 0 ? 1 : 0) - (a.upcomingCount > 0 ? 1 : 0) ||
    (a.nextEventDate ?? '9999').localeCompare(b.nextEventDate ?? '9999') ||
    a.city.name.localeCompare(b.city.name, 'hr') ||
    a.name.localeCompare(b.name, 'hr'));
export const getEvents = () => load<EventItem[]>('events.json', []);
export const getNews = () => load<NewsItem[]>('news.json', []);
export const getCities = () => load<City[]>('cities.json', []);
export const getReasons = () => load<Reason[]>('reasons.json', []);
export const getMeta = () => load<Meta>('meta.json', { generatedAt: new Date().toISOString(), locations: 0, cities: 0, events: 0, news: 0 });
export const getLocation = (id: number) => getLocations().find(l => l.id === id) ?? null;
export const eventsForLocation = (id: number) => getEvents().filter(e => e.locationId === id);
