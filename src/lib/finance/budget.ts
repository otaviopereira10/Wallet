import { categoryLabel as labelFor } from "../constants";
import { diffDays, endOfMonth, startOfMonth } from "./dates";
import type { MoneyContext } from "./fx";
import { spendingByCategory, txBaseAmount } from "./ledger";
import type { Budget, Cents, ISODate, Snapshot, Transaction } from "./types";

export type BudgetState = "ok" | "warning" | "over";

export interface BudgetLine {
  budget: Budget;
  category: string;
  limit: Cents;
  spent: Cents;
  remaining: Cents;
  percent: number;
  state: BudgetState;
  projected: Cents;
  projectedState: BudgetState;
  dailyAllowance: Cents;
  topExpenses: Array<{ id: string; description: string; date: ISODate; amount: Cents }>;
}

export interface BudgetSummary {
  month: string;
  lines: BudgetLine[];
  totalLimit: Cents;
  totalSpent: Cents;
  totalRemaining: Cents;
  percent: number;
  totalProjected: Cents;
  daysElapsed: number;
  daysInMonth: number;
  unbudgeted: Array<{ category: string; spent: Cents }>;
  recommendations: string[];
}

export const WARNING_THRESHOLD = 80;

export function stateOf(spent: Cents, limit: Cents): BudgetState {
  if (limit <= 0) return spent > 0 ? "over" : "ok";
  const pct = (spent / limit) * 100;
  if (pct > 100) return "over";
  if (pct >= WARNING_THRESHOLD) return "warning";
  return "ok";
}

/**
 * Budget for the month containing `refDate`.
 * Spending = paid + pending expenses − refunds (pending expenses are already
 * committed). Projection to month end = spent so far + variable daily pace ×
 * remaining days, where the pace ignores recurring/scheduled items (they do
 * not repeat inside the month).
 */
export function budgetSummary(s: Snapshot, ctx: MoneyContext, refDate: ISODate, fmt: (c: Cents) => string): BudgetSummary {
  const from = startOfMonth(refDate);
  const to = endOfMonth(refDate);
  const isCurrent = s.today >= from && s.today <= to;
  const daysInMonth = diffDays(from, to) + 1;
  const daysElapsed = isCurrent ? diffDays(from, s.today) + 1 : s.today > to ? daysInMonth : 0;
  const remainingDays = daysInMonth - daysElapsed;
  const spending = spendingByCategory(s.transactions, s.accounts, ctx, from, to, { includePending: true });
  const accountsById = new Map(s.accounts.map((a) => [a.id, a]));
  const billTx = new Set(s.billPayments.map((p) => p.transactionId).filter(Boolean) as string[]);
  const isVariable = (t: Transaction) =>
    t.kind === "expense" && t.recurrence === "none" && !t.subscriptionId && !billTx.has(t.id);

  const lines: BudgetLine[] = s.budgets.map((b) => {
    const limit = ctx.toBase(b.amount, b.currency);
    const spent = Math.max(0, spending[b.category] ?? 0);
    const inCat = s.transactions.filter(
      (t) => t.category === b.category && t.date >= from && t.date <= to && t.kind === "expense",
    );
    const variableSoFar = inCat
      .filter((t) => isVariable(t) && t.date <= s.today)
      .reduce((sum, t) => sum + txBaseAmount(t, accountsById, ctx), 0);
    const pace = daysElapsed > 0 ? variableSoFar / daysElapsed : 0;
    const projected = isCurrent ? Math.round(spent + pace * remainingDays) : spent;
    const remaining = limit - spent;
    return {
      budget: b,
      category: b.category,
      limit,
      spent,
      remaining,
      percent: limit > 0 ? Math.round((spent / limit) * 1000) / 10 : spent > 0 ? 100 : 0,
      state: stateOf(spent, limit),
      projected,
      projectedState: stateOf(projected, limit),
      dailyAllowance: remainingDays > 0 ? Math.max(0, Math.floor(remaining / remainingDays)) : 0,
      topExpenses: inCat
        .map((t) => ({ id: t.id, description: t.description, date: t.date, amount: txBaseAmount(t, accountsById, ctx) }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 3),
    };
  });

  const budgeted = new Set(s.budgets.map((b) => b.category));
  const unbudgeted = Object.entries(spending)
    .filter(([cat, v]) => !budgeted.has(cat) && v > 0)
    .map(([category, spent]) => ({ category, spent }))
    .sort((a, b) => b.spent - a.spent);

  const totalLimit = lines.reduce((s2, l) => s2 + l.limit, 0);
  const totalSpent = lines.reduce((s2, l) => s2 + l.spent, 0);
  const totalProjected = lines.reduce((s2, l) => s2 + l.projected, 0);

  const recommendations: string[] = [];
  for (const l of lines) {
    if (l.state === "over") {
      recommendations.push(
        `${labelFor(l.category)}: over the limit by ${fmt(l.spent - l.limit)}. Try to avoid new spending here until the end of the month${
          l.topExpenses[0] ? `; the biggest expense was “${l.topExpenses[0].description}” (${fmt(l.topExpenses[0].amount)})` : ""
        }.`,
      );
    } else if (isCurrent && l.projectedState === "over") {
      recommendations.push(
        `${labelFor(l.category)}: at this pace you will spend about ${fmt(l.projected)} (limit ${fmt(l.limit)}). To stay within it, keep to ${fmt(l.dailyAllowance)} per day for the ${remainingDays} day(s) left.`,
      );
    } else if (l.state === "warning") {
      recommendations.push(
        `${labelFor(l.category)}: ${l.percent}% of the limit used. ${fmt(Math.max(0, l.remaining))} left for the month.`,
      );
    }
  }

  return {
    month: from.slice(0, 7),
    lines,
    totalLimit,
    totalSpent,
    totalRemaining: totalLimit - totalSpent,
    percent: totalLimit > 0 ? Math.round((totalSpent / totalLimit) * 1000) / 10 : 0,
    totalProjected,
    daysElapsed,
    daysInMonth,
    unbudgeted,
    recommendations,
  };
}
