import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/primitives";
import { FREQUENCY_LABELS } from "@/lib/constants";
import { centsToInput } from "@/lib/format";
import { getAppData } from "@/server/context";
import { SubscriptionsClient } from "./subscriptions-client";

export const metadata: Metadata = { title: "Subscriptions" };

export default async function SubscriptionsPage() {
  const { snapshot: s, analysis: a } = await getAppData();
  const spent12 = new Map<string, number>();
  for (const t of s.transactions) if (t.subscriptionId && t.status === "paid") spent12.set(t.subscriptionId, (spent12.get(t.subscriptionId) ?? 0) + t.amount);
  const subs = a.subscriptions
    .map((v) => ({
      id: v.sub.id,
      name: v.sub.name,
      amount: v.sub.amount,
      amountInput: centsToInput(v.sub.amount),
      currency: v.sub.currency,
      cycleLabel: FREQUENCY_LABELS[v.sub.billingCycle],
      nextChargeDate: v.sub.nextChargeDate,
      daysUntilCharge: v.daysUntilCharge,
      chargeSoon: v.chargeSoon,
      chargeOverdue: v.chargeOverdue,
      status: v.sub.status,
      usage: v.usage,
      daysSinceUse: v.daysSinceUse,
      monthly: v.monthly,
      yearly: v.yearly,
      accountId: v.sub.accountId,
      totalCharged: spent12.get(v.sub.id) ?? 0,
      initial: {
        id: v.sub.id,
        name: v.sub.name,
        amount: centsToInput(v.sub.amount),
        currency: v.sub.currency,
        billingCycle: v.sub.billingCycle,
        nextChargeDate: v.sub.nextChargeDate,
        category: v.sub.category,
        accountId: v.sub.accountId,
        status: v.sub.status,
        lastUsedOn: v.sub.lastUsedOn,
        usageNote: v.sub.usageNote,
        notes: v.sub.notes,
      },
    }))
    .sort((x, y) => (x.status === "cancelled" ? 1 : 0) - (y.status === "cancelled" ? 1 : 0) || (x.nextChargeDate < y.nextChargeDate ? -1 : 1));
  return (
    <>
      <PageHeader
        eyebrow="Your money"
        title="Subscriptions"
        description="Services you pay for regularly, like streaming, iCloud, apps and the gym. “Rarely used” only appears when you tell the app when you last used it."
      />
      <SubscriptionsClient subs={subs} totals={a.subTotals} />
    </>
  );
}
