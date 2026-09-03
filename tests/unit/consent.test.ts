import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readDecision, writeDecision, forgetDecision, plan, STORAGE_KEY, DISMISSAL_TTL_DAYS } from '../../src/lib/consent';

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
  it('keeps the decision and nothing else', () => {
    writeDecision('granted', 1_700_000_000_000);
    const raw = JSON.parse(store.get(STORAGE_KEY)!);
    expect(Object.keys(raw).sort()).toEqual(['d', 't']);
    // A position must never end up on disk; the browser's own cache serves that purpose.
    expect(JSON.stringify(raw)).not.toMatch(/lat|lng|coord|-?\d{1,2}\.\d{3,}/);
  });

  it('reads back what it wrote', () => {
    writeDecision('granted');
    expect(readDecision()).toBe('granted');
  });

  it('forgets on request, which is how a visitor withdraws consent', () => {
    writeDecision('granted');
    forgetDecision();
    expect(readDecision()).toBeNull();
    expect(store.has(STORAGE_KEY)).toBe(false);
  });

  it('lets a "not now" lapse, rather than closing the door for ever', () => {
    const t = 1_700_000_000_000;
    writeDecision('dismissed', t);
    expect(readDecision(t + 10 * 864e5)).toBe('dismissed');
    expect(readDecision(t + (DISMISSAL_TTL_DAYS + 1) * 864e5)).toBeNull();
  });

  it('keeps a granted decision indefinitely', () => {
    const t = 1_700_000_000_000;
    writeDecision('granted', t);
    expect(readDecision(t + 3650 * 864e5)).toBe('granted');
  });

  it('survives junk in storage without throwing', () => {
    store.set(STORAGE_KEY, 'not json');
    expect(readDecision()).toBeNull();
    store.set(STORAGE_KEY, JSON.stringify({ d: 'something else', t: 1 }));
    expect(readDecision()).toBeNull();
  });

  it('does not throw when storage is unavailable, as in a private window', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('denied'); },
      removeItem: () => { throw new Error('denied'); },
    });
    expect(() => writeDecision('granted')).not.toThrow();
    expect(readDecision()).toBeNull();
    expect(() => forgetDecision()).not.toThrow();
  });
});

describe('what the page does on load', () => {
  it('uses a position it already has permission for, without prompting', () => {
    expect(plan('granted', null)).toBe('use');
    expect(plan('granted', 'granted')).toBe('use');
  });

  it('never asks again once refused in the browser', () => {
    expect(plan('denied', null)).toBe('hide');
    expect(plan('denied', 'granted')).toBe('hide');
  });

  it('does not nag someone who said not now', () => {
    expect(plan('prompt', 'dismissed')).toBe('hide');
  });

  it('explains itself before the browser prompt appears', () => {
    expect(plan('prompt', null)).toBe('invite');
    // Older Safari cannot report the state; asking in our own words first is right there too.
    expect(plan('unknown', null)).toBe('invite');
  });

  it('respects a lapsed dismissal by inviting again', () => {
    expect(plan('prompt', null)).toBe('invite');
  });
});
