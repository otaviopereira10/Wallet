import { addMonths, eachMonthKey, endOfMonth, monthKey, monthStartFromKey, parts, startOfMonth, fromParts } from "./dates";
import { debtBalance } from "./debt";
import type { MoneyContext } from "./fx";
import { monthlySeries, netWorthSeries, periodFlows, spendingByCategory, type MonthFlowPoint, type NetWorthPoint, type PeriodFlows } from "./ledger";
import type { Cents, ISODate, Snapshot } from "./types";

export type ReportPeriod = "month" | "quarter" | "semester" | "year" | "custom";

export function periodRange(kind: ReportPeriod, ref: ISODate, custom?: { from: ISODate; to: ISODate }): { from: ISODate; to: ISODate } {
  const { y, m } = parts(ref);
  switch (kind) {
    case "month":
      return { from: startOfMonth(ref), to: endOfMonth(ref) };
    case "quarter": {
      const qStart = Math.floor((m - 1) / 3) * 3 + 1;
      const from = fromParts(y, qStart, 1);
      return { from, to: endOfMonth(addMonths(from, 2)) };
    }
    case "semester": {
      const from = fromParts(y, m <= 6 ? 1 : 7, 1);
      return { from, to: endOfMonth(addMonths(from, 5)) };
    }
    case "year":
      return { from: fromParts(y, 1, 1), to: fromParts(y, 12, 31) };
    case "custom":
      return custom ?? { from: startOfMonth(ref), to: endOfMonth(ref) };
  }
}

export interface ReportData {
  from: ISODate;
  to: ISODate;
  flows: PeriodFlows;
  byCategory: Array<{ category: string; amount: Cents; share: number }>;
  incomeByCategory: Array<{ category: string; amount: Cents }>;
  monthly: MonthFlowPoint[];
  netWorth: NetWorthPoint[];
  debt: Array<{ month: string; balance: Cents }>;
  budgetVsActual: Array<{ category: string; planned: Cents; actual: Cents }>;
  goals: Array<{ name: string; target: Cents; saved: Cents; savedInPeriod: Cents }>;
  savingsRate: number | null;
  transactionCount: number;
}

export function buildReport(s: Snapshot, ctx: MoneyContext, from: ISODate, to: ISODate): ReportData {
  const flows = periodFlows(s.transactions, s.accounts, ctx, from, to);
  const spending = spendingByCategory(s.transactions, s.accounts, ctx, from, to, { includePending: false });
  const totalSpend = Object.values(spending).reduce((a, b) => a + Math.max(0, b), 0);
  const byCategory = Object.entries(spending)
    .filter(([, v]) => v > 0)
    .map(([category, amount]) => ({ category, amount, share: totalSpend ? Math.round((amount / totalSpend) * 1000) / 10 : 0 }))
    .sort((a, b) => b.amount - a.amount);

  const incomeMap: Record<string, Cents> = {};
  const accountsById = new Map(s.accounts.map((a) => [a.id, a]));
  for (const t of s.transactions) {
    if (t.kind !== "income" || t.date < from || t.date > to) continue;
    const acc = t.accountId ? accountsById.get(t.accountId) : undefined;
    const v = acc && acc.currency === ctx.base && t.accountAmount !== null ? t.accountAmount : ctx.toBase(t.amount, t.currency, t.date);
    incomeMap[t.category ?? "other_income"] = (incomeMap[t.category ?? "other_income"] ?? 0) + v;
  }
  const incomeByCategory = Object.entries(incomeMap)
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);

  const months = eachMonthKey(from, to);
  const monthly = monthlySeries(s.transactions, s.accounts, ctx, months);
  const netWorth = netWorthSeries(s.accounts, s.transactions, s.debts, s.debtEvents, ctx, months, s.today);

  const debt = months
    .filter((k) => monthStartFromKey(k) <= s.today)
    .map((k) => {
      const end = endOfMonth(monthStartFromKey(k)) > s.today ? s.today : endOfMonth(monthStartFromKey(k));
      let balance = 0;
      for (const d of s.debts) {
        if (d.startDate > end) continue;
        balance += ctx.toBase(
          debtBalance(
            d,
            s.debtEvents.filter((e) => e.debtId === d.id),
            end,
          ),
          d.currency,
        );
      }
      return { month: k, balance };
    });

  const nMonths = months.length;
  const budgetVsActual = s.budgets.map((b) => ({
    category: b.category,
    planned: ctx.toBase(b.amount, b.currency) * nMonths,
    actual: Math.max(0, spending[b.category] ?? 0),
  }));

  const goals = s.goals
    .filter((g) => !g.archived)
    .map((g) => {
      const own = s.contributions.filter((c) => c.goalId === g.id);
      return {
        name: g.name,
        target: ctx.toBase(g.targetAmount, g.currency),
        saved: ctx.toBase(
          own.filter((c) => c.date <= to).reduce((a, c) => a + c.amount, 0),
          g.currency,
        ),
        savedInPeriod: ctx.toBase(
          own.filter((c) => c.date >= from && c.date <= to).reduce((a, c) => a + c.amount, 0),
          g.currency,
        ),
      };
    });

  return {
    from,
    to,
    flows,
    byCategory,
    incomeByCategory,
    monthly,
    netWorth,
    debt,
    budgetVsActual,
    goals,
    savingsRate: flows.income > 0 ? Math.round((flows.net / flows.income) * 1000) / 10 : null,
    transactionCount: s.transactions.filter((t) => t.date >= from && t.date <= to).length,
  };
}

export function lastMonths(today: ISODate, n: number): string[] {
  const end = monthKey(today);
  const start = monthKey(addMonths(startOfMonth(today), -(n - 1)));
  return eachMonthKey(monthStartFromKey(start), monthStartFromKey(end));
}
