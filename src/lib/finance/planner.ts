import { PRIORITY_WEIGHT, lateCost } from "./bills";
import type { Cents, ISODate, Priority } from "./types";

/**
 * Smart Payment Planner.
 * Ordering rules (in this order):
 *   1. Priority class: essential → important → optional. An optional bill is
 *      never placed ahead of an essential one.
 *   2. Overdue before not-yet-due.
 *   3. Earlier due date first.
 *   4. Higher cost of delay (late fee + 30 days of late interest) first.
 *   5. Smaller amount first (clears more obligations with the same money).
 * Allocation: first every minimum (or full amount when partial payment is not
 * allowed) in that order, then top-ups to the full amount. Essential bills may
 * use the emergency buffer; important/optional bills may not.
 * Nothing here moves money — it only recommends.
 */
export interface PlannerItem {
  id: string;
  source: "bill" | "expense";
  name: string;
  category: string;
  priority: Priority;
  dueDate: ISODate;
  /** Remaining amount, base currency. */
  amount: Cents;
  /** Minimum acceptable now, base currency (equal to amount when partial payment is not allowed). */
  minimum: Cents;
  allowsPartial: boolean;
  lateFee: Cents;
  interestRate: string;
}

export interface PlannerAllocation {
  item: PlannerItem;
  rank: number;
  allocated: Cents;
  minimumCovered: boolean;
  fullyCovered: boolean;
  overdue: boolean;
  daysUntilDue: number;
  costOfDelay30: Cents;
  risk: "low" | "medium" | "high";
  riskScore: number;
  payWhen: "now" | "by_due" | "needs_money";
  reason: string;
}

export interface PlannerResult {
  order: PlannerAllocation[];
  cash: Cents;
  buffer: Cents;
  totalRequired: Cents;
  totalMinimum: Cents;
  allocatedTotal: Cents;
  leftover: Cents;
  safeToSpend: Cents;
  shortfall: Cents;
  highestRisk: PlannerAllocation | null;
  tieExplanations: string[];
  warnings: string[];
}

function daysBetween(a: ISODate, b: ISODate): number {
  const t = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  return Math.round((t(b) - t(a)) / 86_400_000);
}

export function compareItems(a: PlannerItem, b: PlannerItem, today: ISODate): { result: number; criterion: string } {
  const pw = PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority];
  if (pw !== 0) return { result: pw, criterion: "prioridade" };
  const ao = a.dueDate < today ? 1 : 0;
  const bo = b.dueDate < today ? 1 : 0;
  if (ao !== bo) return { result: bo - ao, criterion: "atraso" };
  if (a.dueDate !== b.dueDate) return { result: a.dueDate < b.dueDate ? -1 : 1, criterion: "vencimento" };
  const ac = lateCost(a, a.amount, 30);
  const bc = lateCost(b, b.amount, 30);
  if (ac !== bc) return { result: bc - ac, criterion: "custo do atraso" };
  if (a.amount !== b.amount) return { result: a.amount - b.amount, criterion: "valor" };
  return { result: a.name.localeCompare(b.name), criterion: "nome" };
}

export function planPayments(input: { cash: Cents; buffer: Cents; items: PlannerItem[]; today: ISODate }): PlannerResult {
  const { today } = input;
  const cash = Math.max(0, input.cash);
  const buffer = Math.max(0, input.buffer);
  const sorted = [...input.items].sort((a, b) => compareItems(a, b, today).result);

  const alloc = new Map<string, Cents>();
  let used = 0;
  const available = (p: Priority) => (p === "essential" ? cash : Math.max(0, cash - buffer)) - used;

  // Pass 1: minimums (or full amount when partial payment is not allowed).
  for (const it of sorted) {
    const need = it.allowsPartial ? Math.min(it.minimum, it.amount) : it.amount;
    const can = available(it.priority);
    if (need <= 0) continue;
    if (it.allowsPartial) {
      const give = Math.min(need, Math.max(0, can));
      if (give > 0) {
        alloc.set(it.id, give);
        used += give;
      }
    } else if (can >= need) {
      alloc.set(it.id, need);
      used += need;
    }
  }
  // Pass 2: top up partial-payment items to the full amount.
  for (const it of sorted) {
    if (!it.allowsPartial) continue;
    const current = alloc.get(it.id) ?? 0;
    const missing = it.amount - current;
    const can = available(it.priority);
    if (missing > 0 && can > 0) {
      const give = Math.min(missing, can);
      alloc.set(it.id, current + give);
      used += give;
    }
  }

  const tieExplanations: string[] = [];
  const order: PlannerAllocation[] = sorted.map((it, idx) => {
    const allocated = alloc.get(it.id) ?? 0;
    const daysUntilDue = daysBetween(today, it.dueDate);
    const overdue = daysUntilDue < 0;
    const minNeed = it.allowsPartial ? Math.min(it.minimum, it.amount) : it.amount;
    const minimumCovered = allocated >= minNeed;
    const fullyCovered = allocated >= it.amount;
    const costOfDelay30 = lateCost(it, it.amount, 30);
    const urgency = overdue ? 3 : daysUntilDue <= 3 ? 2.5 : daysUntilDue <= 7 ? 2 : daysUntilDue <= 30 ? 1 : 0.5;
    const uncovered = it.amount - allocated;
    const riskScore = PRIORITY_WEIGHT[it.priority] * urgency * (uncovered + costOfDelay30 + 1);
    let risk: PlannerAllocation["risk"] = "low";
    if (!minimumCovered && (overdue || daysUntilDue <= 7)) risk = "high";
    else if (!fullyCovered) risk = "medium";
    const payWhen: PlannerAllocation["payWhen"] =
      allocated === 0 ? "needs_money" : overdue || daysUntilDue <= 3 ? "now" : "by_due";
    let reason: string;
    if (overdue) reason = `Atrasada há ${-daysUntilDue} dia(s) — pagar o quanto antes para limitar multas e juros.`;
    else if (it.priority === "essential") reason = "Conta essencial: atrasar pode comprometer necessidades básicas.";
    else if (it.priority === "important") reason = "Conta importante: tem consequências se atrasar, mas vem depois das essenciais.";
    else reason = "Opcional: pode ser adiada se faltar dinheiro, sem prejudicar as contas essenciais.";
    if (idx > 0) {
      const prev = sorted[idx - 1];
      if (prev.priority === it.priority) {
        const { criterion } = compareItems(prev, it, today);
        tieExplanations.push(
          `“${prev.name}” vem antes de “${it.name}” (mesma prioridade): desempate por ${criterion}.`,
        );
      }
    }
    return {
      item: it,
      rank: idx + 1,
      allocated,
      minimumCovered,
      fullyCovered,
      overdue,
      daysUntilDue,
      costOfDelay30,
      risk,
      riskScore,
      payWhen,
      reason,
    };
  });

  const totalRequired = sorted.reduce((s, it) => s + it.amount, 0);
  const totalMinimum = sorted.reduce((s, it) => s + (it.allowsPartial ? Math.min(it.minimum, it.amount) : it.amount), 0);
  const leftover = cash - used;
  const safeToSpend = Math.max(0, leftover - buffer);
  const shortfall = Math.max(0, totalRequired - used);
  const highestRisk = order.length ? order.reduce((a, b) => (b.riskScore > a.riskScore ? b : a)) : null;

  const warnings: string[] = [];
  if (shortfall > 0) warnings.push("O dinheiro disponível não cobre todas as contas listadas.");
  if (used > cash - buffer && buffer > 0)
    warnings.push("Para cobrir contas essenciais, o plano usa parte da sua reserva mínima de segurança.");
  return {
    order,
    cash,
    buffer,
    totalRequired,
    totalMinimum,
    allocatedTotal: used,
    leftover,
    safeToSpend,
    shortfall,
    highestRisk,
    tieExplanations,
    warnings,
  };
}

/** Checks a user-defined distribution of money before anything is recorded. */
export function evaluateManualPlan(
  input: { cash: Cents; buffer: Cents; items: PlannerItem[]; today: ISODate },
  manual: Record<string, Cents>,
): { allocated: Cents; leftover: Cents; safeToSpend: Cents; warnings: string[] } {
  const warnings: string[] = [];
  let allocated = 0;
  for (const it of input.items) {
    const v = Math.max(0, manual[it.id] ?? 0);
    allocated += v;
    if (v > it.amount) warnings.push(`“${it.name}”: valor acima do que falta pagar.`);
    if (v > 0 && v < it.amount && !it.allowsPartial)
      warnings.push(`“${it.name}” não aceita pagamento parcial.`);
    if (v > 0 && it.allowsPartial && v < Math.min(it.minimum, it.amount))
      warnings.push(`“${it.name}”: valor abaixo do mínimo permitido.`);
  }
  const essentialsUncovered = input.items.filter(
    (it) => it.priority === "essential" && (manual[it.id] ?? 0) < (it.allowsPartial ? Math.min(it.minimum, it.amount) : it.amount),
  );
  const lesserPaid = input.items.filter((it) => it.priority !== "essential" && (manual[it.id] ?? 0) > 0);
  if (essentialsUncovered.length && lesserPaid.length)
    warnings.push(
      `Atenção: você está pagando contas de menor prioridade enquanto ${essentialsUncovered
        .map((i) => `“${i.name}”`)
        .join(", ")} (essencial) não está coberta.`,
    );
  if (allocated > input.cash) warnings.push("A distribuição ultrapassa o dinheiro disponível.");
  const leftover = input.cash - allocated;
  return { allocated, leftover, safeToSpend: Math.max(0, leftover - input.buffer), warnings };
}
