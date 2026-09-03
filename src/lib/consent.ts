/**
 * Remembering whether the visitor wants distances, without ever holding their position.
 *
 * What is stored: one key, `ukp-geo`, holding a decision and when it was made. No coordinates,
 * ever. When permission is already granted the browser hands the position back from its own cache
 * via `maximumAge`, so there is nothing for this site to keep.
 *
 * What is deliberately NOT done: calling getCurrentPosition on page load. An unexplained prompt
 * has a poor grant rate, browsers penalise it, and a refusal is usually permanent, which would
 * close the door on the feature for that visitor for good. The page asks in its own words first,
 * and only then hands over to the browser.
 */
export type Decision = 'granted' | 'dismissed';
export type PermissionState = 'granted' | 'prompt' | 'denied' | 'unknown';

export const STORAGE_KEY = 'ukp-geo';
/** After this long an old "not now" stops counting, in case the visitor's mind has changed. */
export const DISMISSAL_TTL_DAYS = 60;

export interface Stored { d: Decision; t: number }

export function readDecision(now = Date.now()): Decision | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Stored;
    if (v?.d !== 'granted' && v?.d !== 'dismissed') return null;
    if (v.d === 'dismissed' && now - v.t > DISMISSAL_TTL_DAYS * 864e5) return null;
    return v.d;
  } catch { return null; }
}

export function writeDecision(d: Decision, now = Date.now()): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ d, t: now } satisfies Stored)); } catch {}
}

export function forgetDecision(): void {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}

/** What the browser already thinks, without asking the visitor anything. */
export async function permissionState(): Promise<PermissionState> {
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return 'denied';
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
    return status.state as PermissionState;
  } catch {
    return 'unknown'; // older Safari: we simply do not know until we ask
  }
}

/**
 * What the page should do on load, given the browser's state and what the visitor said last time.
 *  use    - permission is already granted, so read the position without prompting anyone
 *  invite - show the page's own explanation, which may lead to the browser prompt
 *  hide   - refused, or asked to be left alone; offer the city picker instead and never nag
 */
export function plan(state: PermissionState, decision: Decision | null): 'use' | 'invite' | 'hide' {
  if (state === 'granted') return 'use';
  if (state === 'denied') return 'hide';
  if (decision === 'dismissed') return 'hide';
  return 'invite';
}
