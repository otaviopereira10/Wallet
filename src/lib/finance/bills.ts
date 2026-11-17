import { addDays, diffDays, endOfMonth } from "./dates";
import { Dec as D, mulCents } from "./money";
import { occurrencesBetween } from "./recurrence";
import type { Bill, BillOccurrence, BillPayment, Cents, ISODate, Priority } from "./types";

export type OccurrenceStatus = "paid" | "partial" | "pending" | "overdue" | "waived";

export interface OccurrenceView {
  occurrence: BillOccurrence;
  bill: Bill;
  paid: Cents;
  remaining: Cents;
  /** Minimum still needed to satisfy the minimum payment (0 when met or not applicable). */
  minimumRemaining: Cents;
  status: OccurrenceStatus;
  daysUntilDue: number;
  payments: BillPayment[];
}

/** How far ahead recurring bills are materialised as occurrences. */
export const OCCURRENCE_HORIZON_DAYS = 62;

/** Due dates a bill should have from its first due date through `horizon`. */
export function expectedDueDates(bill: Bill, horizon: ISODate): ISODate[] {
  if (!bill.active) return [];
  return occurrencesBetween(
    { start: bill.firstDueDate, frequency: bill.recurrence, end: bill.endDate },
    bill.firstDueDate,
    horizon,
    240,
  );
}

/** Occurrences that must be created so the bill is materialised up to today + horizon. */
export function missingOccurrences(
  bill: Bill,
  existing: BillOccurrence[],
  today: ISODate,
): Array<{ dueDate: ISODate; amountDue: Cents; minimumDue: Cents | null }> {
  const have = new Set(existing.filter((o) => o.billId === bill.id).map((o) => o.dueDate));
  const horizon = bill.recurrence === "once" ? bill.firstDueDate : addDays(today, OCCURRENCE_HORIZON_DAYS);
  return expectedDueDates(bill, horizon)
    .filter((d) => !have.has(d))
    .map((dueDate) => ({ dueDate, amountDue: bill.amount, minimumDue: bill.minimumAmount }));
}

export function occurrenceView(
  occurrence: BillOccurrence,
  bill: Bill,
  payments: BillPayment[],
  today: ISODate,
): OccurrenceView {
  const own = payments.filter((p) => p.occurrenceId === occurrence.id);
  const paid = own.reduce((s, p) => s + p.amount, 0);
  const remaining = Math.max(0, occurrence.amountDue - paid);
  const minimum = occurrence.minimumDue ?? null;
  const minimumRemaining = minimum !== null ? Math.max(0, Math.min(minimum, occurrence.amountDue) - paid) : 0;
  let status: OccurrenceStatus;
  if (occurrence.waived) status = "waived";
  else if (remaining === 0) status = "paid";
  else if (occurrence.dueDate < today) status = "overdue";
  else if (paid > 0) status = "partial";
  else status = "pending";
  return {
    occurrence,
    bill,
    paid,
    remaining: occurrence.waived ? 0 : remaining,
    minimumRemaining: occurrence.waived ? 0 : minimumRemaining,
    status,
    daysUntilDue: diffDays(today, occurrence.dueDate),
    payments: own,
  };
}

export function buildOccurrenceViews(
  bills: Bill[],
  occurrences: BillOccurrence[],
  payments: BillPayment[],
  today: ISODate,
): OccurrenceView[] {
  const billById = new Map(bills.map((b) => [b.id, b]));
  const views: OccurrenceView[] = [];
  for (const o of occurrences) {
    const bill = billById.get(o.billId);
    if (!bill) continue;
    views.push(occurrenceView(o, bill, payments, today));
  }
  return views.sort((a, b) => (a.occurrence.dueDate < b.occurrence.dueDate ? -1 : a.occurrence.dueDate > b.occurrence.dueDate ? 1 : 0));
}

export function isOpen(v: OccurrenceView): boolean {
  return v.status === "pending" || v.status === "partial" || v.status === "overdue";
}

export interface BillBuckets {
  overdue: OccurrenceView[];
  dueToday: OccurrenceView[];
  next7: OccurrenceView[];
  next30: OccurrenceView[];
  /** Remaining amount of open occurrences due this month, plus everything overdue. */
  monthTotal: Cents;
  overdueTotal: Cents;
  paidThisMonth: Cents;
}

/** Groups open occurrences by urgency. Amounts are in each bill's currency — see bucketsInBase. */
export function billBuckets(views: OccurrenceView[], today: ISODate, toBase: (c: Cents, v: OccurrenceView) => Cents): BillBuckets {
  const in7 = addDays(today, 7);
  const in30 = addDays(today, 30);
  const monthEnd = endOfMonth(today);
  const monthStart = today.slice(0, 8) + "01";
  const out: BillBuckets = { overdue: [], dueToday: [], next7: [], next30: [], monthTotal: 0, overdueTotal: 0, paidThisMonth: 0 };
  for (const v of views) {
    for (const p of v.payments) if (p.date >= monthStart && p.date <= monthEnd) out.paidThisMonth += toBase(p.amount, v);
    if (!isOpen(v)) continue;
    const due = v.occurrence.dueDate;
    if (due < today) {
      out.overdue.push(v);
      out.overdueTotal += toBase(v.remaining, v);
    } else if (due === today) out.dueToday.push(v);
    else if (due <= in7) out.next7.push(v);
    else if (due <= in30) out.next30.push(v);
    if (due <= monthEnd) out.monthTotal += toBase(v.remaining, v);
  }
  return out;
}

/** Estimated cost of paying `amount` late by `days` days: fixed late fee + prorated annual interest. */
export function lateCost(bill: Pick<Bill, "lateFee" | "interestRate">, amount: Cents, days: number): Cents {
  if (days <= 0 || amount <= 0) return 0;
  const interest = mulCents(amount, new D(bill.interestRate || 0).div(100).mul(days).div(365));
  return bill.lateFee + interest;
}

export const PRIORITY_WEIGHT: Record<Priority, number> = { essential: 3, important: 2, optional: 1 };
