import { buildOccurrenceViews, expectedDueDates, isOpen, type OccurrenceView } from "./bills";
import { addDays, endOfMonth, fromParts, monthKey, parts, startOfMonth, startOfWeek, addMonths } from "./dates";
import { debtBalance } from "./debt";
import type { MoneyContext } from "./fx";
import { advanceOnce, nextOccurrenceOnOrAfter, occurrencesBetween } from "./recurrence";
import type { Cents, Income, ISODate, Snapshot, Transaction } from "./types";

export type FlowEventType = "income" | "bill" | "expense" | "recurring" | "subscription" | "debt" | "goal" | "whatif";

export interface FlowEvent {
  id: string;
  date: ISODate;
  type: FlowEventType;
  label: string;
  /** Signed amount in base currency: + money in, − money out. */
  amount: Cents;
  /** Original date when the event was moved to today (overdue). */
  originalDate?: ISODate;
  refId?: string;
  priority?: string;
}

// ---------------------------------------------------------------------------
// Incomes
// ---------------------------------------------------------------------------
export function incomeRule(i: Income) {
  return {
    start: i.startDate,
    frequency: i.frequency,
    interval: i.customInterval,
    unit: i.customUnit,
    end: i.endDate,
  } as const;
}

function receivedSet(transactions: Transaction[]): Set<string> {
  const s = new Set<string>();
  for (const t of transactions) if (t.incomeId && t.incomeOccurrence) s.add(`${t.incomeId}|${t.incomeOccurrence}`);
  return s;
}

/** Expected receipts in [from, to] that were not received or skipped yet. */
export function expectedIncomeOccurrences(
  incomes: Income[],
  transactions: Transaction[],
  from: ISODate,
  to: ISODate,
): Array<{ income: Income; date: ISODate }> {
  const received = receivedSet(transactions);
  const out: Array<{ income: Income; date: ISODate }> = [];
  for (const inc of incomes) {
    if (!inc.active) continue;
    for (const date of occurrencesBetween(incomeRule(inc), from, to, 1000)) {
      if (received.has(`${inc.id}|${date}`) || inc.skippedDates.includes(date)) continue;
      out.push({ income: inc, date });
    }
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}

/**
 * Past receipts (up to 60 days back, never before the income was registered)
 * still waiting for confirmation. They are NOT counted as money available.
 */
export function unconfirmedIncomes(incomes: Income[], transactions: Transaction[], today: ISODate) {
  const out: Array<{ income: Income; date: ISODate }> = [];
  for (const inc of incomes) {
    const from = [addDays(today, -60), inc.createdOn, inc.startDate].sort().pop()!;
    const list = expectedIncomeOccurrences([inc], transactions, from, addDays(today, -1));
    out.push(...list);
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}

export function nextIncomeOccurrence(inc: Income, transactions: Transaction[], from: ISODate): ISODate | null {
  const list = expectedIncomeOccurrences([inc], transactions, from, addDays(from, 400));
  return list[0]?.date ?? null;
}

// ---------------------------------------------------------------------------
// Recurring expenses (series)
// ---------------------------------------------------------------------------
export interface RecurringSeries {
  seriesId: string;
  latest: Transaction;
  nextDate: ISODate | null;
}

export function recurringExpenseSeries(transactions: Transaction[]): RecurringSeries[] {
  const latestBySeries = new Map<string, Transaction>();
  for (const t of transactions) {
    if (t.kind !== "expense" || t.recurrence === "none" || t.subscriptionId) continue;
    const key = t.seriesId ?? t.id;
    const cur = latestBySeries.get(key);
    if (!cur || t.date > cur.date) latestBySeries.set(key, t);
  }
  return [...latestBySeries.entries()].map(([seriesId, latest]) => ({
    seriesId,
    latest,
    nextDate: advanceOnce({ start: latest.date, frequency: latest.recurrence }, latest.date),
  }));
}

// ---------------------------------------------------------------------------
// Event collection
// ---------------------------------------------------------------------------
export interface CollectOptions {
  to: ISODate;
  includeGoals?: boolean;
  views?: OccurrenceView[];
}

/** All expected money movements from today through `to`, in base currency. */
export function collectFlowEvents(s: Snapshot, ctx: MoneyContext, opts: CollectOptions): FlowEvent[] {
  const today = s.today;
  const to = opts.to;
  const events: FlowEvent[] = [];
  const at = (date: ISODate) => (date < today ? today : date);

  // Expected incomes (only from today on — past unconfirmed ones are not money).
  for (const { income, date } of expectedIncomeOccurrences(s.incomes, s.transactions, today, to)) {
    events.push({
      id: `inc:${income.id}:${date}`,
      date,
      type: "income",
      label: income.name,
      amount: ctx.toBase(income.amount, income.currency),
      refId: income.id,
    });
  }

  // Bills: materialised open occurrences + virtual ones beyond the materialised horizon.
  const views = opts.views ?? buildOccurrenceViews(s.bills, s.occurrences, s.billPayments, today);
  const lastMaterialised = new Map<string, ISODate>();
  for (const v of views) {
    const prev = lastMaterialised.get(v.bill.id);
    if (!prev || v.occurrence.dueDate > prev) lastMaterialised.set(v.bill.id, v.occurrence.dueDate);
    if (!isOpen(v) || v.occurrence.dueDate > to) continue;
    events.push({
      id: `bill:${v.occurrence.id}`,
      date: at(v.occurrence.dueDate),
      originalDate: v.occurrence.dueDate < today ? v.occurrence.dueDate : undefined,
      type: "bill",
      label: v.bill.name,
      amount: -ctx.toBase(v.remaining, v.bill.currency),
      refId: v.occurrence.id,
      priority: v.bill.priority,
    });
  }
  for (const bill of s.bills) {
    if (!bill.active || bill.recurrence === "once") continue;
    const after = lastMaterialised.get(bill.id) ?? addDays(today, -1);
    for (const date of expectedDueDates(bill, to)) {
      if (date <= after || date < today) continue;
      events.push({
        id: `billv:${bill.id}:${date}`,
        date,
        type: "bill",
        label: bill.name,
        amount: -ctx.toBase(bill.amount, bill.currency),
        refId: bill.id,
        priority: bill.priority,
      });
    }
  }

  // Pending expenses (commitments not yet paid).
  for (const t of s.transactions) {
    if (t.kind !== "expense" || t.status !== "pending" || t.date > to) continue;
    events.push({
      id: `exp:${t.id}`,
      date: at(t.date),
      originalDate: t.date < today ? t.date : undefined,
      type: "expense",
      label: t.description,
      amount: -ctx.toBase(t.amount, t.currency),
      refId: t.id,
    });
  }

  // Projected recurring expenses (after the latest recorded one of each series).
  for (const series of recurringExpenseSeries(s.transactions)) {
    const t = series.latest;
    const rule = { start: t.date, frequency: t.recurrence };
    for (const date of occurrencesBetween(rule, addDays(t.date, 1), to, 500)) {
      if (date < addDays(today, -31)) continue;
      events.push({
        id: `rec:${series.seriesId}:${date}`,
        date: at(date),
        originalDate: date < today ? date : undefined,
        type: "recurring",
        label: t.description,
        amount: -ctx.toBase(t.amount, t.currency),
        refId: t.id,
      });
    }
  }

  // Subscriptions (active or still running until cancelled).
  for (const sub of s.subscriptions) {
    if (sub.status === "cancelled") continue;
    let date = sub.nextChargeDate;
    for (let i = 0; i < 400 && date <= to; i++) {
      events.push({
        id: `sub:${sub.id}:${date}`,
        date: at(date),
        originalDate: date < today ? date : undefined,
        type: "subscription",
        label: sub.name,
        amount: -ctx.toBase(sub.amount, sub.currency),
        refId: sub.id,
      });
      date = advanceOnce({ start: sub.nextChargeDate, frequency: sub.billingCycle }, date);
    }
  }

  // Planned debt payments.
  for (const debt of s.debts) {
    if (!debt.active || debt.plannedMonthlyPayment <= 0) continue;
    const evs = s.debtEvents.filter((e) => e.debtId === debt.id);
    let balance = debtBalance(debt, evs);
    if (balance <= 0) continue;
    const monthStart = startOfMonth(today);
    const paidThisMonth = evs
      .filter((e) => e.type === "payment" && !e.voided && e.date >= monthStart && e.date <= today)
      .reduce((sum, e) => sum + e.amount, 0);
    for (let i = 0; i < 400; i++) {
      const anyDay = addMonths(monthStart, i);
      const { y, m } = parts(anyDay);
      const due = fromParts(y, m, debt.paymentDay);
      if (due > to) break;
      let amount = debt.plannedMonthlyPayment;
      if (i === 0) amount = Math.max(0, amount - paidThisMonth);
      amount = Math.min(amount, balance);
      if (amount <= 0) continue;
      balance -= amount;
      events.push({
        id: `debt:${debt.id}:${due}`,
        date: at(due),
        originalDate: due < today ? due : undefined,
        type: "debt",
        label: `Planned payment — ${debt.name}`,
        amount: -ctx.toBase(amount, debt.currency),
        refId: debt.id,
      });
    }
  }

  // Planned goal contributions (money set aside, optional).
  if (opts.includeGoals) {
    const monthStart = startOfMonth(today);
    for (const g of s.goals) {
      if (g.archived || g.monthlyContribution <= 0) continue;
      const contribs = s.contributions.filter((c) => c.goalId === g.id);
      let saved = contribs.reduce((sum, c) => sum + c.amount, 0);
      const thisMonth = contribs.filter((c) => c.date >= monthStart).reduce((sum, c) => sum + c.amount, 0);
      for (let i = 0; i < 400; i++) {
        const date = i === 0 ? endOfMonth(today) : startOfMonth(addMonths(monthStart, i));
        if (date > to) break;
        let amount = i === 0 ? Math.max(0, g.monthlyContribution - thisMonth) : g.monthlyContribution;
        amount = Math.min(amount, Math.max(0, g.targetAmount - saved));
        if (amount <= 0) continue;
        saved += amount;
        events.push({
          id: `goal:${g.id}:${date}`,
          date,
          type: "goal",
          label: `Set aside for goal — ${g.name}`,
          amount: -ctx.toBase(amount, g.currency),
          refId: g.id,
        });
      }
    }
  }

  return events.sort((a, b) => (a.date === b.date ? b.amount - a.amount : a.date < b.date ? -1 : 1));
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------
export interface TimelineDay {
  date: ISODate;
  inflow: Cents;
  outflow: Cents;
  balance: Cents;
  events: FlowEvent[];
}

export function buildTimeline(start: Cents, events: FlowEvent[], from: ISODate, to: ISODate): TimelineDay[] {
  const byDate = new Map<ISODate, FlowEvent[]>();
  for (const e of events) {
    if (e.date < from || e.date > to) continue;
    const list = byDate.get(e.date) ?? [];
    list.push(e);
    byDate.set(e.date, list);
  }
  const days: TimelineDay[] = [];
  let balance = start;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const evs = byDate.get(d) ?? [];
    let inflow = 0;
    let outflow = 0;
    for (const e of evs) {
      if (e.amount >= 0) inflow += e.amount;
      else outflow += -e.amount;
    }
    balance += inflow - outflow;
    days.push({ date: d, inflow, outflow, balance, events: evs });
  }
  return days;
}

export interface TimelineBucket {
  key: string;
  from: ISODate;
  to: ISODate;
  opening: Cents;
  inflow: Cents;
  outflow: Cents;
  closing: Cents;
}

export function aggregateTimeline(start: Cents, days: TimelineDay[], by: "week" | "month"): TimelineBucket[] {
  const buckets: TimelineBucket[] = [];
  let opening = start;
  let current: TimelineBucket | null = null;
  for (const day of days) {
    const key = by === "week" ? startOfWeek(day.date) : monthKey(day.date);
    if (!current || current.key !== key) {
      if (current) {
        buckets.push(current);
        opening = current.closing;
      }
      current = { key, from: day.date, to: day.date, opening, inflow: 0, outflow: 0, closing: opening };
    }
    current.to = day.date;
    current.inflow += day.inflow;
    current.outflow += day.outflow;
    current.closing = day.balance;
  }
  if (current) buckets.push(current);
  return buckets;
}

export function lowestPoint(days: TimelineDay[]): { date: ISODate; balance: Cents } | null {
  if (!days.length) return null;
  return days.reduce((low, d) => (d.balance < low.balance ? { date: d.date, balance: d.balance } : low), {
    date: days[0].date,
    balance: days[0].balance,
  });
}

/** Sum of outflows (positive number) with date ≤ until. */
export function obligationsUntil(events: FlowEvent[], until: ISODate, types?: FlowEventType[]): Cents {
  let total = 0;
  for (const e of events) {
    if (e.amount >= 0 || e.date > until) continue;
    if (types && !types.includes(e.type)) continue;
    total += -e.amount;
  }
  return total;
}

export interface SafeToSpend {
  spendable: Cents;
  obligations: Cents;
  buffer: Cents;
  amount: Cents;
  until: ISODate;
}

/**
 * Money that can be spent now without compromising obligations up to `until`
 * and without touching the emergency buffer. Future incomes are NOT counted.
 */
export function safeToSpendUntil(spendable: Cents, events: FlowEvent[], until: ISODate, buffer: Cents): SafeToSpend {
  const obligations = obligationsUntil(events, until);
  return { spendable, obligations, buffer, amount: Math.max(0, spendable - obligations - buffer), until };
}

/**
 * Maximum one-off spend today that keeps every future projected day (with
 * expected incomes) at or above the buffer.
 */
export function maxSpendKeepingFloor(days: TimelineDay[], buffer: Cents): Cents {
  const low = lowestPoint(days);
  if (!low) return 0;
  return Math.max(0, low.balance - buffer);
}

export function nextIncomeEvent(events: FlowEvent[], from: ISODate): FlowEvent | null {
  return events.find((e) => e.type === "income" && e.date >= from) ?? null;
}

export { nextOccurrenceOnOrAfter };
