import Decimal from "decimal.js";
import type { Cents } from "./types";

/**
 * Money helpers. All arithmetic on stored values happens on integer cents, so
 * additions and subtractions are exact. Anything involving a rate (interest,
 * exchange) goes through decimal.js and is rounded once, half away from zero,
 * to whole cents.
 */
const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export { D as Dec };

/** Parses a decimal string/number ("1234.5", 1234.5, "-0.01") into cents. */
export function toCents(value: string | number | null | undefined): Cents {
  if (value === null || value === undefined || value === "") return 0;
  const d = new D(typeof value === "number" ? value.toString() : value.trim());
  if (!d.isFinite()) throw new Error("Invalid money amount");
  return d.mul(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
}

/** Same as toCents but keeps null. */
export function toCentsOrNull(value: string | number | null | undefined): Cents | null {
  if (value === null || value === undefined || value === "") return null;
  return toCents(value);
}

/** Converts cents to a fixed 2-decimal string ("1234.50") suitable for numeric(14,2). */
export function centsToDecimalString(cents: Cents): string {
  assertCents(cents);
  return new D(cents).div(100).toFixed(2);
}

/** Converts cents to a JS number in major units — only for charts/display. */
export function centsToNumber(cents: Cents): number {
  return cents / 100;
}

export function assertCents(cents: number): void {
  if (!Number.isSafeInteger(cents)) throw new Error(`Invalid amount in cents: ${cents}`);
}

/** cents × factor, rounded half away from zero to whole cents. */
export function mulCents(cents: Cents, factor: Decimal.Value): Cents {
  return new D(cents).mul(factor).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
}

/** cents ÷ divisor, rounded half away from zero. */
export function divCents(cents: Cents, divisor: Decimal.Value): Cents {
  const d = new D(divisor);
  if (d.isZero()) throw new Error("Division by zero");
  return new D(cents).div(d).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
}

/** Annual percent rate → monthly interest on a balance, in cents. */
export function monthlyInterest(balance: Cents, annualRatePercent: Decimal.Value): Cents {
  if (balance <= 0) return 0;
  return mulCents(balance, new D(annualRatePercent).div(100).div(12));
}

export function sumCents(values: Iterable<Cents>): Cents {
  let total = 0;
  for (const v of values) total += v;
  return total;
}

/** Percentage (0–100+) of part over whole, with one decimal. Returns null if whole is 0. */
export function percentOf(part: Cents, whole: Cents): number | null {
  if (whole === 0) return null;
  return Math.round((part / whole) * 1000) / 10;
}

/** Rounds cents down to a multiple of `step` cents (e.g. 1000 = $10). */
export function floorTo(cents: Cents, step: Cents): Cents {
  if (cents <= 0) return 0;
  return Math.floor(cents / step) * step;
}

export function isValidRate(rate: string | number): boolean {
  try {
    const d = new D(rate);
    return d.isFinite() && d.gt(0);
  } catch {
    return false;
  }
}
