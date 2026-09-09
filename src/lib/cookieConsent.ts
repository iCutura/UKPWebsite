/**
 * Whether the visitor lets the Meta Pixel load, and nothing else.
 *
 * The shape deliberately copies `consent.ts` (the location decision): one key, one decision, one
 * timestamp. Nothing about the person is written, and the record is small enough to read on the
 * page that has to decide within a frame whether to inject a third-party script.
 *
 * `v` exists so the pixel's inventory can grow. Add a category or another cookie and the honest
 * thing is to ask again rather than to reinterpret a pristanak given for a shorter list, so a
 * version bump silently invalidates every stored decision.
 *
 * Why a TTL at all: a pristanak from two years ago is not evidence of anything. A year is the
 * common practice and short enough to be defensible; nothing about the site breaks if it lapses,
 * the visitor is simply asked once more.
 */
export const CONSENT_KEY = 'ukp-consent';
export const CONSENT_VERSION = 1;
export const CONSENT_TTL_DAYS = 365;

/** Cookies the Meta Pixel sets on this domain. First-party, both of them, which is why the site can delete them itself. */
export const META_COOKIES = ['_fbp', '_fbc'] as const;

export interface Consent { v: number; marketing: boolean; t: number }

/** unknown: never asked, lapsed, or a decision made against an older inventory. */
export type ConsentState = 'unknown' | 'granted' | 'refused';

export function readConsent(now = Date.now()): Consent | null {
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Consent;
    if (v?.v !== CONSENT_VERSION) return null;
    if (typeof v.marketing !== 'boolean' || typeof v.t !== 'number') return null;
    if (now - v.t > CONSENT_TTL_DAYS * 864e5) return null;
    return { v: v.v, marketing: v.marketing, t: v.t };
  } catch { return null; }
}

export function writeConsent(marketing: boolean, now = Date.now()): Consent {
  const rec: Consent = { v: CONSENT_VERSION, marketing, t: now };
  try { localStorage.setItem(CONSENT_KEY, JSON.stringify(rec)); } catch {}
  return rec;
}

export function forgetConsent(): void {
  try { localStorage.removeItem(CONSENT_KEY); } catch {}
}

export function consentState(now = Date.now()): ConsentState {
  const c = readConsent(now);
  return c === null ? 'unknown' : c.marketing ? 'granted' : 'refused';
}

export function marketingAllowed(now = Date.now()): boolean {
  return consentState(now) === 'granted';
}

/** `kvizovi.hr` for both `kvizovi.hr` and `www.kvizovi.hr`; nothing for an IP or a single label. */
export function registrableDomain(hostname: string): string | null {
  if (!hostname || /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || hostname.includes(':')) return null;
  const parts = hostname.split('.').filter(Boolean);
  return parts.length < 2 ? null : parts.slice(-2).join('.');
}

/**
 * The `document.cookie` writes that remove the pixel's cookies on withdrawal.
 *
 * Two per cookie: the browser only deletes a cookie when the delete matches the domain it was set
 * for, and `fbevents.js` sets them on the registrable domain, not on the exact host. Missing the
 * dotted variant leaves `_fbp` alive on a page that has just promised to delete it.
 */
export function metaCookieClearing(hostname: string): string[] {
  const dead = 'expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
  const base = registrableDomain(hostname);
  const out: string[] = [];
  for (const name of META_COOKIES) {
    out.push(`${name}=; ${dead}`);
    if (base) out.push(`${name}=; ${dead}; domain=.${base}`);
  }
  return out;
}
