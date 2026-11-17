"use client";

import { ArrowLeftRight, CalendarCheck2, GraduationCap, Minus, Plus, RotateCcw } from "lucide-react";
import * as React from "react";
import { useFormat } from "@/components/app-context";
import { BillPaymentForm, DebtPaymentForm } from "@/components/forms/entity-forms";
import { ExpenseForm, IncomeTxForm, RefundForm, TransferForm } from "@/components/forms/transaction-forms";
import { Modal } from "@/components/ui/overlays";
import { cn } from "@/lib/cn";
import type { Currency } from "@/lib/finance/types";

export interface QuickBill {
  occurrenceId: string;
  name: string;
  dueDate: string;
  remaining: string;
  remainingCents: number;
  currency: Currency;
  allowsPartial: boolean;
  accountId: string | null;
}

type Kind = "expense" | "income" | "transfer" | "bill" | "debt" | "refund";

const KINDS: Array<{ key: Kind; label: string; icon: React.ReactNode }> = [
  { key: "expense", label: "Despesa", icon: <Minus /> },
  { key: "income", label: "Receita", icon: <Plus /> },
  { key: "bill", label: "Pagar conta", icon: <CalendarCheck2 /> },
  { key: "transfer", label: "Transferência", icon: <ArrowLeftRight /> },
  { key: "debt", label: "Pagar dívida", icon: <GraduationCap /> },
  { key: "refund", label: "Reembolso", icon: <RotateCcw /> },
];

export function QuickAdd({
  open,
  onOpenChange,
  openBills,
  debts,
  initialKind = "expense",
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  openBills: QuickBill[];
  debts: Array<{ id: string; name: string; currency: Currency }>;
  initialKind?: Kind;
}) {
  const [kind, setKind] = React.useState<Kind>(initialKind);
  const [billId, setBillId] = React.useState<string>("");
  const f = useFormat();
  React.useEffect(() => {
    if (open) setKind(initialKind);
  }, [open, initialKind]);
  const close = () => onOpenChange(false);
  const bill = openBills.find((b) => b.occurrenceId === billId) ?? openBills[0];
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Nova movimentação" description="Registre rapidamente o que aconteceu com seu dinheiro." size="lg">
      <div className="mb-5 grid grid-cols-3 gap-2 sm:grid-cols-6">
        {KINDS.map((k) => (
          <button
            key={k.key}
            type="button"
            onClick={() => setKind(k.key)}
            className={cn(
              "flex flex-col items-center gap-1.5 rounded-2xl border px-2 py-3 text-xs font-medium transition [&_svg]:size-4",
              kind === k.key ? "border-pink-300 bg-pink-50 text-pink-600" : "border-border text-muted hover:bg-surface-2",
            )}
            aria-pressed={kind === k.key}
          >
            {k.icon}
            {k.label}
          </button>
        ))}
      </div>
      {kind === "expense" && <ExpenseForm onDone={close} />}
      {kind === "income" && <IncomeTxForm onDone={close} />}
      {kind === "transfer" && <TransferForm onDone={close} />}
      {kind === "refund" && <RefundForm onDone={close} />}
      {kind === "debt" && <DebtPaymentForm debts={debts} onDone={close} />}
      {kind === "bill" &&
        (openBills.length ? (
          <div className="space-y-4">
            <label className="block text-[13px] font-medium text-ink" htmlFor="qa-bill">
              Qual conta?
            </label>
            <select
              id="qa-bill"
              className="select-chevron h-11 w-full appearance-none rounded-xl border border-border-strong bg-surface px-3.5 pr-9 text-sm"
              value={bill?.occurrenceId}
              onChange={(e) => setBillId(e.target.value)}
            >
              {openBills.map((b) => (
                <option key={b.occurrenceId} value={b.occurrenceId}>
                  {b.name} — {f.date(b.dueDate, "short")} — {f.money(b.remainingCents, b.currency)}
                </option>
              ))}
            </select>
            {bill && (
              <BillPaymentForm
                key={bill.occurrenceId}
                occurrenceId={bill.occurrenceId}
                remaining={bill.remaining}
                currency={bill.currency}
                allowsPartial={bill.allowsPartial}
                defaultAccountId={bill.accountId}
                onDone={close}
              />
            )}
          </div>
        ) : (
          <p className="text-sm text-muted">Nenhuma conta em aberto. Cadastre contas em Bills & Payments.</p>
        ))}
    </Modal>
  );
}
