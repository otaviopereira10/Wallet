import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/primitives";
import { ACCOUNT_TYPE_LABELS } from "@/lib/constants";
import { centsToInput } from "@/lib/format";
import { getAppData } from "@/server/context";
import { txRows } from "@/server/view";
import { AccountsClient } from "./accounts-client";

export const metadata: Metadata = { title: "Accounts" };

export default async function AccountsPage() {
  const data = await getAppData();
  const { snapshot: s, analysis: a } = data;
  const counts = new Map<string, number>();
  for (const t of s.transactions) {
    if (t.accountId) counts.set(t.accountId, (counts.get(t.accountId) ?? 0) + 1);
    if (t.toAccountId) counts.set(t.toAccountId, (counts.get(t.toAccountId) ?? 0) + 1);
  }
  const accounts = a.accountRows.map((r) => ({
    id: r.account.id,
    name: r.account.name,
    type: r.account.type,
    typeLabel: ACCOUNT_TYPE_LABELS[r.account.type],
    currency: r.account.currency,
    balance: r.balance,
    baseBalance: r.baseBalance,
    openingBalance: centsToInput(r.account.openingBalance),
    openingCents: r.account.openingBalance,
    openingDate: r.account.openingDate,
    includeInAvailable: r.account.includeInAvailable,
    archived: r.account.archived,
    movements: counts.get(r.account.id) ?? 0,
  }));
  const transfers = txRows(data, (t) => t.kind === "transfer").slice(0, 50);
  return (
    <>
      <PageHeader
        eyebrow="Your money"
        title="Accounts"
        description="Where your money is. Balances only include money that was actually paid or received."
      />
      <AccountsClient
        accounts={accounts}
        transfers={transfers}
        totals={{ total: a.totalBalance, spendable: a.spendableBalance, missingFx: a.ctx.missingCurrencies }}
      />
    </>
  );
}
