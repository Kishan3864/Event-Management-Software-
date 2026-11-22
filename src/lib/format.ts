import { MONTHS_SHORT, WEEKDAYS_SHORT, isValidYMD, parseYMD } from "./dates";

const inr0 = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const inr2 = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function round2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/** Treat tiny floating residues as zero. */
export function isZero(n: number | undefined | null): boolean {
  return Math.abs(Number(n) || 0) < 0.005;
}

/**
 * Indian money format.
 * decimals "auto": no paise for whole rupees (₹1,25,000), 2 decimals otherwise (₹1,250.50).
 */
export function formatINR(
  n: number | undefined | null,
  opts: { decimals?: 0 | 2 | "auto"; symbol?: boolean } = {}
): string {
  const { decimals = "auto", symbol = true } = opts;
  const v = round2(Number(n) || 0);
  const neg = v < 0;
  const abs = Math.abs(v);
  let s: string;
  if (decimals === 0) s = inr0.format(Math.round(abs));
  else if (decimals === 2) s = inr2.format(abs);
  else s = Number.isInteger(abs) ? inr0.format(abs) : inr2.format(abs);
  return `${neg ? "-" : ""}${symbol ? "₹" : ""}${s}`;
}

export function formatNumber(n: number | undefined | null): string {
  const v = Number(n) || 0;
  return Number.isInteger(v) ? inr0.format(v) : inr2.format(v);
}

/** DD/MM/YYYY */
export function formatDate(s: string | undefined | null): string {
  if (!isValidYMD(s)) return "";
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
}

/** 21 Nov 2026 */
export function formatDateMedium(s: string | undefined | null): string {
  if (!isValidYMD(s)) return "";
  const d = parseYMD(s);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

/** Sat, 21 Nov */
export function formatDateShort(s: string | undefined | null): string {
  if (!isValidYMD(s)) return "";
  const d = parseYMD(s);
  return `${WEEKDAYS_SHORT[d.getDay()]}, ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

export function formatDateRange(from: string, to: string): string {
  if (!to || from === to) return formatDate(from);
  return `${formatDate(from)} – ${formatDate(to)}`;
}

export function formatDateRangeShort(from: string, to: string): string {
  if (!isValidYMD(from)) return "";
  const a = parseYMD(from);
  if (!to || from === to) return `${a.getDate()} ${MONTHS_SHORT[a.getMonth()]}`;
  const b = parseYMD(to);
  if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear())
    return `${a.getDate()}–${b.getDate()} ${MONTHS_SHORT[a.getMonth()]}`;
  return `${a.getDate()} ${MONTHS_SHORT[a.getMonth()]} – ${b.getDate()} ${MONTHS_SHORT[b.getMonth()]}`;
}

export function formatTime(t: string | undefined | null): string {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  if (Number.isNaN(h)) return t;
  const ampm = h >= 12 ? "PM" : "AM";
  const hh = h % 12 || 12;
  return `${hh}:${String(m || 0).padStart(2, "0")} ${ampm}`;
}

export function formatTimestamp(ts: { toDate?: () => Date } | null | undefined): string {
  if (!ts || typeof ts.toDate !== "function") return "";
  const d = ts.toDate();
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

export function formatPhone(m: string | undefined | null): string {
  const d = (m || "").replace(/\D/g, "");
  if (d.length === 10) return `${d.slice(0, 5)} ${d.slice(5)}`;
  return m || "";
}

export function cleanMobile(m: string): string {
  let d = (m || "").replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return d.slice(0, 10);
}

export function isValidMobile(m: string): boolean {
  return /^[6-9]\d{9}$/.test(m);
}

export function initials(name: string): string {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function safeFileName(s: string): string {
  return (s || "")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[-_]+|[-_]+$/g, "")
    .slice(0, 80);
}

// ---------- Amount in words (Indian system) ----------

const ONES = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  return TENS[Math.floor(n / 10)] + (n % 10 ? " " + ONES[n % 10] : "");
}

function threeDigits(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  return [h ? `${ONES[h]} Hundred` : "", r ? twoDigits(r) : ""].filter(Boolean).join(" ");
}

export function numberToWordsIndian(num: number): string {
  let n = Math.floor(Math.abs(num));
  if (n === 0) return "Zero";
  const parts: string[] = [];
  const crore = Math.floor(n / 10000000);
  n %= 10000000;
  const lakh = Math.floor(n / 100000);
  n %= 100000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  if (crore) parts.push(`${numberToWordsIndian(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (n) parts.push(threeDigits(n));
  return parts.join(" ");
}

/** "Rupees One Lakh Twenty Five Thousand Only" */
export function amountInWords(amount: number): string {
  const v = round2(Math.abs(Number(amount) || 0));
  let rupees = Math.floor(v);
  let paise = Math.round((v - rupees) * 100);
  if (paise >= 100) {
    rupees += 1;
    paise -= 100;
  }
  let s = `Rupees ${numberToWordsIndian(rupees)}`;
  if (paise) s += ` and ${twoDigits(paise)} Paise`;
  return `${s} Only`;
}
