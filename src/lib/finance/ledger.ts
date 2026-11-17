import { debtBalance } from "./debt";
import { endOfMonth, monthStartFromKey } from "./dates";
import type { MoneyContext } from "./fx";
import type { Account, Cents, Debt, DebtEvent, ISODate, Transaction } from "./types";

/**
 * Ledger rules (see docs/FINANCIAL_RULES.md):
 * - Only `paid` movements change real balances. A pending expense is a
 *   commitment, never money that already left.
 * - Transfers move money between the user's own accounts: they change the two
 *   account balances but are never income or expense.
 * - A debt payment is money out of an account (cash outflow) and, separately,
 *   reduces the debt balance (debt ledger).
 * - Movements dated before an account's opening date are history already
 *   reflected in the opening balance, so they do not change that balance again.
 */
export function txAccountEffects(tx: Transaction): Array<{ accountId: string; delta: Cents }> {
  if (tx.status !== "paid" || !tx.accountId || tx.accountAmount === null) return [];
  switch (tx.kind) {
    case "income":
    case "refund":
      return [{ accountId: tx.accountId, delta: tx.accountAmount }];
    case "expense":
    case "debt_payment":
      return [{ accountId: tx.accountId, delta: -tx.accountAmount }];
    case "transfer":
      return [
        { accountId: tx.accountId, delta: -tx.accountAmount },
        ...(tx.toAccountId && tx.toAmount !== null ? [{ accountId: tx.toAccountId, delta: tx.toAmount }] : []),
      ];
  }
}

/** Real balance of each account (in the account's own currency) at the end of `asOf`. */
export function accountBalances(accounts: Account[], transactions: Transaction[], asOf?: ISODate): Map<string, Cents> {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const balances = new Map<string, Cents>();
  for (const a of accounts) balances.set(a.id, asOf && a.openingDate > asOf ? 0 : a.openingBalance);
  for (const tx of transactions) {
    if (asOf && tx.date > asOf) continue;
    for (const eff of txAccountEffects(tx)) {
      const acc = byId.get(eff.accountId);
      if (!acc || tx.date < acc.openingDate) continue;
      balances.set(eff.accountId, (balances.get(eff.accountId) ?? 0) + eff.delta);
    }
  }
  return balances;
}

/** Sum of account balances in the base currency (latest exchange rate). */
export function totalBalance(
  accounts: Account[],
  transactions: Transaction[],
  ctx: MoneyContext,
  opts: { spendableOnly?: boolean; asOf?: ISODate } = {},
): Cents {
  const balances = accountBalances(accounts, transactions, opts.asOf);
  let total = 0;
  for (const a of accounts) {
    if (opts.spendableOnly && !a.includeInAvailable) continue;
    total += ctx.toBase(balances.get(a.id) ?? 0, a.currency);
  }
  return total;
}

/**
 * Value of a movement in the base currency. Uses the exact amount that hit the
 * account when the account is already in the base currency; otherwise converts
 * the original amount using the rate effective on the movement date.
 */
export function txBaseAmount(tx: Transaction, accountsById: Map<string, Account>, ctx: MoneyContext): Cents {
  const acc = tx.accountId ? accountsById.get(tx.accountId) : undefined;
  if (acc && tx.accountAmount !== null && acc.currency === ctx.base) return tx.accountAmount;
  if (tx.currency === ctx.base) return tx.amount;
  return ctx.toBase(tx.amount, tx.currency, tx.date);
}

export interface PeriodFlows {
  income: Cents;
  expensesPaid: Cents;
  expensesPending: Cents;
  refunds: Cents;
  debtPayments: Cents;
  /** Paid expenses minus refunds. */
  netExpenses: Cents;
  /** Net expenses + debt payments (all money that left). */
  outflows: Cents;
  /** income + refunds − paid expenses − debt payments. */
  net: Cents;
  transferVolume: Cents;
}

export function periodFlows(
  transactions: Transaction[],
  accounts: Account[],
  ctx: MoneyContext,
  from: ISODate,
  to: ISODate,
): PeriodFlows {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const f: PeriodFlows = {
    income: 0,
    expensesPaid: 0,
    expensesPending: 0,
    refunds: 0,
    debtPayments: 0,
    netExpenses: 0,
    outflows: 0,
    net: 0,
    transferVolume: 0,
  };
  for (const tx of transactions) {
    if (tx.date < from || tx.date > to) continue;
    const v = txBaseAmount(tx, byId, ctx);
    if (tx.kind === "income") f.income += v;
    else if (tx.kind === "refund") f.refunds += v;
    else if (tx.kind === "debt_payment") f.debtPayments += v;
    else if (tx.kind === "transfer") f.transferVolume += v;
    else if (tx.kind === "expense") {
      if (tx.status === "paid") f.expensesPaid += v;
      else f.expensesPending += v;
    }
  }
  f.netExpenses = f.expensesPaid - f.refunds;
  f.outflows = f.netExpenses + f.debtPayments;
  f.net = f.income - f.outflows;
  return f;
}

/**
 * Spending per category in base currency (expenses minus refunds).
 * `includePending` counts pending expenses as committed spending (budgets).
 */
export function spendingByCategory(
  transactions: Transaction[],
  accounts: Account[],
  ctx: MoneyContext,
  from: ISODate,
  to: ISODate,
  opts: { includePending?: boolean } = {},
): Record<string, Cents> {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const out: Record<string, Cents> = {};
  for (const tx of transactions) {
    if (tx.date < from || tx.date > to) continue;
    const cat = tx.category ?? "other";
    if (tx.kind === "expense") {
      if (tx.status === "pending" && !opts.includePending) continue;
      out[cat] = (out[cat] ?? 0) + txBaseAmount(tx, byId, ctx);
    } else if (tx.kind === "refund") {
      out[cat] = (out[cat] ?? 0) - txBaseAmount(tx, byId, ctx);
    }
  }
  return out;
}

export interface MonthFlowPoint {
  month: string;
  income: Cents;
  expenses: Cents;
  debtPayments: Cents;
  net: Cents;
}

export function monthlySeries(
  transactions: Transaction[],
  accounts: Account[],
  ctx: MoneyContext,
  monthKeys: string[],
): MonthFlowPoint[] {
  return monthKeys.map((key) => {
    const from = monthStartFromKey(key);
    const f = periodFlows(transactions, accounts, ctx, from, endOfMonth(from));
    return { month: key, income: f.income, expenses: f.netExpenses, debtPayments: f.debtPayments, net: f.net };
  });
}

export interface NetWorthPoint {
  month: string;
  assets: Cents;
  debts: Cents;
  netWorth: Cents;
}

/**
 * Month-end balances of all accounts and debts (base currency, latest rate).
 * Months after `today` are skipped (they would be projections, not history).
 */
export function netWorthSeries(
  accounts: Account[],
  transactions: Transaction[],
  debts: Debt[],
  debtEvents: DebtEvent[],
  ctx: MoneyContext,
  monthKeys: string[],
  today: ISODate,
): NetWorthPoint[] {
  const out: NetWorthPoint[] = [];
  for (const key of monthKeys) {
    const start = monthStartFromKey(key);
    if (start > today) break;
    const end = endOfMonth(start) > today ? today : endOfMonth(start);
    const assets = totalBalance(accounts, transactions, ctx, { asOf: end });
    let debtTotal = 0;
    for (const d of debts) {
      if (d.startDate > end) continue;
      const evs = debtEvents.filter((e) => e.debtId === d.id);
      debtTotal += ctx.toBase(debtBalance(d, evs, end), d.currency);
    }
    out.push({ month: key, assets, debts: debtTotal, netWorth: assets - debtTotal });
  }
  return out;
}
