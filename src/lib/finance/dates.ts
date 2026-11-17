import type { ISODate } from "./types";

/**
 * Date-only helpers working on "YYYY-MM-DD" strings in UTC arithmetic, so the
 * result never depends on the server's or browser's local time zone. "Today"
 * is resolved explicitly in the user's IANA time zone.
 */
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isISODate(value: string): boolean {
  const m = ISO_RE.exec(value);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  return mo >= 1 && mo <= 12 && d >= 1 && d <= daysInMonth(y, mo);
}

export function parts(date: ISODate): { y: number; m: number; d: number } {
  const match = ISO_RE.exec(date);
  if (!match) throw new Error(`Data inválida: ${date}`);
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

export function fromParts(y: number, m: number, d: number): ISODate {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function toUTC(date: ISODate): number {
  const { y, m, d } = parts(date);
  return Date.UTC(y, m - 1, d);
}

function fromUTC(ms: number): ISODate {
  const dt = new Date(ms);
  return fromParts(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export function addDays(date: ISODate, days: number): ISODate {
  return fromUTC(toUTC(date) + days * 86_400_000);
}

/**
 * Adds months keeping the anchor day when possible and clamping to the end of
 * shorter months (Jan 31 + 1 month = Feb 28/29; + 2 months = Mar 31).
 */
export function addMonths(date: ISODate, months: number, anchorDay?: number): ISODate {
  const { y, m, d } = parts(date);
  const day = anchorDay ?? d;
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return fromParts(ny, nm, Math.min(day, daysInMonth(ny, nm)));
}

/** Whole days from a to b (positive when b is after a). */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((toUTC(b) - toUTC(a)) / 86_400_000);
}

/** Whole calendar months from a to b, ignoring days. */
export function diffMonths(a: ISODate, b: ISODate): number {
  const pa = parts(a);
  const pb = parts(b);
  return (pb.y - pa.y) * 12 + (pb.m - pa.m);
}

export function startOfMonth(date: ISODate): ISODate {
  const { y, m } = parts(date);
  return fromParts(y, m, 1);
}

export function endOfMonth(date: ISODate): ISODate {
  const { y, m } = parts(date);
  return fromParts(y, m, daysInMonth(y, m));
}

export function monthKey(date: ISODate): string {
  return date.slice(0, 7);
}

export function monthStartFromKey(key: string): ISODate {
  return `${key}-01`;
}

export function addMonthKey(key: string, n: number): string {
  return monthKey(addMonths(monthStartFromKey(key), n));
}

/** Monday-based start of week. */
export function startOfWeek(date: ISODate): ISODate {
  const dow = new Date(toUTC(date)).getUTCDay(); // 0 = Sunday
  const offset = (dow + 6) % 7;
  return addDays(date, -offset);
}

export function weekday(date: ISODate): number {
  return new Date(toUTC(date)).getUTCDay();
}

export function minDate(a: ISODate, b: ISODate): ISODate {
  return a <= b ? a : b;
}

export function maxDate(a: ISODate, b: ISODate): ISODate {
  return a >= b ? a : b;
}

export function isBetween(date: ISODate, from: ISODate, to: ISODate): boolean {
  return date >= from && date <= to;
}

/** Current calendar date in the given IANA time zone. */
export function todayInTimeZone(timeZone: string, now: Date = new Date()): ISODate {
  try {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return fmt.format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Inclusive list of dates from `from` to `to`. */
export function eachDay(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** List of month keys covering [from, to]. */
export function eachMonthKey(from: ISODate, to: ISODate): string[] {
  const out: string[] = [];
  let key = monthKey(from);
  const last = monthKey(to);
  while (key <= last) {
    out.push(key);
    key = addMonthKey(key, 1);
  }
  return out;
}
