const WEEKDAYS = ['nedjelja', 'ponedjeljak', 'utorak', 'srijeda', 'četvrtak', 'petak', 'subota'];
const WEEKDAYS_INSTR = ['nedjeljom', 'ponedjeljkom', 'utorkom', 'srijedom', 'četvrtkom', 'petkom', 'subotom'];
const MONTHS_GEN = ['siječnja', 'veljače', 'ožujka', 'travnja', 'svibnja', 'lipnja', 'srpnja', 'kolovoza', 'rujna', 'listopada', 'studenoga', 'prosinca'];

/** API dates arrive as local-date strings like 2026-09-14T00:00:00; treat as calendar dates, no TZ shift. */
export function parseApiDate(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function weekday(d: Date): string { return WEEKDAYS[d.getDay()]; }
export function weekdayInstrumental(d: Date): string { return WEEKDAYS_INSTR[d.getDay()]; }
/** "ponedjeljak, 14. rujna" */
export function longDate(d: Date): string { return `${WEEKDAYS[d.getDay()]}, ${d.getDate()}. ${MONTHS_GEN[d.getMonth()]}`; }
/** "14. 9. 2026." */
export function numericDate(d: Date): string { return `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()}.`; }
/** "20:00:00" -> "20:00" */
export function time(t?: string | null): string { return t ? t.slice(0, 5) : ''; }
export function isToday(d: Date, now = new Date()): boolean { return d.toDateString() === now.toDateString(); }
export function isTomorrow(d: Date, now = new Date()): boolean { const t = new Date(now); t.setDate(t.getDate() + 1); return d.toDateString() === t.toDateString(); }
/** "danas" / "sutra" / "ponedjeljak, 14. rujna" */
export function relativeDay(d: Date, now = new Date()): string {
  if (isToday(d, now)) return 'danas';
  if (isTomorrow(d, now)) return 'sutra';
  return longDate(d);
}
/** How each API currency is written after the amount: euro sign, KM for the Bosnian mark, the code for anything new. */
const CURRENCY_LABEL: Record<string, string> = { EUR: '€', BAM: 'KM' };
export function fee(type?: string | null, amount?: number | null, currency?: string | null): string | null {
  if (amount == null) return null;
  const n = Number.isInteger(amount) ? String(amount) : amount.toFixed(2).replace('.', ',');
  const cur = CURRENCY_LABEL[currency || 'EUR'] ?? currency;
  return type === 'PerMember' ? `${n} ${cur} po osobi` : `${n} ${cur} po ekipi`;
}
export function slugify(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}
/**
 * How few places have to be left before the site names the number.
 *
 * The count used to be printed in full - "12/18 ekipa" on a card, "6 slobodnih mjesta" on the
 * detail page - and a venue reported it working against them: someone opening a quiet week's quiz
 * saw how few teams were in and decided not to bother. Above this threshold every quiz now reads
 * the same, so a quiet one is indistinguishable from a busy one; below it the number is worth
 * saying, because by then it is genuine urgency rather than an empty room.
 *
 * The sign-up count itself is never printed anywhere a player can see it.
 */
export const SPOTS_NAMED_BELOW = 5;

/** Free places left, from whichever of the two the snapshot carries; null when the quiz has no cap. */
export function spotsLeft(e: { maxTeams: number | null; registered: number; spotsRemaining: number | null }): number | null {
  if (e.spotsRemaining != null) return e.spotsRemaining;
  return e.maxTeams ? Math.max(0, e.maxTeams - e.registered) : null;
}

/** "5+ slobodnih mjesta za ekipe", or the exact count once it drops below the threshold. */
export function freeSpots(e: { maxTeams: number | null; registered: number; spotsRemaining: number | null }): string | null {
  const n = spotsLeft(e);
  if (n == null) return null;
  if (n <= 0) return 'Nema slobodnih mjesta';
  return n < SPOTS_NAMED_BELOW
    ? `${plural(n, 'slobodno mjesto', 'slobodna mjesta', 'slobodnih mjesta')} za ekipe`
    : `${SPOTS_NAMED_BELOW}+ slobodnih mjesta za ekipe`;
}

/**
 * The "Mjesta" fact. An uncapped quiz says nothing about numbers at all: the only figure available
 * there is the sign-up count, which is the one figure this rule exists to keep quiet.
 */
export function spotsText(e: { maxTeams: number | null; registered: number; spotsRemaining: number | null }): string {
  return freeSpots(e) ?? 'Bez ograničenja broja ekipa';
}
/** Croatian plural for "ekipa": 1 ekipa, 2-4 ekipe, 5+ ekipa (with the 11-14 exception). */
export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return `${n} ${one}`;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return `${n} ${few}`;
  return `${n} ${many}`;
}
