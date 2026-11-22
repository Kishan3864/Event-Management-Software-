// All business dates are stored as local "YYYY-MM-DD" strings.

const pad = (n: number) => String(n).padStart(2, "0");

export function toYMD(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayYMD(): string {
  return toYMD(new Date());
}

export function parseYMD(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function isValidYMD(s: string | undefined | null): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(parseYMD(s).getTime());
}

export function addDays(s: string, n: number): string {
  const d = parseYMD(s);
  d.setDate(d.getDate() + n);
  return toYMD(d);
}

/** Whole days from b to a (a - b). */
export function diffDays(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(ay, am - 1, ad) - Date.UTC(by, bm - 1, bd)) / 86400000);
}

/** Event days, counting both ends (21 to 23 = 3 days). */
export function daysInclusive(from: string, to: string): number {
  if (!isValidYMD(from) || !isValidYMD(to)) return 1;
  return Math.max(1, diffDays(to, from) + 1);
}

export function startOfMonth(s: string): string {
  return s.slice(0, 8) + "01";
}

export function endOfMonth(s: string): string {
  const d = parseYMD(startOfMonth(s));
  d.setMonth(d.getMonth() + 1);
  d.setDate(0);
  return toYMD(d);
}

export function addMonths(s: string, n: number): string {
  const d = parseYMD(startOfMonth(s));
  d.setMonth(d.getMonth() + n);
  return toYMD(d);
}

export function overlaps(aFrom: string, aTo: string, bFrom: string, bTo: string): boolean {
  return aFrom <= bTo && bFrom <= aTo;
}

export function inRange(d: string, from: string, to: string): boolean {
  return d >= from && d <= to;
}

export interface FinancialYear {
  label: string; // 2026-27
  short: string; // 26-27
  start: string;
  end: string;
}

/** Indian financial year (1 April to 31 March). */
export function fyOf(s: string): FinancialYear {
  const d = parseYMD(s);
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  const next = y + 1;
  return {
    label: `${y}-${String(next).slice(2)}`,
    short: `${String(y).slice(2)}-${String(next).slice(2)}`,
    start: `${y}-04-01`,
    end: `${next}-03-31`,
  };
}

export const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
export const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3));
export const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function monthLabel(s: string): string {
  const d = parseYMD(s);
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}
