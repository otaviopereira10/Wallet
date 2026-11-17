import { categoryLabel, NON_ESSENTIAL_CATEGORIES } from "../constants";
import { formatDate, formatMoney, relativeDays } from "../format";
import { billBuckets, buildOccurrenceViews, type BillBuckets, type OccurrenceView } from "./bills";
import { budgetSummary, type BudgetSummary } from "./budget";
import { estimateCapacity, type CapacityEstimate } from "./capacity";
import {
  collectFlowEvents,
  nextIncomeEvent,
  safeToSpendUntil,
  unconfirmedIncomes,
  type FlowEvent,
  type SafeToSpend,
} from "./cashflow";
import { addDays, addMonths, daysInMonth, diffDays, endOfMonth, fromParts, parts, startOfMonth } from "./dates";
import {
  breakEven,
  debtBalance,
  debtHistory,
  nextIncrementAfter,
  requiredPaymentForTarget,
  simulateDebt,
  type DebtHistoryRow,
  type DebtSimParams,
  type DebtSimResult,
} from "./debt";
import { MoneyContext } from "./fx";
import { goalProgress, type GoalProgress } from "./goals";
import { accountBalances, periodFlows, spendingByCategory, type PeriodFlows } from "./ledger";
import { subscriptionTotals, subscriptionView, type SubscriptionTotals, type SubscriptionView } from "./subscriptions";
import type { Account, Cents, Debt, DebtEvent, ISODate, Income, Snapshot } from "./types";

export interface DebtSummary {
  debt: Debt;
  balance: Cents;
  history: DebtHistoryRow[];
  nextIncrement: ISODate | null;
  daysToIncrement: number | null;
  paidTotal: Cents;
  incrementsTotal: Cents;
  interestTotal: Cents;
  breakEven: Cents;
  baseParams: Omit<DebtSimParams, "monthlyPayment">;
  planned: DebtSimResult | null;
  insufficient: boolean;
  targetRequired: Cents | null;
}

export function debtSimBase(debt: Debt, balance: Cents, today: ISODate): Omit<DebtSimParams, "monthlyPayment"> {
  return {
    startBalance: balance,
    today,
    paymentDay: debt.paymentDay,
    incrementAmount: debt.incrementAmount,
    incrementIntervalMonths: debt.incrementIntervalMonths,
    incrementAnchorDate: debt.incrementAnchorDate,
    incrementsEndDate: debt.incrementsEndDate,
    annualRate: debt.interestRate,
  };
}

export function summarizeDebt(debt: Debt, allEvents: DebtEvent[], today: ISODate): DebtSummary {
  const events = allEvents.filter((e) => e.debtId === debt.id);
  const balance = debtBalance(debt, events);
  const live = events.filter((e) => !e.voided);
  const nextIncrement = nextIncrementAfter(debt, today);
  const base = debtSimBase(debt, balance, today);
  const be = breakEven({ ...base }, balance);
  const planned = debt.plannedMonthlyPayment > 0 || balance > 0 ? simulateDebt({ ...base, monthlyPayment: debt.plannedMonthlyPayment }) : null;
  return {
    debt,
    balance,
    history: debtHistory(debt, events),
    nextIncrement,
    daysToIncrement: nextIncrement ? diffDays(today, nextIncrement) : null,
    paidTotal: live.filter((e) => e.type === "payment").reduce((s, e) => s + e.amount, 0),
    incrementsTotal: live.filter((e) => e.type === "increment").reduce((s, e) => s + e.amount, 0),
    interestTotal: live.filter((e) => e.type === "interest").reduce((s, e) => s + e.amount, 0),
    breakEven: be,
    baseParams: base,
    planned,
    insufficient: balance > 0 && debt.plannedMonthlyPayment < be,
    targetRequired: debt.targetPayoffDate ? requiredPaymentForTarget(base, debt.targetPayoffDate) : null,
  };
}

export type Tone = "info" | "positive" | "warning" | "danger";

export interface Insight {
  id: string;
  tone: Tone;
  title: string;
  detail?: string;
  href?: string;
}

export interface AppNotification {
  id: string;
  tone: Tone;
  title: string;
  detail: string;
  href: string;
}

export interface AccountRow {
  account: Account;
  balance: Cents;
  baseBalance: Cents;
}

export interface Analysis {
  today: ISODate;
  ctx: MoneyContext;
  fmt: (c: Cents) => string;
  accountRows: AccountRow[];
  totalBalance: Cents;
  spendableBalance: Cents;
  month: PeriodFlows;
  prevMonth: PeriodFlows;
  views: OccurrenceView[];
  buckets: BillBuckets;
  events: FlowEvent[];
  safeMonth: SafeToSpend;
  safeUntilIncome: SafeToSpend;
  nextIncome: FlowEvent | null;
  unconfirmed: Array<{ income: Income; date: ISODate }>;
  capacity: CapacityEstimate;
  debts: DebtSummary[];
  debtTotal: Cents;
  goals: GoalProgress[];
  savingsTotal: Cents;
  subscriptions: SubscriptionView[];
  subTotals: SubscriptionTotals;
  budget: BudgetSummary;
  insights: Insight[];
  notifications: AppNotification[];
}

export function analyze(s: Snapshot): Analysis {
  const base = s.profile.baseCurrency;
  const ctx = new MoneyContext(base, s.fxRates);
  const fmt = (c: Cents) => formatMoney(c, base, s.profile.locale);
  const today = s.today;

  const balances = accountBalances(s.accounts, s.transactions);
  const accountRows: AccountRow[] = s.accounts.map((a) => {
    const balance = balances.get(a.id) ?? 0;
    return { account: a, balance, baseBalance: ctx.toBase(balance, a.currency) };
  });
  const totalBalance = accountRows.reduce((sum, r) => sum + r.baseBalance, 0);
  const spendableBalance = accountRows.filter((r) => r.account.includeInAvailable).reduce((sum, r) => sum + r.baseBalance, 0);

  const monthStart = startOfMonth(today);
  const monthEnd = endOfMonth(today);
  const month = periodFlows(s.transactions, s.accounts, ctx, monthStart, monthEnd);
  const prevStart = startOfMonth(addMonths(monthStart, -1));
  const prevMonth = periodFlows(s.transactions, s.accounts, ctx, prevStart, endOfMonth(prevStart));

  const views = buildOccurrenceViews(s.bills, s.occurrences, s.billPayments, today);
  const buckets = billBuckets(views, today, (c, v) => ctx.toBase(c, v.bill.currency));

  const horizon = addDays(today, 62) > endOfMonth(addMonths(today, 1)) ? addDays(today, 62) : endOfMonth(addMonths(today, 1));
  const events = collectFlowEvents(s, ctx, { to: horizon, includeGoals: true, views });
  const buffer = s.profile.emergencyBuffer;
  const safeMonth = safeToSpendUntil(spendableBalance, events, monthEnd, buffer);
  const nextIncome = nextIncomeEvent(events, today);
  const untilIncome = nextIncome ? addDays(nextIncome.date, -1) : monthEnd;
  const safeUntilIncome = safeToSpendUntil(spendableBalance, events, untilIncome < today ? today : untilIncome, buffer);
  const unconfirmed = unconfirmedIncomes(s.incomes, s.transactions, today);

  const capacity = estimateCapacity(s, ctx);
  const debts = s.debts.filter((d) => d.active).map((d) => summarizeDebt(d, s.debtEvents, today));
  const debtTotal = debts.reduce((sum, d) => sum + ctx.toBase(d.balance, d.debt.currency), 0);

  const goals = s.goals.filter((g) => !g.archived).map((g) => goalProgress(g, s.contributions, today));
  const savingsTotal = goals.reduce((sum, g) => sum + ctx.toBase(g.saved, g.goal.currency), 0);

  const subscriptions = s.subscriptions.map((sub) => subscriptionView(sub, today, s.profile.alertDaysAhead));
  const subTotals = subscriptionTotals(subscriptions, ctx);

  const budget = budgetSummary(s, ctx, today, fmt);

  const a: Analysis = {
    today,
    ctx,
    fmt,
    accountRows,
    totalBalance,
    spendableBalance,
    month,
    prevMonth,
    views,
    buckets,
    events,
    safeMonth,
    safeUntilIncome,
    nextIncome,
    unconfirmed,
    capacity,
    debts,
    debtTotal,
    goals,
    savingsTotal,
    subscriptions,
    subTotals,
    budget,
    insights: [],
    notifications: [],
  };
  a.insights = buildInsights(s, a);
  a.notifications = buildNotifications(s, a);
  return a;
}

/** Month-to-date spending vs the same days of the previous month. */
export function categoryComparison(s: Snapshot, ctx: MoneyContext) {
  const today = s.today;
  const { y, m, d } = parts(today);
  const prev = addMonths(fromParts(y, m, 1), -1);
  const pp = parts(prev);
  const prevEnd = fromParts(pp.y, pp.m, Math.min(d, daysInMonth(pp.y, pp.m)));
  const now = spendingByCategory(s.transactions, s.accounts, ctx, startOfMonth(today), today, { includePending: false });
  const before = spendingByCategory(s.transactions, s.accounts, ctx, prev, prevEnd, { includePending: false });
  const cats = new Set([...Object.keys(now), ...Object.keys(before)]);
  return [...cats]
    .map((category) => {
      const cur = now[category] ?? 0;
      const old = before[category] ?? 0;
      return { category, current: cur, previous: old, delta: cur - old, pct: old > 0 ? ((cur - old) / old) * 100 : null };
    })
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

function buildInsights(s: Snapshot, a: Analysis): Insight[] {
  const out: Insight[] = [];
  const { fmt, today } = a;
  const locale = s.profile.locale;

  if (a.ctx.hasMissing) {
    out.push({
      id: "fx-missing",
      tone: "warning",
      title: `Sem cotação para converter ${a.ctx.missingCurrencies.join(", ")}`,
      detail: "Alguns valores não entraram nos totais. Atualize a cotação ou informe uma taxa manual em Configurações → Câmbio.",
      href: "/settings#cambio",
    });
  }

  if (a.buckets.overdue.length) {
    out.push({
      id: "overdue",
      tone: "danger",
      title: `${a.buckets.overdue.length} conta(s) atrasada(s) somando ${fmt(a.buckets.overdueTotal)}`,
      detail: "Veja no Smart Payment Planner a ordem recomendada de pagamento.",
      href: "/bills?tab=planner",
    });
  }

  const nextOpen = a.views.find((v) => (v.status === "pending" || v.status === "partial") && v.occurrence.dueDate >= today);
  if (nextOpen) {
    out.push({
      id: "next-bill",
      tone: nextOpen.daysUntilDue <= s.profile.alertDaysAhead ? "warning" : "info",
      title: `Sua próxima conta vence ${relativeDays(nextOpen.daysUntilDue)}`,
      detail: `${nextOpen.bill.name} — ${formatMoney(nextOpen.remaining, nextOpen.bill.currency, locale)} em ${formatDate(nextOpen.occurrence.dueDate, locale)}.`,
      href: "/bills",
    });
  }

  const comparison = categoryComparison(s, a.ctx).filter((c) => c.previous >= 2000 && c.pct !== null && Math.abs(c.pct) >= 15);
  const up = comparison.find((c) => c.delta > 0);
  if (up) {
    out.push({
      id: `cat-up-${up.category}`,
      tone: "warning",
      title: `Você gastou ${Math.round(up.pct!)}% a mais com ${categoryLabel(up.category)} este mês`,
      detail: `${fmt(up.current)} até hoje, contra ${fmt(up.previous)} no mesmo período do mês passado.`,
      href: "/expenses",
    });
  }
  const down = comparison.find((c) => c.delta < 0);
  if (down) {
    out.push({
      id: `cat-down-${down.category}`,
      tone: "positive",
      title: `Você gastou ${Math.round(Math.abs(down.pct!))}% a menos com ${categoryLabel(down.category)}`,
      detail: `${fmt(down.current)} até hoje, contra ${fmt(down.previous)} no mesmo período do mês passado.`,
      href: "/expenses",
    });
  }

  // Savings potential from data the user flagged or overspending in optional categories.
  const cancelSavings = a.subTotals.cancelPlannedMonthly;
  const overspendOptional = a.budget.lines
    .filter((l) => NON_ESSENTIAL_CATEGORIES.includes(l.category as never) && l.projected > l.limit)
    .reduce((sum, l) => sum + (l.projected - l.limit), 0);
  if (cancelSavings + overspendOptional > 0) {
    const parts2: string[] = [];
    if (cancelSavings) parts2.push(`${fmt(cancelSavings)}/mês cancelando as assinaturas marcadas`);
    if (overspendOptional) parts2.push(`${fmt(overspendOptional)} mantendo as categorias não essenciais dentro do orçamento`);
    out.push({
      id: "savings-potential",
      tone: "positive",
      title: `Você pode economizar ${fmt(cancelSavings + overspendOptional)} reduzindo despesas não essenciais`,
      detail: `${parts2.join(" e ")}.`,
      href: cancelSavings ? "/subscriptions" : "/budget",
    });
  }

  for (const d of a.debts) {
    if (d.balance <= 0) continue;
    if (d.debt.plannedMonthlyPayment <= 0) {
      out.push({
        id: `debt-noplan-${d.debt.id}`,
        tone: "info",
        title: `${d.debt.name}: defina um pagamento mensal planejado`,
        detail: "Com um valor mensal, a Isabelle projeta a data de quitação considerando os acréscimos semestrais.",
        href: "/debt",
      });
    } else if (d.insufficient) {
      out.push({
        id: `debt-insufficient-${d.debt.id}`,
        tone: "danger",
        title: `O pagamento de ${formatMoney(d.debt.plannedMonthlyPayment, d.debt.currency, locale)}/mês não compensa os acréscimos`,
        detail: `Para a dívida parar de crescer são necessários ao menos ${formatMoney(d.breakEven, d.debt.currency, locale)}/mês.`,
        href: "/debt",
      });
    } else if (d.planned?.paidOff && d.planned.payoffDate) {
      out.push({
        id: `debt-payoff-${d.debt.id}`,
        tone: "positive",
        title: `Mantendo o plano atual, você quita ${d.debt.name} em ${formatDate(d.planned.payoffDate, locale)}`,
        detail: `Pagando ${formatMoney(d.debt.plannedMonthlyPayment, d.debt.currency, locale)}/mês, incluindo ${d.planned.incrementsCount} novo(s) acréscimo(s) semestral(is). Projeção, não garantia.`,
        href: "/debt",
      });
    } else if (d.planned && !d.planned.paidOff && d.planned.incrementsOngoing) {
      out.push({
        id: `debt-ongoing-${d.debt.id}`,
        tone: "info",
        title: `${d.debt.name}: informe quando os acréscimos semestrais terminam`,
        detail: "Sem data de término dos acréscimos, não é possível projetar uma quitação definitiva.",
        href: "/debt",
      });
    }
  }

  for (const l of a.budget.lines.filter((x) => x.state === "over")) {
    out.push({
      id: `budget-over-${l.category}`,
      tone: "danger",
      title: `Orçamento de ${categoryLabel(l.category)} ultrapassado`,
      detail: `${fmt(l.spent)} de ${fmt(l.limit)} (${l.percent}%).`,
      href: "/budget",
    });
  }

  if (a.accountRows.length) {
    out.push({
      id: "safe-month",
      tone: a.safeMonth.amount > 0 ? "info" : "warning",
      title:
        a.safeMonth.amount > 0
          ? `Você ainda pode gastar ${fmt(a.safeMonth.amount)} este mês sem comprometer as contas`
          : "Seu saldo disponível já está comprometido com as obrigações do mês",
      detail: `Saldo disponível ${fmt(a.safeMonth.spendable)} − obrigações até ${formatDate(a.safeMonth.until, locale)} ${fmt(a.safeMonth.obligations)} − reserva mínima ${fmt(a.safeMonth.buffer)}. Receitas futuras não entram nesse cálculo.`,
      href: "/cash-flow",
    });
  }

  if (a.unconfirmed.length) {
    out.push({
      id: "unconfirmed-income",
      tone: "info",
      title: `${a.unconfirmed.length} recebimento(s) aguardando confirmação`,
      detail: "Confirme as receitas que já caíram na conta para que entrem no saldo real.",
      href: "/income",
    });
  }
  return out;
}

function buildNotifications(s: Snapshot, a: Analysis): AppNotification[] {
  const out: AppNotification[] = [];
  const locale = s.profile.locale;
  const days = s.profile.alertDaysAhead;
  for (const v of a.buckets.overdue) {
    out.push({
      id: `n-overdue-${v.occurrence.id}`,
      tone: "danger",
      title: `${v.bill.name} está atrasada`,
      detail: `Venceu em ${formatDate(v.occurrence.dueDate, locale)} — faltam ${formatMoney(v.remaining, v.bill.currency, locale)}.`,
      href: "/bills",
    });
  }
  for (const v of [...a.buckets.dueToday, ...a.buckets.next7]) {
    if (v.daysUntilDue > days) continue;
    out.push({
      id: `n-due-${v.occurrence.id}`,
      tone: "warning",
      title: `${v.bill.name} vence ${relativeDays(v.daysUntilDue)}`,
      detail: `${formatMoney(v.remaining, v.bill.currency, locale)} em ${formatDate(v.occurrence.dueDate, locale)}.`,
      href: "/bills",
    });
  }
  for (const sv of a.subscriptions) {
    if (sv.chargeSoon || sv.chargeOverdue) {
      out.push({
        id: `n-sub-${sv.sub.id}-${sv.sub.nextChargeDate}`,
        tone: sv.sub.status === "cancel_planned" ? "warning" : "info",
        title: sv.chargeOverdue
          ? `Cobrança de ${sv.sub.name} aguardando registro`
          : `${sv.sub.name} será cobrada ${relativeDays(sv.daysUntilCharge)}`,
        detail: `${formatMoney(sv.sub.amount, sv.sub.currency, locale)}${sv.sub.status === "cancel_planned" ? " — você marcou para cancelar" : ""}.`,
        href: "/subscriptions",
      });
    }
  }
  for (const d of a.debts) {
    if (d.nextIncrement && d.daysToIncrement !== null && d.daysToIncrement <= Math.max(days, 14)) {
      out.push({
        id: `n-debt-inc-${d.debt.id}-${d.nextIncrement}`,
        tone: "info",
        title: `Acréscimo semestral ${relativeDays(d.daysToIncrement)}`,
        detail: `${d.debt.name}: +${formatMoney(d.debt.incrementAmount, d.debt.currency, locale)} em ${formatDate(d.nextIncrement, locale)}.`,
        href: "/debt",
      });
    }
  }
  for (const u of a.unconfirmed.slice(0, 5)) {
    out.push({
      id: `n-inc-${u.income.id}-${u.date}`,
      tone: "info",
      title: `Confirme o recebimento: ${u.income.name}`,
      detail: `Previsto para ${formatDate(u.date, locale)} — ${formatMoney(u.income.amount, u.income.currency, locale)}.`,
      href: "/income",
    });
  }
  return out;
}
