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
export function fee(type?: string | null, amount?: number | null): string | null {
  if (amount == null) return null;
  const n = Number.isInteger(amount) ? String(amount) : amount.toFixed(2).replace('.', ',');
  return type === 'PerMember' ? `${n} € po osobi` : `${n} € po ekipi`;
}
export function slugify(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}
/** "6 slobodnih mjesta za ekipe" from the capacity the API reports; null when the event has no cap. */
export function freeSpots(e: { maxTeams: number | null; registered: number; spotsRemaining: number | null }): string | null {
  if (!e.maxTeams) return null;
  const n = e.spotsRemaining ?? Math.max(0, e.maxTeams - e.registered);
  return n > 0 ? `${plural(n, 'slobodno mjesto', 'slobodna mjesta', 'slobodnih mjesta')} za ekipe` : 'Nema slobodnih mjesta';
}
/** The "Mjesta" fact: free capacity when the event has a cap, otherwise how many teams are in. */
export function spotsText(e: { maxTeams: number | null; registered: number; spotsRemaining: number | null }): string {
  return freeSpots(e) ?? (e.registered ? plural(e.registered, 'prijavljena ekipa', 'prijavljene ekipe', 'prijavljenih ekipa') : 'Bez ograničenja broja ekipa');
}
/** Croatian plural for "ekipa": 1 ekipa, 2-4 ekipe, 5+ ekipa (with the 11-14 exception). */
export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return `${n} ${one}`;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return `${n} ${few}`;
  return `${n} ${many}`;
}
