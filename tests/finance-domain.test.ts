import { describe, expect, it } from "vitest";
import { analyze } from "@/lib/finance/analysis";
import { answerQuestion, detectIntent, extractAmount, extractMonths } from "@/lib/finance/assistant";
import { billBuckets, buildOccurrenceViews, lateCost, missingOccurrences } from "@/lib/finance/bills";
import { budgetSummary } from "@/lib/finance/budget";
import { buildTimeline, collectFlowEvents, expectedIncomeOccurrences, safeToSpendUntil, unconfirmedIncomes } from "@/lib/finance/cashflow";
import {
  buildStrategies,
  debtBalance,
  debtHistory,
  pendingAutoEvents,
  requiredPaymentForTarget,
  simulateDebt,
} from "@/lib/finance/debt";
import { MoneyContext } from "@/lib/finance/fx";
import { goalProgress, recommendContributions } from "@/lib/finance/goals";
import { accountBalances, periodFlows, spendingByCategory, totalBalance } from "@/lib/finance/ledger";
import { evaluateManualPlan, planPayments, type PlannerItem } from "@/lib/finance/planner";
import { buildReport } from "@/lib/finance/reports";
import { subscriptionView } from "@/lib/finance/subscriptions";
import type { FxRate } from "@/lib/finance/types";
import { account, bill, debt, debtEvent, goal, income, occurrence, payment, snapshot, subscription, tx } from "./fixtures";

const usd = new MoneyContext("USD", []);

describe("ledger — balances and flows", () => {
  const checking = account({ openingBalance: 100000 });
  const savings = account({ name: "Savings", type: "savings", openingBalance: 50000, includeInAvailable: false });

  it("transfers move money between own accounts without being income or expense", () => {
    const t = tx({ kind: "transfer", amount: 20000, date: "2026-11-02", accountId: checking.id, toAccountId: savings.id, toAmount: 20000 });
    const balances = accountBalances([checking, savings], [t]);
    expect(balances.get(checking.id)).toBe(80000);
    expect(balances.get(savings.id)).toBe(70000);
    expect(totalBalance([checking, savings], [t], usd)).toBe(150000);
    const f = periodFlows([t], [checking, savings], usd, "2026-11-01", "2026-11-30");
    expect(f.income).toBe(0);
    expect(f.netExpenses).toBe(0);
    expect(f.transferVolume).toBe(20000);
  });

  it("pending expenses never reduce the real balance", () => {
    const pending = tx({ kind: "expense", amount: 30000, date: "2026-11-10", status: "pending", accountId: checking.id });
    expect(accountBalances([checking], [pending]).get(checking.id)).toBe(100000);
    const f = periodFlows([pending], [checking], usd, "2026-11-01", "2026-11-30");
    expect(f.expensesPaid).toBe(0);
    expect(f.expensesPending).toBe(30000);
  });

  it("debt payments are cash outflows counted exactly once", () => {
    const pay = tx({ kind: "debt_payment", amount: 25000, date: "2026-11-05", accountId: checking.id, category: "debt" });
    expect(accountBalances([checking], [pay]).get(checking.id)).toBe(75000);
    const f = periodFlows([pay], [checking], usd, "2026-11-01", "2026-11-30");
    expect(f.debtPayments).toBe(25000);
    expect(f.netExpenses).toBe(0);
    expect(f.outflows).toBe(25000);
  });

  it("refunds reduce category spending and increase the balance", () => {
    const buy = tx({ kind: "expense", amount: 8000, date: "2026-11-03", accountId: checking.id, category: "personal" });
    const refund = tx({ kind: "refund", amount: 3000, date: "2026-11-06", accountId: checking.id, category: "personal", refundOf: buy.id });
    expect(accountBalances([checking], [buy, refund]).get(checking.id)).toBe(95000);
    expect(spendingByCategory([buy, refund], [checking], usd, "2026-11-01", "2026-11-30").personal).toBe(5000);
  });

  it("ignores movements dated before the account opening (already in the opening balance)", () => {
    const acc = account({ openingBalance: 100000, openingDate: "2026-11-01" });
    const old = tx({ kind: "expense", amount: 5000, date: "2026-10-20", accountId: acc.id });
    expect(accountBalances([acc], [old]).get(acc.id)).toBe(100000);
  });

  it("converts other currencies explicitly with the stored account amount", () => {
    const brl = account({ currency: "BRL", openingBalance: 550000 });
    const rates: FxRate[] = [
      { base: "USD", quote: "BRL", rate: "5.5", rateDate: "2026-11-15", source: "test", isManual: false, fetchedAt: "2026-11-15T00:00:00Z" },
    ];
    const ctx = new MoneyContext("USD", rates);
    expect(totalBalance([brl], [], ctx)).toBe(100000);
  });
});

describe("bills", () => {
  const rent = bill({ firstDueDate: "2026-10-20", allowsPartial: true, minimumAmount: 30000, lateFee: 5000, interestRate: "36" });
  const o1 = occurrence(rent, "2026-10-20");
  const o2 = occurrence(rent, "2026-11-20");

  it("materialises recurring occurrences once (idempotent)", () => {
    const missing = missingOccurrences(rent, [o1, o2], "2026-11-16");
    // horizon = today + 62 days (2027-01-17)
    expect(missing.map((m) => m.dueDate)).toEqual(["2026-12-20"]);
    expect(missingOccurrences(rent, [o1, o2, occurrence(rent, "2026-12-20")], "2026-11-16")).toEqual([]);
  });

  it("derives paid / partial / overdue status from payments", () => {
    const views = buildOccurrenceViews([rent], [o1, o2], [payment(o1, 40000, "2026-10-25"), payment(o2, 20000, "2026-11-10")], "2026-11-16");
    expect(views[0].status).toBe("overdue");
    expect(views[0].remaining).toBe(60000);
    expect(views[0].minimumRemaining).toBe(0);
    expect(views[1].status).toBe("partial");
    expect(views[1].remaining).toBe(80000);
    expect(views[1].minimumRemaining).toBe(10000);
    const paid = buildOccurrenceViews([rent], [o2], [payment(o2, 100000, "2026-11-12")], "2026-11-16");
    expect(paid[0].status).toBe("paid");
  });

  it("groups by urgency and totals the month", () => {
    const water = bill({ name: "Água", amount: 5000, firstDueDate: "2026-11-16", recurrence: "once" });
    const phone = bill({ name: "Celular", amount: 4000, firstDueDate: "2026-11-21", recurrence: "once", priority: "important" });
    const net = bill({ name: "Internet", amount: 6000, firstDueDate: "2026-12-10", recurrence: "once", priority: "important" });
    const occs = [occurrence(water, "2026-11-16"), occurrence(phone, "2026-11-21"), occurrence(net, "2026-12-10"), o1];
    const views = buildOccurrenceViews([water, phone, net, rent], occs, [], "2026-11-16");
    const b = billBuckets(views, "2026-11-16", (c) => c);
    expect(b.dueToday.map((v) => v.bill.name)).toEqual(["Água"]);
    expect(b.next7.map((v) => v.bill.name)).toEqual(["Celular"]);
    expect(b.next30.map((v) => v.bill.name)).toEqual(["Internet"]);
    expect(b.overdue).toHaveLength(1);
    expect(b.monthTotal).toBe(5000 + 4000 + 100000);
  });

  it("estimates late cost with fee + prorated interest", () => {
    expect(lateCost({ lateFee: 5000, interestRate: "36.5" }, 100000, 30)).toBe(5000 + 3000);
    expect(lateCost({ lateFee: 5000, interestRate: "36.5" }, 100000, 0)).toBe(0);
  });
});

describe("Smart Payment Planner", () => {
  const today = "2026-11-16";
  const item = (over: Partial<PlannerItem>): PlannerItem => ({
    id: Math.random().toString(36),
    source: "bill",
    name: "x",
    category: "other",
    priority: "important",
    dueDate: "2026-11-20",
    amount: 10000,
    minimum: 10000,
    allowsPartial: false,
    lateFee: 0,
    interestRate: "0",
    ...over,
  });

  it("never places an optional bill ahead of an essential one", () => {
    const optionalSoon = item({ name: "Show", priority: "optional", dueDate: "2026-11-17" });
    const rentLater = item({ name: "Aluguel", priority: "essential", dueDate: "2026-11-30" });
    const r = planPayments({ cash: 10000, buffer: 0, items: [optionalSoon, rentLater], today });
    expect(r.order[0].item.name).toBe("Aluguel");
    expect(r.order[0].allocated).toBe(10000);
    expect(r.order[1].allocated).toBe(0);
    expect(r.order[1].payWhen).toBe("needs_money");
  });

  it("puts overdue first within the same priority and explains ties", () => {
    const a = item({ name: "Luz", priority: "essential", dueDate: "2026-11-10" });
    const b = item({ name: "Água", priority: "essential", dueDate: "2026-11-18" });
    const c = item({ name: "Gás", priority: "essential", dueDate: "2026-11-18", lateFee: 2000 });
    const r = planPayments({ cash: 100000, buffer: 0, items: [b, c, a], today });
    expect(r.order.map((o) => o.item.name)).toEqual(["Luz", "Gás", "Água"]);
    expect(r.tieExplanations.join(" ")).toContain("custo do atraso");
  });

  it("covers minimums first, then tops up, protecting the buffer from non-essentials", () => {
    const card = item({ name: "Cartão", priority: "important", amount: 50000, minimum: 10000, allowsPartial: true });
    const rent = item({ name: "Aluguel", priority: "essential", amount: 40000, minimum: 40000 });
    const r = planPayments({ cash: 60000, buffer: 10000, items: [card, rent], today });
    const byName = Object.fromEntries(r.order.map((o) => [o.item.name, o]));
    expect(byName["Aluguel"].allocated).toBe(40000);
    expect(byName["Cartão"].allocated).toBe(10000); // 60k − 10k buffer − 40k rent
    expect(byName["Cartão"].minimumCovered).toBe(true);
    expect(r.safeToSpend).toBe(0);
    expect(r.shortfall).toBe(40000);
  });

  it("lets essentials use the buffer and warns about it", () => {
    const rent = item({ name: "Aluguel", priority: "essential", amount: 55000 });
    const r = planPayments({ cash: 60000, buffer: 10000, items: [rent], today });
    expect(r.order[0].allocated).toBe(55000);
    expect(r.warnings.join(" ")).toContain("reserva mínima");
  });

  it("flags the highest risk and validates manual simulations", () => {
    const rent = item({ id: "rent", name: "Aluguel", priority: "essential", amount: 90000, dueDate: "2026-11-18" });
    const fun = item({ id: "fun", name: "Show", priority: "optional", amount: 10000 });
    const input = { cash: 50000, buffer: 0, items: [rent, fun], today };
    expect(planPayments(input).highestRisk?.item.name).toBe("Aluguel");
    const ev = evaluateManualPlan(input, { fun: 10000, rent: 30000 });
    expect(ev.warnings.join(" ")).toContain("menor prioridade");
    expect(ev.warnings.join(" ")).toContain("não aceita pagamento parcial");
  });
});

describe("University Debt Manager", () => {
  it("posts each semester increment once, separately from interest", () => {
    const d = debt({ startDate: "2026-01-01", incrementAnchorDate: "2026-02-15" });
    const auto = pendingAutoEvents(d, [], "2026-11-16");
    expect(auto).toEqual([
      { date: "2026-02-15", type: "increment", amount: 550000 },
      { date: "2026-08-15", type: "increment", amount: 550000 },
    ]);
    const posted = auto.map((e) => debtEvent(d, { ...e, automatic: true }));
    expect(pendingAutoEvents(d, posted, "2026-11-16")).toEqual([]);
    // a voided (user-removed) increment is not re-created
    posted[0].voided = true;
    expect(pendingAutoEvents(d, posted, "2026-11-16")).toEqual([]);
  });

  it("computes balance = previous + increments + interest − payments", () => {
    const d = debt({ initialBalance: 1000000, startDate: "2026-01-01" });
    const events = [
      debtEvent(d, { type: "increment", amount: 550000, date: "2026-02-15", automatic: true }),
      debtEvent(d, { type: "payment", amount: 30000, date: "2026-03-05" }),
      debtEvent(d, { type: "interest", amount: 1234, date: "2026-03-31", automatic: true }),
      debtEvent(d, { type: "adjustment", amount: -1000, date: "2026-04-01" }),
    ];
    expect(debtBalance(d, events)).toBe(1000000 + 550000 - 30000 + 1234 - 1000);
    expect(debtBalance(d, events, "2026-02-28")).toBe(1550000);
    const history = debtHistory(d, events);
    expect(history.map((h) => h.balanceAfter)).toEqual([1000000, 1550000, 1520000, 1521234, 1520234]);
    expect(history[2].balanceBefore).toBe(1550000);
  });

  it("accrues monthly interest when a rate is configured (prorated first month)", () => {
    const d = debt({ initialBalance: 1200000, startDate: "2026-09-16", incrementAnchorDate: null, interestRate: "6" });
    const auto = pendingAutoEvents(d, [], "2026-11-16");
    expect(auto.map((e) => e.date)).toEqual(["2026-09-30", "2026-10-31"]);
    expect(auto[0].amount).toBe(Math.round(1200000 * 0.06 * 14 / 365)); // 14 days
    expect(auto[1].amount).toBe(Math.round((1200000 + auto[0].amount) * 0.005));
  });

  it("alerts when the monthly payment does not cover the increments", () => {
    const sim = simulateDebt({
      startBalance: 1000000,
      today: "2026-11-16",
      monthlyPayment: 50000,
      paymentDay: 5,
      incrementAmount: 550000,
      incrementIntervalMonths: 6,
      incrementAnchorDate: "2027-02-15",
      incrementsEndDate: null,
      annualRate: "0",
      maxMonths: 120,
    });
    expect(sim.breakEvenMonthly).toBe(91667);
    expect(sim.coversIncrements).toBe(false);
    expect(sim.paidOff).toBe(false);
    expect(sim.endBalance).toBeGreaterThan(1000000);
  });

  it("respects the real increment dates (not balance ÷ payment)", () => {
    // $10,000 balance, $1,000/month, 2 more increments of $5,500 (Feb and Aug 2027), then they stop.
    const sim = simulateDebt({
      startBalance: 1000000,
      today: "2026-11-16",
      monthlyPayment: 100000,
      paymentDay: 5,
      incrementAmount: 550000,
      incrementIntervalMonths: 6,
      incrementAnchorDate: "2027-02-15",
      incrementsEndDate: "2027-08-15",
      annualRate: "0",
    });
    expect(sim.incrementsCount).toBe(2);
    expect(sim.incrementsTotal).toBe(1100000);
    expect(sim.totalPaid).toBe(2100000);
    expect(sim.paidOff).toBe(true);
    // 21 payments from 2026-12-05 → last on 2028-08-05 (naive 10 months would be wrong)
    expect(sim.payoffDate).toBe("2028-08-05");
    expect(sim.totalInterest).toBe(0);
    expect(sim.principalPaid).toBe(2100000);
  });

  it("does not report payoff while a future increment will re-open the debt", () => {
    const sim = simulateDebt({
      startBalance: 100000,
      today: "2026-11-16",
      monthlyPayment: 200000,
      paymentDay: 5,
      incrementAmount: 550000,
      incrementIntervalMonths: 6,
      incrementAnchorDate: "2027-02-15",
      incrementsEndDate: "2027-02-15",
      annualRate: "0",
    });
    expect(sim.firstZeroDate).toBe("2026-12-05");
    expect(sim.incrementsCount).toBe(1);
    expect(sim.payoffDate).toBe("2027-05-05"); // 5,500 paid Mar, Apr, May
  });

  it("splits principal and interest and finds the payment for a target date", () => {
    const base = {
      startBalance: 1200000,
      today: "2026-11-16",
      paymentDay: 5,
      incrementAmount: 0,
      incrementIntervalMonths: 6,
      incrementAnchorDate: null,
      incrementsEndDate: null,
      annualRate: "6",
    };
    const sim = simulateDebt({ ...base, monthlyPayment: 50000 });
    expect(sim.paidOff).toBe(true);
    expect(sim.totalInterest).toBeGreaterThan(0);
    expect(sim.totalPaid).toBe(1200000 + sim.totalInterest);
    expect(sim.principalPaid + sim.interestPaid).toBe(sim.totalPaid);
    const need = requiredPaymentForTarget(base, "2028-11-30");
    expect(need).not.toBeNull();
    const check = simulateDebt({ ...base, monthlyPayment: need! });
    expect(check.payoffDate! <= "2028-11-30").toBe(true);
    const less = simulateDebt({ ...base, monthlyPayment: need! - 100 });
    expect(!less.payoffDate || less.payoffDate > "2028-11-30").toBe(true);
    // impossible with endless increments
    expect(requiredPaymentForTarget({ ...base, incrementAmount: 550000, incrementAnchorDate: "2027-02-15" }, "2028-11-30")).toBeNull();
  });

  it("recommends a strategy from income, obligations and reserve", () => {
    const base = {
      startBalance: 1000000,
      today: "2026-11-16",
      paymentDay: 5,
      incrementAmount: 550000,
      incrementIntervalMonths: 6,
      incrementAnchorDate: "2027-02-15",
      incrementsEndDate: "2028-08-15",
      annualRate: "0",
    };
    const r = buildStrategies({ base, monthlyCapacity: 200000, emergencyMonths: 4 });
    expect(r.strategies.map((s) => s.monthlyPayment)).toEqual([50000, 100000, 160000]);
    expect(r.recommended).toBe("aggressive");
    const low = buildStrategies({ base, monthlyCapacity: 200000, emergencyMonths: 0.5 });
    expect(low.recommended).toBe("balanced"); // conservative (500) does not cover increments (917)
    expect(buildStrategies({ base, monthlyCapacity: -100, emergencyMonths: 2 }).recommended).toBeNull();
  });
});

describe("cash flow", () => {
  it("never counts future income as money available now", () => {
    const acc = account({ openingBalance: 50000 });
    const s = snapshot({
      accounts: [acc],
      incomes: [income({ startDate: "2026-11-25", amount: 300000, createdOn: "2026-11-01" })],
      bills: [bill({ firstDueDate: "2026-11-28", amount: 70000 })],
    });
    s.occurrences = [occurrence(s.bills[0], "2026-11-28")];
    const events = collectFlowEvents(s, usd, { to: "2026-11-30" });
    const safe = safeToSpendUntil(50000, events, "2026-11-30", 0);
    expect(safe.obligations).toBe(70000);
    expect(safe.amount).toBe(0);
    const days = buildTimeline(50000, events, "2026-11-16", "2026-11-30");
    expect(days.find((d) => d.date === "2026-11-25")!.balance).toBe(350000);
    expect(days.at(-1)!.balance).toBe(280000);
  });

  it("skips received/skipped income occurrences and lists unconfirmed ones", () => {
    const inc = income({ startDate: "2026-10-01", createdOn: "2026-10-01" });
    const received = tx({ kind: "income", amount: 200000, date: "2026-10-01", incomeId: inc.id, incomeOccurrence: "2026-10-01" });
    expect(expectedIncomeOccurrences([inc], [received], "2026-10-01", "2026-12-31").map((o) => o.date)).toEqual([
      "2026-11-01",
      "2026-12-01",
    ]);
    expect(unconfirmedIncomes([inc], [received], "2026-11-16").map((o) => o.date)).toEqual(["2026-11-01"]);
    const skipped = { ...inc, skippedDates: ["2026-11-01"] };
    expect(unconfirmedIncomes([skipped], [received], "2026-11-16")).toEqual([]);
  });

  it("projects planned debt payments only for what is left this month", () => {
    const d = debt({ plannedMonthlyPayment: 30000, paymentDay: 20 });
    const s = snapshot({ debts: [d], debtEvents: [debtEvent(d, { type: "payment", amount: 10000, date: "2026-11-02" })] });
    const events = collectFlowEvents(s, usd, { to: "2026-12-31" }).filter((e) => e.type === "debt");
    expect(events.map((e) => [e.date, e.amount])).toEqual([
      ["2026-11-20", -20000],
      ["2026-12-20", -30000],
    ]);
  });
});

describe("budget, goals and subscriptions", () => {
  it("classifies budget lines and projects month-end spending", () => {
    const acc = account({ openingBalance: 100000 });
    const s = snapshot({
      today: "2026-11-15",
      accounts: [acc],
      budgets: [
        { id: "b1", category: "food", amount: 25000, currency: "USD" },
        { id: "b2", category: "entertainment", amount: 7000, currency: "USD" },
        { id: "b3", category: "transport", amount: 10000, currency: "USD" },
      ],
      transactions: [
        tx({ kind: "expense", amount: 15000, date: "2026-11-05", accountId: acc.id, category: "food" }),
        tx({ kind: "expense", amount: 8000, date: "2026-11-10", accountId: acc.id, category: "entertainment" }),
        tx({ kind: "expense", amount: 8500, date: "2026-11-12", accountId: acc.id, category: "transport" }),
      ],
    });
    const b = budgetSummary(s, usd, "2026-11-15", (c) => String(c));
    const by = Object.fromEntries(b.lines.map((l) => [l.category, l]));
    expect(by.food.state).toBe("ok");
    expect(by.food.projected).toBe(30000); // 150/15 days × 30
    expect(by.food.projectedState).toBe("over");
    expect(by.entertainment.state).toBe("over");
    expect(by.transport.state).toBe("warning");
    expect(b.totalLimit).toBe(42000);
    expect(b.totalSpent).toBe(31500);
    expect(b.recommendations.length).toBeGreaterThan(0);
  });

  it("estimates goal dates and required contributions", () => {
    const g = goal({ targetAmount: 120000, monthlyContribution: 20000, deadline: "2027-04-30" });
    const p = goalProgress(g, [{ id: "c", goalId: g.id, amount: 20000, date: "2026-10-01", note: null }], "2026-11-16");
    expect(p.saved).toBe(20000);
    expect(p.remaining).toBe(100000);
    expect(p.monthsToTarget).toBe(5);
    expect(p.requiredMonthly).toBe(16667);
    expect(p.onTrack).toBe(true);
    const rec = recommendContributions(30000, [
      { ...p, baseRemaining: 100000, baseRequired: 16667 },
      { ...goalProgress(goal({ priority: "low" }), [], "2026-11-16"), baseRemaining: 300000, baseRequired: null },
    ]);
    expect((rec.get(g.id) ?? 0) <= 16667).toBe(true);
    expect([...rec.values()].reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(30000);
  });

  it("only flags low subscription usage when usage data exists", () => {
    expect(subscriptionView(subscription(), "2026-11-16", 3).usage).toBe("unknown");
    expect(subscriptionView(subscription({ lastUsedOn: "2026-09-01" }), "2026-11-16", 3).usage).toBe("low");
    const soon = subscriptionView(subscription({ nextChargeDate: "2026-11-18" }), "2026-11-16", 3);
    expect(soon.chargeSoon).toBe(true);
    expect(soon.yearly).toBe(1199 * 12);
  });
});

describe("dashboard analysis and assistant", () => {
  const acc = account({ openingBalance: 200000, openingDate: "2026-09-01" });
  const rent = bill({ firstDueDate: "2026-11-20", amount: 120000 });
  const d = debt({ plannedMonthlyPayment: 100000, incrementAnchorDate: "2027-02-15", incrementsEndDate: "2028-08-15" });
  const s = snapshot({
    accounts: [acc],
    incomes: [income({ startDate: "2026-12-01", amount: 250000, createdOn: "2026-11-01", accountId: acc.id })],
    bills: [rent],
    occurrences: [occurrence(rent, "2026-11-20")],
    debts: [d],
    transactions: [
      tx({ kind: "expense", amount: 4000, date: "2026-10-05", accountId: acc.id, category: "food" }),
      tx({ kind: "expense", amount: 6000, date: "2026-11-05", accountId: acc.id, category: "food" }),
    ],
    profile: undefined as never,
  });
  s.profile = { ...snapshot().profile, emergencyBuffer: 10000 };

  it("computes dashboard numbers from real data only", () => {
    const a = analyze(s);
    expect(a.totalBalance).toBe(200000 - 4000 - 6000);
    expect(a.month.netExpenses).toBe(6000);
    // obligations this month: rent 1,200 (debt payment day 5 already passed → moved to today, 1,000)
    expect(a.safeMonth.obligations).toBe(120000 + 100000);
    expect(a.safeMonth.amount).toBe(0);
    expect(a.insights.some((i) => i.id === "next-bill")).toBe(true);
    expect(a.insights.some((i) => i.id.startsWith("cat-up-food"))).toBe(true);
    expect(a.notifications.length).toBeGreaterThanOrEqual(0);
  });

  it("detects intents and extracts values", () => {
    expect(detectIntent("Posso comprar algo de $150 este mês?")).toBe("can_afford");
    expect(detectIntent("Quanto posso gastar até meu próximo pagamento?")).toBe("spend_until_income");
    expect(detectIntent("Qual conta devo pagar primeiro?")).toBe("which_bill_first");
    expect(detectIntent("Estou gastando demais com alimentação?")).toBe("category_spending");
    expect(detectIntent("Quanto devo reservar para a faculdade?")).toBe("college_reserve");
    expect(detectIntent("Quanto preciso pagar mensalmente para quitar meu empréstimo?")).toBe("debt_monthly");
    expect(detectIntent("Como posso economizar $100 por mês?")).toBe("save_amount");
    expect(detectIntent("Qual será minha situação financeira daqui a seis meses?")).toBe("outlook");
    expect(extractAmount("Posso comprar algo de $150 este mês?")).toBe(15000);
    expect(extractAmount("comprar algo de R$ 1.250,90")).toBe(125090);
    expect(extractMonths("daqui a seis meses")).toBe(6);
    expect(extractMonths("em 2 anos")).toBe(24);
  });

  it("answers with data and never claims a purchase is safe without money", () => {
    const a = analyze(s);
    const r = answerQuestion("Posso comprar algo de $150 este mês?", s, a);
    expect(r.summary).not.toMatch(/^Sim/);
    expect(r.impact).toMatch(/Ponto mais baixo/);
    const first = answerQuestion("Qual conta devo pagar primeiro?", s, a);
    expect(first.summary).toContain("Aluguel");
    const debtQ = answerQuestion("Quanto preciso pagar mensalmente para quitar meu empréstimo em 2 anos?", s, a);
    expect(debtQ.summary).toMatch(/por mês/);
    const empty = answerQuestion("Posso comprar algo de $10?", snapshot(), analyze(snapshot()));
    expect(empty.missing.join(" ")).toContain("contas");
  });

  it("builds period reports that exclude transfers", () => {
    const savings = account({ type: "savings", includeInAvailable: false });
    const s2 = snapshot({
      accounts: [acc, savings],
      transactions: [
        tx({ kind: "income", amount: 300000, date: "2026-11-01", accountId: acc.id, category: "salary" }),
        tx({ kind: "expense", amount: 50000, date: "2026-11-02", accountId: acc.id, category: "housing" }),
        tx({ kind: "transfer", amount: 100000, date: "2026-11-03", accountId: acc.id, toAccountId: savings.id, toAmount: 100000 }),
      ],
    });
    const r = buildReport(s2, usd, "2026-11-01", "2026-11-30");
    expect(r.flows.income).toBe(300000);
    expect(r.flows.netExpenses).toBe(50000);
    expect(r.flows.net).toBe(250000);
    expect(r.savingsRate).toBe(83.3);
    expect(r.byCategory).toEqual([{ category: "housing", amount: 50000, share: 100 }]);
  });
});
