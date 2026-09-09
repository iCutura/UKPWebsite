import { describe, it, expect } from 'vitest';
import { LANDING_COPY, HR_LANGUAGES, langFor } from '../../src/lib/appLanding';
import { platformFor, UA_ANDROID, UA_IOS, UA_MAC } from '../../src/lib/device';

describe('which language /app shows', () => {
  it('takes Croatian from a Croatian browser, wherever it sits in the list', () => {
    expect(langFor(['hr'])).toBe('hr');
    expect(langFor(['hr-HR', 'en-US'])).toBe('hr');
    expect(langFor(['en-GB', 'hr'])).toBe('hr');
  });

  it('reads Bosnian and Serbian as Croatian, since the copy is legible to all three', () => {
    expect(langFor(['bs-BA'])).toBe('hr');
    expect(langFor(['sr-Latn-RS'])).toBe('hr');
  });

  it('falls back to English for everyone else, including no answer at all', () => {
    expect(langFor(['de-DE', 'en'])).toBe('en');
    expect(langFor([])).toBe('en');
    expect(langFor(undefined)).toBe('en');
  });
});

describe('which store button /app promotes', () => {
  it('promotes the App Store on an iPhone', () => {
    expect(platformFor('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15')).toBe('ios');
  });

  it('promotes Google Play on an Android phone', () => {
    expect(platformFor('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36')).toBe('android');
  });

  it('sees through an iPad, which reports a Macintosh', () => {
    const ipad = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15';
    expect(platformFor(ipad, 5)).toBe('ios');
    // The same string from a real Mac is a desktop, and a desktop can install neither.
    expect(platformFor(ipad, 0)).toBe('desktop');
  });

  it('treats a desktop as a desktop', () => {
    expect(platformFor('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')).toBe('desktop');
    expect(platformFor('')).toBe('desktop');
  });
});

describe('the patterns the pre-paint inline script is built from', () => {
  /**
   * /app composes an inline script by writing these regexes into JavaScript source as literals.
   * A slash in a source would close the literal early and take the rest of the script with it, so
   * this is the fragility worth pinning rather than the matching, which is covered above.
   */
  it('carries nothing that would break a regex literal', () => {
    for (const r of [HR_LANGUAGES, UA_ANDROID, UA_IOS, UA_MAC]) {
      expect(r.source).not.toContain('/');
      expect(r.source).not.toContain('\n');
      expect(new RegExp(r.source, r.flags).source).toBe(r.source);
    }
  });
});

describe('the two versions of the copy', () => {
  it('fills every field in both languages', () => {
    for (const lang of ['hr', 'en'] as const) {
      for (const [field, value] of Object.entries(LANDING_COPY[lang])) {
        expect(value.trim(), `${lang}.${field}`).not.toBe('');
      }
    }
  });

  it('keeps the house rule: no em dashes', () => {
    for (const lang of ['hr', 'en'] as const) {
      expect(JSON.stringify(LANDING_COPY[lang]), lang).not.toMatch(/[—–]/);
    }
  });

  /**
   * The English page is the destination of global ads. Someone who arrives from one cannot come to
   * a venue in Zagreb and cannot join a league, so the English copy must not offer either; the
   * install it would buy is a refund and a one-star review.
   */
  it('does not promise the English visitor a quiz they cannot attend', () => {
    const en = `${LANDING_COPY.en.headline} ${LANDING_COPY.en.sub} ${LANDING_COPY.en.note}`.toLowerCase();
    for (const word of ['league', 'venue', 'zagreb', '130', 'team']) {
      expect(en, word).not.toContain(word);
    }
  });

  it('does offer the Croatian visitor exactly that, since they can have it', () => {
    const hr = `${LANDING_COPY.hr.headline} ${LANDING_COPY.hr.sub}`.toLowerCase();
    expect(hr).toContain('ekipe');
    expect(hr).toContain('130');
  });
});
