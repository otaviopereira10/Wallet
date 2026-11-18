import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/primitives";
import { categoryLabel } from "@/lib/constants";
import { lateCost } from "@/lib/finance/bills";
import { planPayments } from "@/lib/finance/planner";
import { plannerItemsFrom } from "@/lib/finance/planner-input";
import { centsToInput } from "@/lib/format";
import { getAppData } from "@/server/context";
import { BillsClient, type BillDef, type OccRow, type PlannerData } from "./bills-client";

export const metadata: Metadata = { title: "Bills & Payments" };

export default async function BillsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const { snapshot: s, analysis: a } = await getAppData();

  const occ: OccRow[] = a.views.map((v) => ({
    occurrenceId: v.occurrence.id,
    billId: v.bill.id,
    name: v.bill.name,
    category: categoryLabel(v.bill.category),
    priority: v.bill.priority,
    dueDate: v.occurrence.dueDate,
    amountDue: v.occurrence.amountDue,
    amountDueInput: centsToInput(v.occurrence.amountDue),
    minimumDueInput: v.occurrence.minimumDue === null ? null : centsToInput(v.occurrence.minimumDue),
    paid: v.paid,
    remaining: v.remaining,
    remainingInput: centsToInput(v.remaining),
    minimumRemaining: v.minimumRemaining,
    status: v.status,
    daysUntilDue: v.daysUntilDue,
    currency: v.bill.currency,
    allowsPartial: v.bill.allowsPartial,
    accountId: v.bill.accountId,
    waived: v.occurrence.waived,
    notes: v.occurrence.notes,
    estLateCost: v.status === "overdue" ? lateCost(v.bill, v.remaining, -v.daysUntilDue) : 0,
    payments: v.payments.map((p) => ({ id: p.id, date: p.date, amount: p.amount, transactionId: p.transactionId })),
  }));

  const defs: BillDef[] = s.bills.map((b) => {
    const next = a.views.find((v) => v.bill.id === b.id && (v.status === "pending" || v.status === "partial" || v.status === "overdue"));
    return {
      id: b.id,
      name: b.name,
      amount: b.amount,
      currency: b.currency,
      priority: b.priority,
      recurrence: b.recurrence,
      categoryLabel: categoryLabel(b.category),
      active: b.active,
      nextDue: next?.occurrence.dueDate ?? null,
      lateFee: b.lateFee,
      interestRate: b.interestRate,
      allowsPartial: b.allowsPartial,
      initial: {
        id: b.id,
        name: b.name,
        amount: centsToInput(b.amount),
        minimumAmount: b.minimumAmount === null ? null : centsToInput(b.minimumAmount),
        currency: b.currency,
        category: b.category,
        priority: b.priority,
        recurrence: b.recurrence,
        firstDueDate: b.firstDueDate,
        endDate: b.endDate,
        lateFee: centsToInput(b.lateFee),
        interestRate: b.interestRate,
        allowsPartial: b.allowsPartial,
        accountId: b.accountId,
        notes: b.notes,
      },
    };
  });

  const items = plannerItemsFrom(s, a, 30);
  const plan = planPayments({ cash: a.spendableBalance, buffer: s.profile.emergencyBuffer, items, today: s.today });
  // Conversion back to each bill's own currency when recording planned payments.
  const original = new Map<string, { remaining: number; currency: "USD" | "BRL" }>();
  for (const v of a.views) original.set(v.occurrence.id, { remaining: v.remaining, currency: v.bill.currency });
  for (const t of s.transactions) if (t.kind === "expense" && t.status === "pending") original.set(`expense:${t.id}`, { remaining: t.amount, currency: t.currency });

  const planner: PlannerData = {
    today: s.today,
    cash: a.spendableBalance,
    buffer: s.profile.emergencyBuffer,
    essentialMonthly: a.capacity.essentialMonthly,
    items,
    plan,
    originals: Object.fromEntries(items.map((i) => [i.id, original.get(i.id) ?? { remaining: i.amount, currency: s.profile.baseCurrency }])),
  };

  return (
    <>
      <PageHeader
        eyebrow="Your money"
        title="Bills & Payments"
        description="Every bill you need to pay, with due dates, priorities and a planner that tells you what to pay first. Nothing is paid automatically."
      />
      <BillsClient
        occurrences={occ}
        bills={defs}
        planner={planner}
        totals={{
          month: a.buckets.monthTotal,
          overdue: a.buckets.overdueTotal,
          paidThisMonth: a.buckets.paidThisMonth,
          counts: { overdue: a.buckets.overdue.length, today: a.buckets.dueToday.length, next7: a.buckets.next7.length, next30: a.buckets.next30.length },
        }}
        initialTab={tab === "planner" ? "planner" : "overview"}
      />
    </>
  );
}
