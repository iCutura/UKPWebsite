/**
 * Seasonal theme tokens, mirrored 1:1 from the iOS app
 * (PubQuiz.iOS/Theme/SeasonalThemeManager.swift + AppTheme.swift).
 * The website has no accent of its own: the season decides.
 */
export type Season = 'spring' | 'summer' | 'fall' | 'winter';
export const SEASONS: Season[] = ['spring', 'summer', 'fall', 'winter'];

export interface SeasonTokens {
  accent: string; accentDark: string; accentSoft: string; accentDeep: string;
  soft: [string, string, string];   // sunsetSoftStops - light content background
  warm: [string, string, string];   // sunsetWarmStops - hero / emphasis
  night: [string, string, string];  // sunsetNightStops - dark sections
  tint: string;
  label: string;                    // Croatian display name
}

export const SEASON_TOKENS: Record<Season, SeasonTokens> = {
  spring: { accent: '#E8704E', accentDark: '#B8492A', accentSoft: '#F28F70', accentDeep: '#B8492A',
    soft: ['#F6BDB1', '#F8C89C', '#EFA581'], warm: ['#F29A88', '#F5B082', '#E88A5A'], night: ['#3D1E1A', '#5C2A1F', '#7A3524'],
    tint: '#F0C0B8', label: 'Proljeće' },
  summer: { accent: '#E05540', accentDark: '#A43E27', accentSoft: '#EC7A62', accentDeep: '#A43E27',
    soft: ['#F5A78D', '#F8B790', '#E88266'], warm: ['#E87A5A', '#ED9068', '#C35A38'], night: ['#3B1612', '#5C2A1F', '#7A2E1C'],
    tint: '#D06848', label: 'Ljeto' },
  fall: { accent: '#C28240', accentDark: '#8E5A24', accentSoft: '#D8A066', accentDeep: '#744216',
    soft: ['#E8C79B', '#E4B47C', '#C68658'], warm: ['#D9A364', '#C68446', '#8E5A24'], night: ['#2C1C10', '#4A3118', '#6A4420'],
    tint: '#6A8860', label: 'Jesen' },
  winter: { accent: '#4B95C7', accentDark: '#2E6A96', accentSoft: '#7FB5D8', accentDeep: '#205E8A',
    soft: ['#B8D3E4', '#C8D9E6', '#8FB4CE'], warm: ['#6B9AC0', '#89B4D0', '#4D7BA0'], night: ['#0F2236', '#1B3A5C', '#2E5880'],
    tint: '#A8CCE0', label: 'Zima' },
};

/**
 * Temporary lock: only the fall layered artwork has been delivered, so the site shows fall regardless of date.
 * Set to null to re-enable automatic seasons (and the footer switcher) once the other layer sets exist.
 */
export const LOCKED_SEASON: Season | null = 'fall';

/** Same MMDD ranges as AppSeason.current(date:) on iOS. Astronomical-ish seasons, not calendar months. */
export function seasonFor(date: Date = new Date()): Season {
  if (LOCKED_SEASON) return LOCKED_SEASON;
  const md = (date.getMonth() + 1) * 100 + date.getDate();
  if (md >= 320 && md <= 620) return 'spring';
  if (md >= 621 && md <= 921) return 'summer';
  if (md >= 922 && md <= 1220) return 'fall';
  return 'winter';
}

/** CSS custom properties for one season, for inline style or a stylesheet block. */
export function seasonCssVars(s: Season): string {
  const t = SEASON_TOKENS[s];
  return [
    `--accent:${t.accent}`, `--accent-dark:${t.accentDark}`, `--accent-soft:${t.accentSoft}`, `--accent-deep:${t.accentDeep}`,
    `--soft-0:${t.soft[0]}`, `--soft-1:${t.soft[1]}`, `--soft-2:${t.soft[2]}`,
    `--warm-0:${t.warm[0]}`, `--warm-1:${t.warm[1]}`, `--warm-2:${t.warm[2]}`,
    `--night-0:${t.night[0]}`, `--night-1:${t.night[1]}`, `--night-2:${t.night[2]}`,
    `--tint:${t.tint}`,
  ].join(';');
}
