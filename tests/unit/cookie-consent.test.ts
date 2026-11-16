import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  readConsent, writeConsent, forgetConsent, consentState, marketingAllowed,
  registrableDomain, metaCookieClearing, googleCookieClearing,
  CONSENT_KEY, CONSENT_VERSION, CONSENT_TTL_DAYS, META_COOKIES, GOOGLE_COOKIES,
} from '../../src/lib/cookieConsent';

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
});

describe('what gets stored', () => {
  it('keeps the decision, the version and the time, and nothing else', () => {
    writeConsent(true, 1_700_000_000_000);
    const raw = JSON.parse(store.get(CONSENT_KEY)!);
    expect(Object.keys(raw).sort()).toEqual(['marketing', 't', 'v']);
    expect(raw).toEqual({ v: CONSENT_VERSION, marketing: true, t: 1_700_000_000_000 });
  });

  it('reads back both answers', () => {
    writeConsent(true);
    expect(consentState()).toBe('granted');
    writeConsent(false);
    expect(consentState()).toBe('refused');
  });

  it('reports unknown before anything is decided', () => {
    expect(readConsent()).toBeNull();
    expect(consentState()).toBe('unknown');
    expect(marketingAllowed()).toBe(false);
  });

  it('forgets on request, which is how a visitor starts over', () => {
    writeConsent(true);
    forgetConsent();
    expect(consentState()).toBe('unknown');
    expect(store.has(CONSENT_KEY)).toBe(false);
  });

  it('lapses after a year, so an old pristanak is asked for again', () => {
    const t = 1_700_000_000_000;
    writeConsent(true, t);
    expect(consentState(t + (CONSENT_TTL_DAYS - 1) * 864e5)).toBe('granted');
    expect(consentState(t + (CONSENT_TTL_DAYS + 1) * 864e5)).toBe('unknown');
  });

  it('lapses a refusal too, rather than remembering it for ever', () => {
    const t = 1_700_000_000_000;
    writeConsent(false, t);
    expect(consentState(t + (CONSENT_TTL_DAYS + 1) * 864e5)).toBe('unknown');
  });

  it('ignores a decision made against an older cookie inventory', () => {
    store.set(CONSENT_KEY, JSON.stringify({ v: CONSENT_VERSION - 1, marketing: true, t: Date.now() }));
    // A pristanak for a shorter list is not a pristanak for a longer one.
    expect(consentState()).toBe('unknown');
    expect(marketingAllowed()).toBe(false);
  });

  it('asks again everyone who answered before Google Ads joined the list', () => {
    // v1 covered the Meta Pixel only; a yes to that is not a yes to Google.
    expect(CONSENT_VERSION).toBe(2);
    for (const marketing of [true, false]) {
      store.set(CONSENT_KEY, JSON.stringify({ v: 1, marketing, t: Date.now() }));
      expect(consentState(), String(marketing)).toBe('unknown');
    }
  });

  it('survives junk in storage without throwing, and never reads it as consent', () => {
    for (const junk of ['not json', '{}', '[]', 'null', JSON.stringify({ v: 1, marketing: 'yes', t: 1 }), JSON.stringify({ v: 1, marketing: true })]) {
      store.set(CONSENT_KEY, junk);
      expect(readConsent(), junk).toBeNull();
      expect(marketingAllowed(), junk).toBe(false);
    }
  });

  it('does not throw when storage is unavailable, as in a private window', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('denied'); },
      removeItem: () => { throw new Error('denied'); },
    });
    expect(() => writeConsent(true)).not.toThrow();
    expect(() => forgetConsent()).not.toThrow();
    // And with nothing readable the answer is "not allowed", never "allowed by default".
    expect(marketingAllowed()).toBe(false);
  });
});

describe('deleting the pixel cookies on withdrawal', () => {
  it('names the exact host and the registrable domain, because fbevents.js sets the dotted one', () => {
    const writes = metaCookieClearing('www.kvizovi.hr');
    expect(writes).toHaveLength(META_COOKIES.length * 2);
    for (const name of META_COOKIES) {
      expect(writes).toContain(`${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`);
      expect(writes).toContain(`${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=.kvizovi.hr`);
    }
  });

  it('skips the domain form where there is none to name', () => {
    for (const host of ['localhost', '127.0.0.1', '']) {
      const writes = metaCookieClearing(host);
      expect(writes, host).toHaveLength(META_COOKIES.length);
      expect(writes.join(' '), host).not.toContain('domain=');
    }
  });

  it('folds a subdomain to the registrable domain', () => {
    expect(registrableDomain('kvizovi.hr')).toBe('kvizovi.hr');
    expect(registrableDomain('www.kvizovi.hr')).toBe('kvizovi.hr');
    expect(registrableDomain('staging.www.kvizovi.hr')).toBe('kvizovi.hr');
    expect(registrableDomain('localhost')).toBeNull();
    expect(registrableDomain('127.0.0.1')).toBeNull();
  });
});

describe('deleting the Google Ads cookies on withdrawal', () => {
  it('names every _gcl cookie on the exact host and on the registrable domain', () => {
    expect([...GOOGLE_COOKIES]).toEqual(['_gcl_au', '_gcl_aw', '_gcl_gb', '_gcl_gs']);
    const writes = googleCookieClearing('www.kvizovi.hr');
    expect(writes).toHaveLength(GOOGLE_COOKIES.length * 2);
    for (const name of GOOGLE_COOKIES) {
      expect(writes).toContain(`${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`);
      expect(writes).toContain(`${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=.kvizovi.hr`);
    }
  });

  it('skips the domain form where there is none to name', () => {
    for (const host of ['localhost', '127.0.0.1', '']) {
      const writes = googleCookieClearing(host);
      expect(writes, host).toHaveLength(GOOGLE_COOKIES.length);
      expect(writes.join(' '), host).not.toContain('domain=');
    }
  });

  it('leaves the Meta cookies to the pixel, and the other way round', () => {
    const google = googleCookieClearing('kvizovi.hr').join(' ');
    const meta = metaCookieClearing('kvizovi.hr').join(' ');
    expect(google).not.toMatch(/_fb[pc]=/);
    expect(meta).not.toMatch(/_gcl_/);
  });
});
