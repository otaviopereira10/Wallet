import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/primitives";
import { buildStrategies } from "@/lib/finance/debt";
import { centsToInput } from "@/lib/format";
import { getAppData } from "@/server/context";
import { DebtClient, type DebtPageData } from "./debt-client";

export const metadata: Metadata = { title: "University Debt Manager" };

export default async function DebtPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  const { snapshot: s, analysis: a } = await getAppData();
  const summary = a.debts.find((d) => d.debt.id === id) ?? a.debts[0] ?? null;

  let data: DebtPageData | null = null;
  if (summary) {
    const d = summary.debt;
    // Monthly capacity available for the debt, in the debt currency (after goals already planned).
    const cap = a.capacity.surplus === null ? null : a.capacity.surplus - a.capacity.plannedGoals;
    const capInDebt = cap === null ? null : d.currency === s.profile.baseCurrency ? cap : a.ctx.fromBase(cap, d.currency);
    const strategies = buildStrategies({ base: summary.baseParams, monthlyCapacity: capInDebt, emergencyMonths: a.capacity.emergencyMonths });
    data = {
      id: d.id,
      name: d.name,
      currency: d.currency,
      balance: summary.balance,
      nextIncrement: summary.nextIncrement,
      daysToIncrement: summary.daysToIncrement,
      incrementAmount: d.incrementAmount,
      incrementIntervalMonths: d.incrementIntervalMonths,
      incrementsEndDate: d.incrementsEndDate,
      interestRate: d.interestRate,
      plannedMonthlyPayment: d.plannedMonthlyPayment,
      paymentDay: d.paymentDay,
      targetPayoffDate: d.targetPayoffDate,
      paidTotal: summary.paidTotal,
      incrementsTotal: summary.incrementsTotal,
      interestTotal: summary.interestTotal,
      breakEven: summary.breakEven,
      insufficient: summary.insufficient,
      targetRequired: summary.targetRequired,
      baseParams: summary.baseParams,
      history: summary.history,
      strategies: {
        recommended: strategies.recommended,
        reasons: strategies.reasons,
        list: strategies.strategies.map((x) => ({ key: x.key, label: x.label, share: x.share, monthlyPayment: x.monthlyPayment })),
      },
      capacity: {
        surplus: a.capacity.surplus,
        assumptions: a.capacity.assumptions,
        missing: a.capacity.missing,
        emergencyMonths: a.capacity.emergencyMonths,
      },
      initial: {
        id: d.id,
        name: d.name,
        currency: d.currency,
        initialBalance: centsToInput(d.initialBalance),
        startDate: d.startDate,
        incrementAmount: centsToInput(d.incrementAmount),
        incrementIntervalMonths: d.incrementIntervalMonths,
        incrementAnchorDate: d.incrementAnchorDate,
        incrementsEndDate: d.incrementsEndDate,
        interestRate: d.interestRate,
        interestSince: d.interestSince,
        plannedMonthlyPayment: centsToInput(d.plannedMonthlyPayment),
        paymentDay: d.paymentDay,
        targetPayoffDate: d.targetPayoffDate,
        notes: d.notes,
      },
    };
  }

  return (
    <>
      <PageHeader
        eyebrow="Planning"
        title="University Debt"
        description="Your student loan: balance = starting balance + semester charges + interest − payments. Each semester charge is added on its real date."
      />
      <DebtClient data={data} debts={a.debts.map((x) => ({ id: x.debt.id, name: x.debt.name }))} />
    </>
  );
}
