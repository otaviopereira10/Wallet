import { addMonths, diffDays, diffMonths, endOfMonth, fromParts, monthKey, parts, startOfMonth } from "./dates";
import { Dec as D, floorTo, monthlyInterest, mulCents } from "./money";
import { occurrencesBetween } from "./recurrence";
import type { Cents, Debt, DebtEvent, DebtEventType, ISODate } from "./types";

/**
 * University Debt Manager rules:
 *   balance = initial balance
 *           + semester increments (configurable amount/interval, posted on schedule)
 *           + interest (only if a rate is configured)
 *           ± adjustments
 *           − payments
 * The semester increment is NOT interest — it is a new amount added to the
 * debt, tracked separately in the history.
 */
const TYPE_ORDER: Record<DebtEventType, number> = { increment: 0, adjustment: 1, payment: 2, interest: 3 };

export function eventDelta(e: Pick<DebtEvent, "type" | "amount">): Cents {
  return e.type === "payment" ? -e.amount : e.amount;
}

export function sortEvents<T extends Pick<DebtEvent, "date" | "type">>(events: T[]): T[] {
  return [...events].sort((a, b) => (a.date === b.date ? TYPE_ORDER[a.type] - TYPE_ORDER[b.type] : a.date < b.date ? -1 : 1));
}

export function debtBalance(debt: Debt, events: DebtEvent[], asOf?: ISODate): Cents {
  let balance = debt.initialBalance;
  for (const e of events) {
    if (e.voided || e.debtId !== debt.id) continue;
    if (asOf && e.date > asOf) continue;
    balance += eventDelta(e);
  }
  return balance;
}

interface IncrementConfig {
  incrementAmount: Cents;
  incrementIntervalMonths: number;
  incrementAnchorDate: ISODate | null;
  incrementsEndDate: ISODate | null;
}

/** Scheduled increment dates in [from, to]. */
export function incrementDates(cfg: IncrementConfig, from: ISODate, to: ISODate): ISODate[] {
  if (!cfg.incrementAnchorDate || cfg.incrementAmount <= 0) return [];
  return occurrencesBetween(
    {
      start: cfg.incrementAnchorDate,
      frequency: "custom",
      interval: cfg.incrementIntervalMonths,
      unit: "month",
      end: cfg.incrementsEndDate,
    },
    from,
    to,
  );
}

/** Next scheduled increment strictly after `date`, or null if none. */
export function nextIncrementAfter(cfg: IncrementConfig, date: ISODate): ISODate | null {
  const list = incrementDates(cfg, addDaysSafe(date, 1), addMonths(date, cfg.incrementIntervalMonths + 1));
  return list[0] ?? null;
}

function addDaysSafe(date: ISODate, n: number): ISODate {
  const t = Date.UTC(parts(date).y, parts(date).m - 1, parts(date).d) + n * 86_400_000;
  const dt = new Date(t);
  return fromParts(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export interface AutoEvent {
  date: ISODate;
  type: "increment" | "interest";
  amount: Cents;
}

/**
 * Automatic events that should already exist on `today` but were not posted:
 * each scheduled semester increment after the debt start date and, when a rate
 * is configured, monthly interest posted on the last day of each month
 * (prorated by days in the first partial month). Idempotent: dates already
 * posted (even if later voided by the user) are never generated again.
 */
export function pendingAutoEvents(debt: Debt, events: DebtEvent[], today: ISODate): AutoEvent[] {
  const posted = new Set(events.filter((e) => e.automatic).map((e) => `${e.type}|${e.date}`));
  const out: AutoEvent[] = [];
  for (const date of incrementDates(debt, addDaysSafe(debt.startDate, 1), today)) {
    if (!posted.has(`increment|${date}`)) out.push({ date, type: "increment", amount: debt.incrementAmount });
  }
  const rate = new D(debt.interestRate || 0);
  if (rate.gt(0)) {
    const since = debt.interestSince && debt.interestSince > debt.startDate ? debt.interestSince : debt.startDate;
    let monthEnd = endOfMonth(since);
    if (monthEnd === since) monthEnd = endOfMonth(addMonths(startOfMonth(since), 1));
    let first = true;
    while (monthEnd <= today) {
      if (!posted.has(`interest|${monthEnd}`)) {
        const working = [...events, ...out.map((e, i) => ({ ...e, id: `new-${i}`, debtId: debt.id, automatic: true, voided: false, transactionId: null, note: null }))];
        const balance = debtBalance(debt, working as DebtEvent[], monthEnd);
        let amount: Cents;
        if (first) {
          const days = diffDays(since, monthEnd);
          amount = balance > 0 ? mulCents(balance, rate.div(100).mul(days).div(365)) : 0;
        } else {
          amount = monthlyInterest(balance, rate);
        }
        if (amount > 0) out.push({ date: monthEnd, type: "interest", amount });
      }
      first = false;
      monthEnd = endOfMonth(addMonths(startOfMonth(monthEnd), 1));
    }
  }
  return sortEvents(out);
}

export interface DebtHistoryRow {
  id: string | null;
  date: ISODate;
  type: "initial" | DebtEventType;
  delta: Cents;
  balanceBefore: Cents;
  balanceAfter: Cents;
  automatic: boolean;
  voided: boolean;
  note: string | null;
  transactionId: string | null;
}

export function debtHistory(debt: Debt, events: DebtEvent[]): DebtHistoryRow[] {
  const rows: DebtHistoryRow[] = [
    {
      id: null,
      date: debt.startDate,
      type: "initial",
      delta: debt.initialBalance,
      balanceBefore: 0,
      balanceAfter: debt.initialBalance,
      automatic: false,
      voided: false,
      note: "Saldo inicial",
      transactionId: null,
    },
  ];
  let balance = debt.initialBalance;
  for (const e of sortEvents(events.filter((x) => x.debtId === debt.id))) {
    const delta = e.voided ? 0 : eventDelta(e);
    rows.push({
      id: e.id,
      date: e.date,
      type: e.type,
      delta: eventDelta(e),
      balanceBefore: balance,
      balanceAfter: balance + delta,
      automatic: e.automatic,
      voided: e.voided,
      note: e.note,
      transactionId: e.transactionId,
    });
    balance += delta;
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Payoff simulator
// ---------------------------------------------------------------------------
export interface DebtSimParams extends IncrementConfig {
  startBalance: Cents;
  today: ISODate;
  monthlyPayment: Cents;
  paymentDay: number;
  /** Annual percent. */
  annualRate: string;
  maxMonths?: number;
}

export interface DebtSimPoint {
  month: string;
  date: ISODate;
  balance: Cents;
  paid: Cents;
  interest: Cents;
  increment: Cents;
}

export interface DebtSimResult {
  monthlyPayment: Cents;
  paidOff: boolean;
  payoffDate: ISODate | null;
  monthsToPayoff: number | null;
  firstZeroDate: ISODate | null;
  totalPaid: Cents;
  totalInterest: Cents;
  interestPaid: Cents;
  principalPaid: Cents;
  incrementsCount: number;
  incrementsTotal: Cents;
  incrementsOngoing: boolean;
  breakEvenMonthly: Cents;
  coversIncrements: boolean;
  endBalance: Cents;
  series: DebtSimPoint[];
}

type SimEvent = { date: ISODate; type: "increment" | "payment" | "interest" };

/**
 * Month-by-month simulation that respects the real date of each semester
 * increment (never a simple balance ÷ payment division). Payments happen on
 * `paymentDay` starting with the first such date after today. Interest (if any)
 * is added at each month end (prorated by days for the current month).
 */
export function simulateDebt(p: DebtSimParams): DebtSimResult {
  const maxMonths = p.maxMonths ?? 600;
  const rate = new D(p.annualRate || 0);
  let balance = Math.max(0, p.startBalance);
  let totalPaid = 0;
  let totalInterest = 0;
  let incrementsCount = 0;
  let incrementsTotal = 0;
  let firstZeroDate: ISODate | null = balance === 0 ? p.today : null;
  let lastZeroing: ISODate | null = null;
  let payoffDate: ISODate | null = null;
  const series: DebtSimPoint[] = [];
  const horizonEnd = endOfMonth(addMonths(p.today, maxMonths));
  const incrementsOngoing = p.incrementAmount > 0 && !!p.incrementAnchorDate && !p.incrementsEndDate;

  // Already paid off with no increments ahead.
  if (balance === 0 && !nextIncrementAfter(p, p.today)) {
    payoffDate = p.today;
  }

  for (let i = 0; i <= maxMonths && payoffDate === null; i++) {
    const anyDay = addMonths(startOfMonth(p.today), i);
    const mStart = i === 0 ? p.today : anyDay;
    const mEnd = endOfMonth(anyDay);
    const { y, m } = parts(anyDay);
    const events: SimEvent[] = [];
    for (const d of incrementDates(p, i === 0 ? addDaysSafe(p.today, 1) : mStart, mEnd)) events.push({ date: d, type: "increment" });
    const payDate = fromParts(y, m, Math.min(p.paymentDay, 28));
    if (p.monthlyPayment > 0 && payDate > p.today) events.push({ date: payDate, type: "payment" });
    if (rate.gt(0)) events.push({ date: mEnd, type: "interest" });
    events.sort((a, b) =>
      a.date === b.date ? order(a.type) - order(b.type) : a.date < b.date ? -1 : 1,
    );
    let paidM = 0;
    let intM = 0;
    let incM = 0;
    for (const ev of events) {
      if (ev.type === "increment") {
        balance += p.incrementAmount;
        incrementsCount++;
        incrementsTotal += p.incrementAmount;
        incM += p.incrementAmount;
      } else if (ev.type === "payment") {
        if (balance > 0) {
          const pay = Math.min(p.monthlyPayment, balance);
          balance -= pay;
          totalPaid += pay;
          paidM += pay;
          if (balance === 0) {
            lastZeroing = ev.date;
            if (!firstZeroDate) firstZeroDate = ev.date;
          }
        }
      } else if (balance > 0) {
        const interest =
          i === 0
            ? mulCents(balance, rate.div(100).mul(Math.max(0, diffDays(p.today, mEnd))).div(365))
            : monthlyInterest(balance, rate);
        balance += interest;
        totalInterest += interest;
        intM += interest;
      }
    }
    series.push({ month: monthKey(mEnd), date: mEnd, balance, paid: paidM, interest: intM, increment: incM });
    if (balance === 0 && lastZeroing && !nextIncrementAfter(p, mEnd)) {
      payoffDate = lastZeroing;
    }
    if (mEnd >= horizonEnd) break;
  }

  const interestPaid = Math.min(totalPaid, totalInterest);
  const breakEvenMonthly = breakEven(p, balance === 0 ? p.startBalance : p.startBalance);
  return {
    monthlyPayment: p.monthlyPayment,
    paidOff: payoffDate !== null,
    payoffDate,
    monthsToPayoff: payoffDate ? Math.max(0, diffMonths(p.today, payoffDate)) : null,
    firstZeroDate,
    totalPaid,
    totalInterest,
    interestPaid,
    principalPaid: totalPaid - interestPaid,
    incrementsCount,
    incrementsTotal,
    incrementsOngoing,
    breakEvenMonthly,
    coversIncrements: p.monthlyPayment >= breakEvenMonthly,
    endBalance: balance,
    series,
  };
}

function order(t: SimEvent["type"]): number {
  return t === "increment" ? 0 : t === "payment" ? 1 : 2;
}

/**
 * Monthly payment needed just to stop the debt from growing right now:
 * average increment per month (while increments continue) + one month of
 * interest on the current balance.
 */
export function breakEven(cfg: IncrementConfig & { annualRate: string; today: ISODate }, balance: Cents): Cents {
  const hasFutureIncrements = !!nextIncrementAfter(cfg, cfg.today);
  const perMonth = hasFutureIncrements ? Math.ceil(cfg.incrementAmount / cfg.incrementIntervalMonths) : 0;
  return perMonth + monthlyInterest(balance, cfg.annualRate || 0);
}

/** Balance after `months` months according to a simulation (0 after payoff). */
export function balanceAfterMonths(result: DebtSimResult, months: number): Cents {
  if (months <= 0) return result.series[0]?.balance ?? 0;
  const point = result.series[months];
  if (point) return point.balance;
  return result.paidOff ? 0 : (result.series[result.series.length - 1]?.balance ?? 0);
}

/**
 * Smallest monthly payment (whole currency units) that pays the debt off by
 * `target`. Returns null when impossible (e.g. increments with no end date, or
 * the target is before the last increment).
 */
export function requiredPaymentForTarget(base: Omit<DebtSimParams, "monthlyPayment">, target: ISODate): Cents | null {
  if (target <= base.today) return null;
  const totalNeeded = base.startBalance + incrementDates(base, base.today, target).length * base.incrementAmount;
  let hi = Math.max(100, totalNeeded * 2);
  const check = (pay: Cents) => {
    const r = simulateDebt({ ...base, monthlyPayment: pay, maxMonths: Math.max(1, diffMonths(base.today, target) + 2) });
    return r.paidOff && r.payoffDate !== null && r.payoffDate <= target;
  };
  if (!check(hi)) return null;
  let lo = 0;
  while (hi - lo > 100) {
    const mid = Math.floor((lo + hi) / 2 / 100) * 100;
    if (mid <= lo) break;
    if (check(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}

// ---------------------------------------------------------------------------
// Strategies
// ---------------------------------------------------------------------------
export type StrategyKey = "conservative" | "balanced" | "aggressive";

export interface DebtStrategy {
  key: StrategyKey;
  label: string;
  share: number;
  monthlyPayment: Cents;
  result: DebtSimResult;
}

export interface StrategyInput {
  base: Omit<DebtSimParams, "monthlyPayment">;
  /** Monthly money left after essential and recurring obligations (base of the debt currency). */
  monthlyCapacity: Cents | null;
  /** Months of essential expenses covered by the emergency reserve, or null if unknown. */
  emergencyMonths: number | null;
}

export interface StrategyRecommendation {
  strategies: DebtStrategy[];
  recommended: StrategyKey | null;
  reasons: string[];
}

export const STRATEGY_SHARES: Record<StrategyKey, number> = { conservative: 0.25, balanced: 0.5, aggressive: 0.8 };
export const STRATEGY_LABELS: Record<StrategyKey, string> = {
  conservative: "Conservative",
  balanced: "Balanced",
  aggressive: "Aggressive",
};

export function buildStrategies(input: StrategyInput): StrategyRecommendation {
  const reasons: string[] = [];
  if (input.monthlyCapacity === null) {
    return {
      strategies: [],
      recommended: null,
      reasons: ["Cadastre suas receitas e despesas recorrentes para calcular quanto sobra por mês."],
    };
  }
  if (input.monthlyCapacity <= 0) {
    return {
      strategies: [],
      recommended: null,
      reasons: [
        "Pelos dados cadastrados, suas obrigações mensais já consomem toda a renda prevista. Antes de acelerar a dívida, é preciso aumentar a renda ou reduzir despesas.",
      ],
    };
  }
  const strategies: DebtStrategy[] = (Object.keys(STRATEGY_SHARES) as StrategyKey[]).map((key) => {
    const monthlyPayment = floorTo(mulCents(input.monthlyCapacity!, STRATEGY_SHARES[key]), 1000);
    return {
      key,
      label: STRATEGY_LABELS[key],
      share: STRATEGY_SHARES[key],
      monthlyPayment,
      result: simulateDebt({ ...input.base, monthlyPayment }),
    };
  });

  let recommended: StrategyKey;
  if (input.emergencyMonths === null) {
    recommended = "conservative";
    reasons.push("Não há dados suficientes sobre sua reserva de emergência; por segurança, a estratégia Conservative é a indicada.");
  } else if (input.emergencyMonths < 1) {
    recommended = "conservative";
    reasons.push(
      `Sua reserva cobre ${input.emergencyMonths.toFixed(1)} mês(es) de despesas essenciais (menos de 1). Proteja a reserva antes de acelerar a dívida.`,
    );
  } else if (input.emergencyMonths < 3) {
    recommended = "balanced";
    reasons.push(
      `Sua reserva cobre ${input.emergencyMonths.toFixed(1)} meses de despesas essenciais: há alguma proteção, mas ainda abaixo de 3 meses.`,
    );
  } else {
    recommended = "aggressive";
    reasons.push(
      `Sua reserva cobre ${input.emergencyMonths.toFixed(1)} meses de despesas essenciais (3 ou mais), o que permite priorizar a quitação.`,
    );
  }
  const rec = strategies.find((s) => s.key === recommended)!;
  if (!rec.result.coversIncrements) {
    const better = strategies.find((s) => s.result.coversIncrements);
    if (better && better.key !== recommended) {
      reasons.push(
        `A estratégia ${STRATEGY_LABELS[recommended]} não cobre os novos acréscimos; ${better.label} é o mínimo que impede a dívida de crescer.`,
      );
      recommended = better.key;
    } else if (!better) {
      reasons.push("Nenhuma estratégia dentro da sua sobra mensal atual cobre os acréscimos semestrais: a dívida continuará crescendo.");
    }
  }
  reasons.push("As estratégias usam 25%, 50% e 80% da sobra mensal estimada, mantendo o restante como margem para imprevistos.");
  return { strategies, recommended, reasons };
}
