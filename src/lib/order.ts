/**
 * Ordering and time-window rules shared by the build (src/lib/data.ts) and the browser
 * (src/scripts/live.ts). Pure and free of node imports so it is safe in the client bundle.
 */

export interface Orderable {
  upcomingCount: number;
  nextEventDate: string | null;
  city: { name: string };
  name: string;
}

export interface Timed {
  date: string;       // YYYY-MM-DD
  startTime: string;  // HH:MM:SS
}

/**
 * A visitor came to find a quiz, not to read an alphabetical directory: locations with a
 * scheduled quiz lead, soonest first, then the rest by city and name.
 */
export function sortLocations<T extends Orderable>(list: T[]): T[] {
  return list.slice().sort((a, b) =>
    (b.upcomingCount > 0 ? 1 : 0) - (a.upcomingCount > 0 ? 1 : 0) ||
    (a.nextEventDate ?? '9999').localeCompare(b.nextEventDate ?? '9999') ||
    a.city.name.localeCompare(b.city.name, 'hr') ||
    a.name.localeCompare(b.name, 'hr'));
}

/** Quizzes stay listed for three hours after they start, then drop off. */
export const GRACE_HOURS = 3;

/**
 * The API returns everything from today onward, including a quiz that finished this morning.
 * "danas" has to mean a quiz someone can still turn up to.
 */
export function isStillUpcoming(e: Timed, now: Date = new Date()): boolean {
  return new Date(`${e.date}T${e.startTime}`).getTime() > now.getTime() - GRACE_HOURS * 3600 * 1000;
}

export function upcomingEvents<T extends Timed>(list: T[], now: Date = new Date()): T[] {
  return list.filter(e => isStillUpcoming(e, now));
}
