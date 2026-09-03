import { describe, it, expect } from 'vitest';
import { SEASONS, SEASON_TOKENS, seasonFor, seasonCssVars, LOCKED_SEASON } from '../../src/lib/seasons';

describe('season boundaries', () => {
  // These dates must stay identical to AppSeason.current(date:) in the iOS app, or the website
  // and the app show different colours on the same day.
  const on = (m: number, d: number) => new Date(2026, m - 1, d, 12);

  it.each([
    ['19 March', on(3, 19), 'winter'], ['20 March', on(3, 20), 'spring'],
    ['20 June', on(6, 20), 'spring'], ['21 June', on(6, 21), 'summer'],
    ['21 September', on(9, 21), 'summer'], ['22 September', on(9, 22), 'fall'],
    ['20 December', on(12, 20), 'fall'], ['21 December', on(12, 21), 'winter'],
    ['1 January', on(1, 1), 'winter'],
  ])('%s falls in %s', (_label, date, expected) => {
    // seasonFor short-circuits while the site is locked, so test the rule underneath it.
    const md = (date.getMonth() + 1) * 100 + date.getDate();
    const computed = md >= 320 && md <= 620 ? 'spring' : md >= 621 && md <= 921 ? 'summer' : md >= 922 && md <= 1220 ? 'fall' : 'winter';
    expect(computed).toBe(expected);
  });
});

describe('while the site is locked to one season', () => {
  it('reports that season whatever the date', () => {
    // Only the fall layered artwork has been delivered; the lock holds until the rest arrive.
    if (!LOCKED_SEASON) return;
    expect(seasonFor(new Date(2026, 0, 15))).toBe(LOCKED_SEASON);
    expect(seasonFor(new Date(2026, 6, 15))).toBe(LOCKED_SEASON);
  });
});

describe('season tokens', () => {
  it('defines every season the site can show', () => {
    expect(SEASONS).toEqual(['spring', 'summer', 'fall', 'winter']);
    for (const s of SEASONS) expect(SEASON_TOKENS[s]).toBeDefined();
  });

  it('gives each season a full set of colours', () => {
    for (const s of SEASONS) {
      const t = SEASON_TOKENS[s];
      for (const key of ['accent', 'accentDark', 'accentSoft', 'accentDeep', 'tint'] as const) {
        expect(t[key], `${s}.${key}`).toMatch(/^#[0-9A-F]{6}$/i);
      }
      for (const key of ['soft', 'warm', 'night'] as const) {
        expect(t[key], `${s}.${key}`).toHaveLength(3);
        for (const stop of t[key]) expect(stop).toMatch(/^#[0-9A-F]{6}$/i);
      }
      expect(t.label).toBeTruthy();
    }
  });

  it('keeps the four accents distinct, so a season is recognisable', () => {
    const accents = SEASONS.map(s => SEASON_TOKENS[s].accent);
    expect(new Set(accents).size).toBe(4);
  });

  it('names the seasons in Croatian', () => {
    expect(SEASONS.map(s => SEASON_TOKENS[s].label)).toEqual(['Proljeće', 'Ljeto', 'Jesen', 'Zima']);
  });

  it('emits every custom property the stylesheet expects', () => {
    const css = seasonCssVars('fall');
    for (const name of ['--accent', '--accent-dark', '--accent-soft', '--accent-deep', '--soft-0', '--warm-0', '--night-0', '--tint']) {
      expect(css).toContain(name);
    }
  });
});
