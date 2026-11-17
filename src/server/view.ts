import "server-only";
import type { ClientContext } from "@/components/app-context";
import { isOpen } from "@/lib/finance/bills";
import { FxConverter } from "@/lib/finance/fx";
import { centsToInput } from "@/lib/format";
import { aiAvailable } from "./services/ai";
import { env } from "./env";
import type { AppData } from "./context";

/** Serializable context shared with client components (no secrets, no classes). */
export function buildClientContext({ user, snapshot: s }: AppData): ClientContext {
  const latest = new FxConverter(s.fxRates).latest("USD", "BRL");
  return {
    baseCurrency: s.profile.baseCurrency,
    locale: s.profile.locale,
    today: s.today,
    accounts: s.accounts.map((a) => ({ id: a.id, name: a.name, currency: a.currency, type: a.type, archived: a.archived })),
    displayName: s.profile.displayName,
    email: user.email,
    aiEnabled: s.profile.aiEnabled,
    aiAvailable: aiAvailable(),
    theme: s.profile.theme,
    backend: env.backend,
    usdBrl: latest ? { rate: latest.rate, rateDate: latest.rateDate, source: latest.source, isManual: latest.isManual } : null,
  };
}

export function shellData({ snapshot: s, analysis: a }: AppData) {
  return {
    notifications: a.notifications,
    openBills: a.views
      .filter((v) => isOpen(v))
      .slice(0, 60)
      .map((v) => ({
        occurrenceId: v.occurrence.id,
        name: v.bill.name,
        dueDate: v.occurrence.dueDate,
        remaining: centsToInput(v.remaining),
        remainingCents: v.remaining,
        currency: v.bill.currency,
        allowsPartial: v.bill.allowsPartial,
        accountId: v.bill.accountId,
      })),
    debts: s.debts.filter((d) => d.active).map((d) => ({ id: d.id, name: d.name, currency: d.currency })),
  };
}

export interface TxRow {
  id: string;
  kind: "income" | "expense" | "refund" | "transfer" | "debt_payment";
  status: "paid" | "pending";
  date: string;
  amount: number;
  amountInput: string;
  currency: "USD" | "BRL";
  accountId: string | null;
  accountName: string | null;
  accountAmount: number | null;
  toAccountName: string | null;
  toAmount: number | null;
  category: string | null;
  description: string;
  paymentMethod: string | null;
  notes: string | null;
  recurrence: string;
  baseAmount: number;
  overdue: boolean;
  source: "manual" | "bill" | "subscription" | "debt" | "income" | "import";
  refundOf: string | null;
}

export function txRows({ snapshot: s, analysis: a }: AppData, filter?: (t: AppData["snapshot"]["transactions"][number]) => boolean): TxRow[] {
  const accounts = new Map(s.accounts.map((x) => [x.id, x]));
  const billTx = new Set(s.billPayments.map((p) => p.transactionId).filter(Boolean) as string[]);
  return s.transactions.filter(filter ?? (() => true)).map((t) => {
    const acc = t.accountId ? accounts.get(t.accountId) : undefined;
    const baseAmount =
      acc && t.accountAmount !== null && acc.currency === a.ctx.base ? t.accountAmount : t.currency === a.ctx.base ? t.amount : a.ctx.toBase(t.amount, t.currency, t.date);
    return {
      id: t.id,
      kind: t.kind,
      status: t.status,
      date: t.date,
      amount: t.amount,
      amountInput: centsToInput(t.amount),
      currency: t.currency,
      accountId: t.accountId,
      accountName: acc?.name ?? null,
      accountAmount: t.accountAmount,
      toAccountName: t.toAccountId ? (accounts.get(t.toAccountId)?.name ?? null) : null,
      toAmount: t.toAmount,
      category: t.category,
      description: t.description,
      paymentMethod: t.paymentMethod,
      notes: t.notes,
      recurrence: t.recurrence,
      baseAmount,
      overdue: t.status === "pending" && t.date < s.today,
      source: billTx.has(t.id) ? "bill" : t.subscriptionId ? "subscription" : t.debtId ? "debt" : t.incomeId ? "income" : t.importHash ? "import" : "manual",
      refundOf: t.refundOf,
    };
  });
}
