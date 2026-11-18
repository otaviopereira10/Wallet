import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/primitives";
import { categoryComparison } from "@/lib/finance/analysis";
import { recurringExpenseSeries } from "@/lib/finance/cashflow";
import { addMonths, endOfMonth, startOfMonth } from "@/lib/finance/dates";
import { monthlySeries, spendingByCategory } from "@/lib/finance/ledger";
import { monthlyEquivalent } from "@/lib/finance/recurrence";
import { lastMonths } from "@/lib/finance/reports";
import { formatMonth } from "@/lib/format";
import { getAppData } from "@/server/context";
import { txRows } from "@/server/view";
import { QuickAddButton } from "../dashboard/dashboard-client";
import { ExpensesClient } from "./expenses-client";

export const metadata: Metadata = { title: "Expenses" };

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const data = await getAppData();
  const { snapshot: s, analysis: a } = data;
  const loc = s.profile.locale;
  const rows = txRows(data, (t) => t.kind === "expense" || t.kind === "refund" || t.kind === "debt_payment");

  const evolution = monthlySeries(s.transactions, s.accounts, a.ctx, lastMonths(s.today, 12)).map((p) => ({
    label: formatMonth(p.month, loc),
    income: 0,
    expenses: p.expenses / 100,
    debt: p.debtPayments / 100,
  }));
  const monthStart = startOfMonth(s.today);
  const thisMonth = spendingByCategory(s.transactions, s.accounts, a.ctx, monthStart, endOfMonth(s.today), { includePending: true });
  const prevStart = startOfMonth(addMonths(monthStart, -1));
  const prevMonth = spendingByCategory(s.transactions, s.accounts, a.ctx, prevStart, endOfMonth(prevStart));

  // Average of the 3 previous complete months, per category (only months with any data).
  const firstTx = s.transactions.reduce<string | null>((m, t) => (!m || t.date < m ? t.date : m), null);
  const avg: Record<string, number> = {};
  let monthsWithData = 0;
  for (let i = 1; i <= 3; i++) {
    const st = startOfMonth(addMonths(monthStart, -i));
    if (!firstTx || endOfMonth(st) < firstTx) continue;
    monthsWithData++;
    for (const [k, v] of Object.entries(spendingByCategory(s.transactions, s.accounts, a.ctx, st, endOfMonth(st)))) avg[k] = (avg[k] ?? 0) + v;
  }
  for (const k of Object.keys(avg)) avg[k] = Math.round(avg[k] / Math.max(1, monthsWithData));
  const unusual = Object.entries(thisMonth)
    .filter(([k, v]) => monthsWithData > 0 && (avg[k] ?? 0) > 0 && v > avg[k] * 1.5 && v - avg[k] >= 2000)
    .map(([category, current]) => ({ category, current, average: avg[category] }));

  const series = recurringExpenseSeries(s.transactions).map((r) => ({
    seriesId: r.seriesId,
    id: r.latest.id,
    description: r.latest.description,
    amount: r.latest.amount,
    currency: r.latest.currency,
    recurrence: r.latest.recurrence,
    category: r.latest.category,
    lastDate: r.latest.date,
    nextDate: r.nextDate,
    monthly: a.ctx.toBase(monthlyEquivalent(r.latest.amount, { frequency: r.latest.recurrence }), r.latest.currency),
  }));

  return (
    <>
      <PageHeader
        eyebrow="Your money"
        title="Expenses"
        description="Everything you spent or still need to pay. Pending expenses do not lower your balance until you mark them as paid."
        actions={<QuickAddButton label="New expense" />}
      />
      <ExpensesClient
        rows={rows}
        initialQuery={q ?? ""}
        evolution={evolution}
        thisMonth={thisMonth}
        prevMonth={prevMonth}
        comparisonMtd={categoryComparison(s, a.ctx).map((c) => ({ ...c, pct: c.pct }))}
        unusual={unusual}
        series={series}
        monthsWithData={monthsWithData}
      />
    </>
  );
}
