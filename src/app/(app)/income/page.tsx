import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/primitives";
import { CATEGORY_LABELS, FREQUENCY_LABELS } from "@/lib/constants";
import { collectFlowEvents, nextIncomeOccurrence } from "@/lib/finance/cashflow";
import { addMonths, endOfMonth, monthKey } from "@/lib/finance/dates";
import { monthlyEquivalent } from "@/lib/finance/recurrence";
import { centsToInput, formatMonth } from "@/lib/format";
import { getAppData } from "@/server/context";
import { txRows } from "@/server/view";
import { IncomeClient } from "./income-client";

export const metadata: Metadata = { title: "Income" };

export default async function IncomePage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const data = await getAppData();
  const { snapshot: s, analysis: a } = data;
  const loc = s.profile.locale;

  const sources = s.incomes.map((i) => ({
    id: i.id,
    name: i.name,
    amount: i.amount,
    amountInput: centsToInput(i.amount),
    currency: i.currency,
    category: i.category,
    categoryLabel: CATEGORY_LABELS[i.category] ?? i.category,
    frequency: i.frequency,
    frequencyLabel:
      i.frequency === "custom"
        ? `Every ${i.customInterval} ${i.customUnit === "day" ? "day(s)" : i.customUnit === "week" ? "week(s)" : "month(s)"}`
        : FREQUENCY_LABELS[i.frequency],
    startDate: i.startDate,
    endDate: i.endDate,
    customInterval: i.customInterval,
    customUnit: i.customUnit,
    accountId: i.accountId,
    notes: i.notes,
    active: i.active,
    next: i.active ? nextIncomeOccurrence(i, s.transactions, s.today) : null,
    monthly: a.ctx.toBase(monthlyEquivalent(i.amount, { frequency: i.frequency, interval: i.customInterval, unit: i.customUnit }), i.currency),
    received: s.transactions.filter((t) => t.incomeId === i.id).length,
  }));

  const pendingConfirm = a.unconfirmed.map((u) => ({
    incomeId: u.income.id,
    name: u.income.name,
    date: u.date,
    amount: u.income.amount,
    amountInput: centsToInput(u.income.amount),
    currency: u.income.currency,
    accountId: u.income.accountId,
  }));

  // Projection: expected incomes vs scheduled outflows for the next 6 months (base currency).
  const end = endOfMonth(addMonths(s.today, 5));
  const events = collectFlowEvents(s, a.ctx, { to: end, includeGoals: false, views: a.views });
  const buckets = new Map<string, { inflow: number; outflow: number }>();
  for (let i = 0; i < 6; i++) buckets.set(monthKey(addMonths(s.today, i)), { inflow: 0, outflow: 0 });
  for (const e of events) {
    const b = buckets.get(monthKey(e.date));
    if (!b) continue;
    if (e.amount > 0) b.inflow += e.amount;
    else b.outflow += -e.amount;
  }
  let running = a.spendableBalance;
  const projection = [...buckets.entries()].map(([k, v]) => {
    running += v.inflow - v.outflow;
    return { month: k, label: formatMonth(k, loc, "long"), inflow: v.inflow, outflow: v.outflow, net: v.inflow - v.outflow, balance: running };
  });

  const upcoming = events
    .filter((e) => e.type === "income")
    .slice(0, 12)
    .map((e) => ({ id: e.id, label: e.label, date: e.date, amount: e.amount }));

  return (
    <>
      <PageHeader
        eyebrow="Your money"
        title="Income"
        description="Money coming in. Future payments appear in your forecasts, but only count in your balance once you confirm you received them."
      />
      <IncomeClient
        sources={sources}
        pendingConfirm={pendingConfirm}
        projection={projection}
        upcoming={upcoming}
        receipts={txRows(data, (t) => t.kind === "income")}
        initialQuery={q ?? ""}
        monthIncome={a.month.income}
        monthlyExpected={a.capacity.monthlyIncome}
      />
    </>
  );
}
