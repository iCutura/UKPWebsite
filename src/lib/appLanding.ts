/**
 * Copy for /app, the destination of the global Meta campaigns.
 *
 * Two languages on one URL, because the ads are bought globally and an ad set cannot be relied on
 * to send Croatian traffic to a Croatian URL and everyone else to another. The page picks by the
 * browser's own languages before first paint.
 *
 * The two versions deliberately promise different things. A Croatian visitor can sign a team up
 * for a quiz in their own city, so the Croatian copy offers exactly that. Someone who arrived from
 * a global ad cannot come to Zagreb and cannot join a league, so the English copy offers only what
 * they can actually have: the daily quiz and the daily football challenge. Promising the rest would
 * buy an install and a refund.
 */
export type Lang = 'hr' | 'en';

export interface LandingCopy {
  eyebrow: string;
  headline: string;
  sub: string;
  note: string;
  privacy: string;
  cookies: string;
  home: string;
  shots: string;
}

export const LANDING_COPY: Record<Lang, LandingCopy> = {
  hr: {
    eyebrow: 'UKP Quiz',
    headline: 'Svaki dan je kviz dan.',
    sub: 'Dnevni kviz, sportski izazov i prijava ekipe na kvizove u više od 130 lokacija u Hrvatskoj i BiH.',
    note: 'Besplatno · iPhone i Android · hrvatski i engleski',
    privacy: 'Pravila privatnosti',
    cookies: 'Kolačići',
    home: 'Urbana kviz priča, naslovna',
    shots: 'UKP Quiz na iPhoneu: početni ekran i pitanje u kvizu',
  },
  en: {
    eyebrow: 'UKP Quiz',
    headline: 'Every day is quiz day.',
    sub: 'A new quiz every day, and a daily football challenge. In English or Croatian, wherever you are.',
    note: 'Free · iPhone and Android · English and Croatian',
    privacy: 'Privacy policy',
    cookies: 'Cookies',
    home: 'Urbana kviz priča, home',
    shots: 'UKP Quiz on iPhone: the home screen and a question in play',
  },
};

/**
 * Croatian for a Croatian browser, English for everyone else. Bosnian and Serbian read Croatian.
 *
 * Exported as a pattern because /app has to choose before first paint, in an inline script that
 * cannot import anything. The page builds that script from this very regex, so the tested rule and
 * the shipped rule cannot drift apart.
 */
export const HR_LANGUAGES = /^(hr|bs|sr)\b/i;

export function langFor(languages: readonly string[] | undefined): Lang {
  for (const tag of languages ?? []) {
    if (HR_LANGUAGES.test(tag)) return 'hr';
  }
  return 'en';
}
