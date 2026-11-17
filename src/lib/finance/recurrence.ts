import { Dec as D } from "./money";
import { addDays, addMonths, diffDays, diffMonths, parts } from "./dates";
import type { Cents, CustomUnit, ISODate } from "./types";

/**
 * Generic recurrence rule. Month-based steps are always computed from the
 * original start date (start + k·step months), so a rule anchored on the 31st
 * keeps falling on the last day of shorter months without drifting.
 */
export type RecurrenceFrequency =
  | "once"
  | "weekly"
  | "biweekly"
  | "monthly"
  | "quarterly"
  | "semiannual"
  | "yearly"
  | "custom"
  | "none";

export interface RecurrenceRule {
  start: ISODate;
  frequency: RecurrenceFrequency;
  interval?: number | null;
  unit?: CustomUnit | null;
  end?: ISODate | null;
}

type Step = { kind: "days"; n: number } | { kind: "months"; n: number } | { kind: "once" };

export function stepOf(rule: RecurrenceRule): Step {
  switch (rule.frequency) {
    case "once":
    case "none":
      return { kind: "once" };
    case "weekly":
      return { kind: "days", n: 7 };
    case "biweekly":
      return { kind: "days", n: 14 };
    case "monthly":
      return { kind: "months", n: 1 };
    case "quarterly":
      return { kind: "months", n: 3 };
    case "semiannual":
      return { kind: "months", n: 6 };
    case "yearly":
      return { kind: "months", n: 12 };
    case "custom": {
      const n = Math.max(1, Math.floor(rule.interval ?? 1));
      if (rule.unit === "month") return { kind: "months", n };
      if (rule.unit === "week") return { kind: "days", n: n * 7 };
      return { kind: "days", n };
    }
  }
}

/** k-th occurrence (0-based) ignoring the end date. */
export function nthOccurrence(rule: RecurrenceRule, k: number): ISODate {
  const step = stepOf(rule);
  if (step.kind === "once") return rule.start;
  if (step.kind === "days") return addDays(rule.start, k * step.n);
  return addMonths(rule.start, k * step.n, parts(rule.start).d);
}

/** All occurrences within [from, to] (inclusive), honouring start and end. */
export function occurrencesBetween(rule: RecurrenceRule, from: ISODate, to: ISODate, limit = 5000): ISODate[] {
  const out: ISODate[] = [];
  const last = rule.end && rule.end < to ? rule.end : to;
  if (last < rule.start || last < from) return out;
  const step = stepOf(rule);
  if (step.kind === "once") {
    if (rule.start >= from && rule.start <= last) out.push(rule.start);
    return out;
  }
  // Jump close to `from` instead of iterating from the start.
  let k = 0;
  if (from > rule.start) {
    if (step.kind === "days") k = Math.max(0, Math.floor(diffDays(rule.start, from) / step.n) - 1);
    else k = Math.max(0, Math.floor(diffMonths(rule.start, from) / step.n) - 1);
  }
  for (let i = 0; i < limit; i++, k++) {
    const date = nthOccurrence(rule, k);
    if (date > last) break;
    if (date >= from) out.push(date);
  }
  return out;
}

/** First occurrence on or after `date`, or null if the rule has ended. */
export function nextOccurrenceOnOrAfter(rule: RecurrenceRule, date: ISODate): ISODate | null {
  const step = stepOf(rule);
  if (step.kind === "once") return rule.start >= date && (!rule.end || rule.start <= rule.end) ? rule.start : null;
  const horizon = step.kind === "days" ? addDays(date, step.n + 1) : addMonths(date, step.n + 1);
  const list = occurrencesBetween(rule, date, horizon, 10);
  return list[0] ?? null;
}

/**
 * Average monthly equivalent of a recurring amount. Weekly uses 52/12 and
 * biweekly 26/12; other day-based steps use 365/12 days per month; one-off
 * rules return 0 (they are not a monthly commitment).
 */
export function monthlyEquivalent(amount: Cents, rule: Pick<RecurrenceRule, "frequency" | "interval" | "unit">): Cents {
  const step = stepOf({ start: "2000-01-01", ...rule });
  if (step.kind === "once") return 0;
  if (step.kind === "months") return new D(amount).div(step.n).toDecimalPlaces(0).toNumber();
  if (step.n === 7) return new D(amount).mul(52).div(12).toDecimalPlaces(0).toNumber();
  if (step.n === 14) return new D(amount).mul(26).div(12).toDecimalPlaces(0).toNumber();
  return new D(amount).mul(365).div(12).div(step.n).toDecimalPlaces(0).toNumber();
}

/** The occurrence right after `date` according to the rule's step (used to advance subscriptions). */
export function advanceOnce(rule: RecurrenceRule, date: ISODate): ISODate {
  const step = stepOf(rule);
  if (step.kind === "once") return date;
  if (step.kind === "days") return addDays(date, step.n);
  return addMonths(date, step.n, parts(rule.start).d);
}
