import { CATEGORY_PRIORITY, type ExpenseCategory } from "../constants";
import { addMonthKey, endOfMonth, monthKey, monthStartFromKey } from "./dates";
import type { MoneyContext } from "./fx";
import { txBaseAmount } from "./ledger";
import { monthlyEquivalent } from "./recurrence";
import type { Cents, Snapshot } from "./types";

/**
 * Monthly capacity: how much money is typically left each month after the
 * recurring commitments and the usual variable spending. Every number comes
 * from registered data; when something is missing the estimate says so.
 */
export interface CapacityEstimate {
  monthlyIncome: Cents | null;
  recurringObligations: Cents;
  essentialRecurring: Cents;
  variableSpending: Cents | null;
  essentialVariable: Cents | null;
  monthsOfHistory: number;
  plannedDebt: Cents;
  plannedGoals: Cents;
  /** income − recurring obligations − variable spending (before debt plan and goals). */
  surplus: Cents | null;
  /** Estimated essential cost of living per month. */
  essentialMonthly: Cents | null;
  emergencyFund: Cents;
  emergencyMonths: number | null;
  assumptions: string[];
  missing: string[];
}

function isEssential(category: string | null): boolean {
  return CATEGORY_PRIORITY[(category ?? "other") as ExpenseCategory] === "essential";
}

export function estimateCapacity(s: Snapshot, ctx: MoneyContext): CapacityEstimate {
  const assumptions: string[] = [];
  const missing: string[] = [];

  // Income: average monthly equivalent of active recurring income rules.
  let monthlyIncome: Cents | null = null;
  const recurringIncomes = s.incomes.filter((i) => i.active && i.frequency !== "once" && (!i.endDate || i.endDate >= s.today));
  if (recurringIncomes.length) {
    monthlyIncome = recurringIncomes.reduce(
      (sum, i) =>
        sum +
        ctx.toBase(
          monthlyEquivalent(i.amount, { frequency: i.frequency, interval: i.customInterval, unit: i.customUnit }),
          i.currency,
        ),
      0,
    );
    assumptions.push("Monthly income = monthly average of your active recurring income (one-time income is not included).");
  } else {
    missing.push("recurring income");
  }

  // Recurring obligations.
  let recurringObligations = 0;
  let essentialRecurring = 0;
  for (const b of s.bills) {
    if (!b.active || b.recurrence === "once" || (b.endDate && b.endDate < s.today)) continue;
    const v = ctx.toBase(monthlyEquivalent(b.amount, { frequency: b.recurrence }), b.currency);
    recurringObligations += v;
    if (b.priority === "essential") essentialRecurring += v;
  }
  for (const sub of s.subscriptions) {
    if (sub.status === "cancelled") continue;
    recurringObligations += ctx.toBase(monthlyEquivalent(sub.amount, { frequency: sub.billingCycle }), sub.currency);
  }
  const latestBySeries = new Map<string, (typeof s.transactions)[number]>();
  for (const t of s.transactions) {
    if (t.kind !== "expense" || t.recurrence === "none" || t.subscriptionId) continue;
    const key = t.seriesId ?? t.id;
    const cur = latestBySeries.get(key);
    if (!cur || t.date > cur.date) latestBySeries.set(key, t);
  }
  for (const t of latestBySeries.values()) {
    const v = ctx.toBase(monthlyEquivalent(t.amount, { frequency: t.recurrence }), t.currency);
    recurringObligations += v;
    if (isEssential(t.category)) essentialRecurring += v;
  }

  // Variable spending: last 3 complete months, excluding bill payments,
  // subscription charges and recurring series (already counted above).
  const billTx = new Set(s.billPayments.map((p) => p.transactionId).filter(Boolean) as string[]);
  const accountsById = new Map(s.accounts.map((a) => [a.id, a]));
  const currentKey = monthKey(s.today);
  const firstTx = s.transactions.reduce<string | null>((min, t) => (!min || t.date < min ? t.date : min), null);
  const months: string[] = [];
  for (let i = 1; i <= 3; i++) {
    const key = addMonthKey(currentKey, -i);
    if (firstTx && endOfMonth(monthStartFromKey(key)) >= firstTx) months.push(key);
  }
  let variableSpending: Cents | null = null;
  let essentialVariable: Cents | null = null;
  if (months.length) {
    let total = 0;
    let essential = 0;
    for (const t of s.transactions) {
      if (t.kind !== "expense" && t.kind !== "refund") continue;
      if (t.kind === "expense" && (billTx.has(t.id) || t.subscriptionId || t.recurrence !== "none")) continue;
      if (!months.includes(monthKey(t.date))) continue;
      const v = txBaseAmount(t, accountsById, ctx) * (t.kind === "refund" ? -1 : 1);
      total += v;
      if (isEssential(t.category)) essential += v;
    }
    variableSpending = Math.round(total / months.length);
    essentialVariable = Math.round(essential / months.length);
    assumptions.push(`Everyday spending = average of the last ${months.length} full month(s) on record.`);
  } else {
    const budgetTotal = s.budgets.reduce((sum, b) => sum + ctx.toBase(b.amount, b.currency), 0);
    if (budgetTotal > 0) {
      variableSpending = budgetTotal;
      assumptions.push("No full months of history yet: everyday spending estimated from your monthly budget total.");
    } else {
      missing.push("at least 1 full month of expenses (or a monthly budget)");
    }
  }

  const plannedDebt = s.debts
    .filter((d) => d.active)
    .reduce((sum, d) => sum + ctx.toBase(d.plannedMonthlyPayment, d.currency), 0);
  const plannedGoals = s.goals
    .filter((g) => !g.archived)
    .reduce((sum, g) => sum + ctx.toBase(g.monthlyContribution, g.currency), 0);

  const surplus =
    monthlyIncome === null ? null : monthlyIncome - recurringObligations - (variableSpending ?? 0);
  const essentialMonthly =
    essentialRecurring > 0 || essentialVariable !== null ? essentialRecurring + (essentialVariable ?? 0) : null;

  const emergencyFund = s.goals
    .filter((g) => g.kind === "emergency" && !g.archived)
    .reduce(
      (sum, g) =>
        sum +
        ctx.toBase(
          s.contributions.filter((c) => c.goalId === g.id).reduce((x, c) => x + c.amount, 0),
          g.currency,
        ),
      0,
    );
  const emergencyMonths =
    essentialMonthly && essentialMonthly > 0 ? Math.round((emergencyFund / essentialMonthly) * 10) / 10 : null;
  if (!s.goals.some((g) => g.kind === "emergency")) missing.push("an emergency fund goal");

  return {
    monthlyIncome,
    recurringObligations,
    essentialRecurring,
    variableSpending,
    essentialVariable,
    monthsOfHistory: months.length,
    plannedDebt,
    plannedGoals,
    surplus,
    essentialMonthly,
    emergencyFund,
    emergencyMonths,
    assumptions,
    missing,
  };
}
