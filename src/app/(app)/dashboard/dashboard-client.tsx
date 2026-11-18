"use client";

import { Plus } from "lucide-react";
import * as React from "react";
import { useFormat } from "@/components/app-context";
import { BillPaymentForm } from "@/components/forms/entity-forms";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/overlays";
import { Badge } from "@/components/ui/primitives";
import { PRIORITY_LABELS } from "@/lib/constants";
import type { Currency } from "@/lib/finance/types";
import { relativeDays } from "@/lib/format";

export function QuickAddButton({ label = "Add money in or out" }: { label?: string }) {
  return (
    <Button onClick={() => window.dispatchEvent(new Event("iw:quick-add"))}>
      <Plus /> {label}
    </Button>
  );
}

export interface UpcomingItem {
  occurrenceId: string;
  name: string;
  dueDate: string;
  daysUntilDue: number;
  remaining: number;
  remainingInput: string;
  currency: Currency;
  priority: "essential" | "important" | "optional";
  status: string;
  allowsPartial: boolean;
  accountId: string | null;
}

export function UpcomingBills({ items }: { items: UpcomingItem[] }) {
  const f = useFormat();
  const [paying, setPaying] = React.useState<UpcomingItem | null>(null);
  if (!items.length) return <p className="py-6 text-center text-sm text-muted">No open bills.</p>;
  return (
    <>
      <ul className="divide-y divide-border">
        {items.map((b) => (
          <li key={b.occurrenceId} className="flex items-center gap-3 py-2.5">
            <div className="grid w-11 shrink-0 place-items-center rounded-xl bg-surface-2 py-1 text-center">
              <span className="text-[10px] font-semibold uppercase text-muted">{new Intl.DateTimeFormat(f.locale, { month: "short", timeZone: "UTC" }).format(new Date(`${b.dueDate}T00:00:00Z`))}</span>
              <span className="text-base font-semibold leading-none text-ink">{b.dueDate.slice(8)}</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink">{b.name}</p>
              <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                {b.status === "overdue" ? <Badge tone="danger">Overdue · was due {relativeDays(b.daysUntilDue)}</Badge> : <span>Due {relativeDays(b.daysUntilDue)}</span>}
                <Badge tone={b.priority === "essential" ? "pink" : b.priority === "important" ? "info" : "neutral"}>{PRIORITY_LABELS[b.priority]}</Badge>
              </p>
            </div>
            <div className="text-right">
              <p className="tabular text-sm font-semibold">{f.money(b.remaining, b.currency)}</p>
              <button type="button" className="text-xs font-semibold text-pink-600 hover:underline" onClick={() => setPaying(b)}>
                Record payment
              </button>
            </div>
          </li>
        ))}
      </ul>
      <Modal open={!!paying} onOpenChange={(o) => !o && setPaying(null)} title={`Pay ${paying?.name ?? ""}`}>
        {paying && (
          <BillPaymentForm
            occurrenceId={paying.occurrenceId}
            remaining={paying.remainingInput}
            currency={paying.currency}
            allowsPartial={paying.allowsPartial}
            defaultAccountId={paying.accountId}
            onDone={() => setPaying(null)}
          />
        )}
      </Modal>
    </>
  );
}
