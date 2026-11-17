"use client";

import { ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { useFormat } from "@/components/app-context";
import { ExpenseForm, IncomeTxForm } from "@/components/forms/transaction-forms";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/overlays";
import { Card, CardContent } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { addDays, daysInMonth, diffDays, parts, startOfWeek } from "@/lib/finance/dates";

export type CalKind =
  | "income_received"
  | "income_expected"
  | "bill_due"
  | "bill_overdue"
  | "bill_paid"
  | "expense_paid"
  | "expense_pending"
  | "debt_increment"
  | "debt_planned"
  | "debt_payment"
  | "goal"
  | "subscription";

export interface CalEvent {
  id: string;
  date: string;
  kind: CalKind;
  title: string;
  amount: string;
}

const KIND: Record<CalKind, { label: string; dot: string; chip: string }> = {
  income_received: { label: "Recebimento", dot: "bg-success", chip: "bg-success-bg text-success" },
  income_expected: { label: "Recebimento previsto", dot: "bg-success/50 ring-1 ring-success", chip: "border border-success/40 text-success" },
  bill_due: { label: "Vencimento", dot: "bg-pink-500", chip: "bg-pink-50 text-pink-600" },
  bill_overdue: { label: "Atrasada", dot: "bg-danger", chip: "bg-danger-bg text-danger" },
  bill_paid: { label: "Pagamento realizado", dot: "bg-sage", chip: "bg-success-bg text-success" },
  expense_paid: { label: "Despesa", dot: "bg-muted", chip: "bg-surface-2 text-muted" },
  expense_pending: { label: "Pagamento previsto", dot: "bg-warning", chip: "bg-warning-bg text-warning" },
  debt_increment: { label: "Acréscimo da faculdade", dot: "bg-plum", chip: "bg-surface-2 text-plum" },
  debt_planned: { label: "Pagamento da dívida previsto", dot: "bg-plum/50 ring-1 ring-plum", chip: "border border-plum/40 text-plum" },
  debt_payment: { label: "Pagamento da dívida", dot: "bg-plum", chip: "bg-surface-2 text-plum" },
  goal: { label: "Meta", dot: "bg-gold", chip: "bg-warning-bg text-gold" },
  subscription: { label: "Assinatura", dot: "bg-info", chip: "bg-info-bg text-info" },
};

const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

export function CalendarClient({
  monthKey,
  monthLabel,
  prevKey,
  nextKey,
  today,
  events,
}: {
  monthKey: string;
  monthLabel: string;
  prevKey: string;
  nextKey: string;
  today: string;
  events: CalEvent[];
}) {
  const f = useFormat();
  const first = `${monthKey}-01`;
  const { y, m } = parts(first);
  const dim = daysInMonth(y, m);
  const gridStart = startOfWeek(first);
  const totalCells = Math.ceil((diffDays(gridStart, first) + dim) / 7) * 7;
  const cells = Array.from({ length: totalCells }, (_, i) => addDays(gridStart, i));
  const byDate = React.useMemo(() => {
    const map = new Map<string, CalEvent[]>();
    for (const e of events) map.set(e.date, [...(map.get(e.date) ?? []), e]);
    return map;
  }, [events]);
  const defaultSelected = today.startsWith(monthKey) ? today : first;
  const [selected, setSelected] = React.useState(defaultSelected);
  React.useEffect(() => {
    setSelected(defaultSelected);
  }, [defaultSelected]);
  const [adding, setAdding] = React.useState<"expense" | "income" | null>(null);
  const dayEvents = byDate.get(selected) ?? [];
  const usedKinds = [...new Set(events.map((e) => e.kind))];

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
      <Card>
        <CardContent className="pt-5">
          <div className="mb-4 flex items-center justify-between">
            <Button asChild variant="ghost" size="icon-sm" aria-label="Mês anterior">
              <Link href={`/calendar?month=${prevKey}`}>
                <ChevronLeft />
              </Link>
            </Button>
            <h2 className="font-display text-xl first-letter:uppercase">{monthLabel}</h2>
            <Button asChild variant="ghost" size="icon-sm" aria-label="Próximo mês">
              <Link href={`/calendar?month=${nextKey}`}>
                <ChevronRight />
              </Link>
            </Button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-wide text-muted">
            {WEEKDAYS.map((d) => (
              <div key={d} className="py-1">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1" role="grid" aria-label={`Calendário de ${monthLabel}`}>
            {cells.map((d) => {
              const inMonth = d.startsWith(monthKey);
              const evs = byDate.get(d) ?? [];
              return (
                <button
                  key={d}
                  type="button"
                  role="gridcell"
                  aria-selected={selected === d}
                  aria-label={`${f.date(d, "long")}: ${evs.length} evento(s)`}
                  onClick={() => setSelected(d)}
                  className={cn(
                    "flex min-h-16 flex-col items-stretch rounded-xl border p-1.5 text-left transition sm:min-h-24",
                    inMonth ? "border-border bg-surface hover:border-pink-300" : "border-transparent bg-transparent opacity-40",
                    selected === d && "border-pink-500 ring-2 ring-pink-100",
                  )}
                >
                  <span className={cn("grid size-6 place-items-center rounded-full text-xs font-semibold", d === today ? "bg-pink-500 text-on-primary" : "text-ink")}>
                    {Number(d.slice(8))}
                  </span>
                  <span className="mt-1 hidden flex-col gap-0.5 sm:flex">
                    {evs.slice(0, 3).map((e) => (
                      <span key={e.id} className={cn("truncate rounded-md px-1 py-px text-[10px] font-medium", KIND[e.kind].chip)}>
                        {e.title.replace(/^(Vence|Pago|Previsto|Acréscimo previsto|Acréscimo|Recorrente): /, "")}
                      </span>
                    ))}
                    {evs.length > 3 && <span className="text-[10px] text-muted">+{evs.length - 3}</span>}
                  </span>
                  <span className="mt-auto flex flex-wrap gap-0.5 pt-1 sm:hidden">
                    {evs.slice(0, 4).map((e) => (
                      <span key={e.id} className={cn("size-1.5 rounded-full", KIND[e.kind].dot)} />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
          {usedKinds.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5">
              {usedKinds.map((k) => (
                <span key={k} className="flex items-center gap-1.5 text-xs text-muted">
                  <span className={cn("size-2 rounded-full", KIND[k].dot)} />
                  {KIND[k].label}
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="h-fit xl:sticky xl:top-20">
        <CardContent className="pt-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-pink-500">{selected === today ? "Hoje" : "Dia selecionado"}</p>
          <h3 className="font-display text-xl first-letter:uppercase">{f.date(selected, "long")}</h3>
          {dayEvents.length ? (
            <ul className="mt-4 space-y-2">
              {dayEvents.map((e) => (
                <li key={e.id} className="flex items-start gap-3 rounded-xl bg-surface-2/60 p-3">
                  <span className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", KIND[e.kind].dot)} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{e.title}</p>
                    <p className="text-xs text-muted">{KIND[e.kind].label}</p>
                  </div>
                  <span className="tabular text-sm font-semibold">{e.amount}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-muted">Nada registrado ou previsto para este dia.</p>
          )}
          <div className="mt-5 grid grid-cols-2 gap-2">
            <Button variant="secondary" size="sm" onClick={() => setAdding("expense")}>
              <Minus /> Despesa
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setAdding("income")}>
              <Plus /> Receita
            </Button>
          </div>
        </CardContent>
      </Card>

      <Modal open={adding === "expense"} onOpenChange={(o) => !o && setAdding(null)} title={`Despesa em ${f.date(selected)}`}>
        <ExpenseForm initial={{ date: selected, status: selected > today ? "pending" : "paid" }} onDone={() => setAdding(null)} />
      </Modal>
      <Modal open={adding === "income"} onOpenChange={(o) => !o && setAdding(null)} title={`Receita em ${f.date(selected)}`}>
        <IncomeTxForm initial={{ date: selected }} onDone={() => setAdding(null)} />
      </Modal>
    </div>
  );
}
