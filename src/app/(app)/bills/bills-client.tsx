"use client";

import { AlertTriangle, CalendarClock, CheckCircle2, ListOrdered, Pause, Pencil, Play, Plus, RotateCcw, ShieldAlert, ShieldCheck, Trash2, Wallet } from "lucide-react";
import * as React from "react";
import { useApp, useFormat, useServerAction } from "@/components/app-context";
import { BillForm, BillPaymentForm, OccurrenceEditForm, type BillInitial } from "@/components/forms/entity-forms";
import { AccountSelect } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { ActionMenu, ConfirmDialog, InfoTip, Modal, TabPanel, Tabs } from "@/components/ui/overlays";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, Field, Input, StatCard } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { FREQUENCY_LABELS, PRIORITY_LABELS } from "@/lib/constants";
import { evaluateManualPlan, type PlannerItem, type PlannerResult } from "@/lib/finance/planner";
import type { Currency, Priority } from "@/lib/finance/types";
import { centsToInput, relativeDays } from "@/lib/format";
import { deleteBill, deleteBillPayment, recordPlannedPayments, setBillActive } from "@/server/actions/bills";

export interface OccRow {
  occurrenceId: string;
  billId: string;
  name: string;
  category: string;
  priority: Priority;
  dueDate: string;
  amountDue: number;
  amountDueInput: string;
  minimumDueInput: string | null;
  paid: number;
  remaining: number;
  remainingInput: string;
  minimumRemaining: number;
  status: "paid" | "partial" | "pending" | "overdue" | "waived";
  daysUntilDue: number;
  currency: Currency;
  allowsPartial: boolean;
  accountId: string | null;
  waived: boolean;
  notes: string | null;
  estLateCost: number;
  payments: Array<{ id: string; date: string; amount: number; transactionId: string | null }>;
}

export interface BillDef {
  id: string;
  name: string;
  amount: number;
  currency: Currency;
  priority: Priority;
  recurrence: string;
  categoryLabel: string;
  active: boolean;
  nextDue: string | null;
  lateFee: number;
  interestRate: string;
  allowsPartial: boolean;
  initial: BillInitial;
}

export interface PlannerData {
  today: string;
  cash: number;
  buffer: number;
  essentialMonthly: number | null;
  items: PlannerItem[];
  plan: PlannerResult;
  originals: Record<string, { remaining: number; currency: Currency }>;
}

const PRIORITY_TONE = { essential: "pink", important: "info", optional: "neutral" } as const;
const STATUS = {
  overdue: { label: "Atrasada", tone: "danger" },
  pending: { label: "Pendente", tone: "warning" },
  partial: { label: "Parcial", tone: "info" },
  paid: { label: "Paga", tone: "success" },
  waived: { label: "Dispensada", tone: "neutral" },
} as const;

export function BillsClient({
  occurrences,
  bills,
  planner,
  totals,
  initialTab,
}: {
  occurrences: OccRow[];
  bills: BillDef[];
  planner: PlannerData;
  totals: { month: number; overdue: number; paidThisMonth: number; counts: { overdue: number; today: number; next7: number; next30: number } };
  initialTab: string;
}) {
  const f = useFormat();
  const { run } = useServerAction();
  const [creating, setCreating] = React.useState(false);
  const [editingBill, setEditingBill] = React.useState<BillInitial | null>(null);
  const [deletingBill, setDeletingBill] = React.useState<BillDef | null>(null);
  const [paying, setPaying] = React.useState<OccRow | null>(null);
  const [editingOcc, setEditingOcc] = React.useState<OccRow | null>(null);
  const [deletingPay, setDeletingPay] = React.useState<{ id: string; transactionId: string | null } | null>(null);

  const open = occurrences.filter((o) => o.status === "pending" || o.status === "partial" || o.status === "overdue");
  const groups = [
    { key: "overdue", title: "Atrasadas", items: open.filter((o) => o.status === "overdue") },
    { key: "today", title: "Vencem hoje", items: open.filter((o) => o.daysUntilDue === 0 && o.status !== "overdue") },
    { key: "7", title: "Próximos 7 dias", items: open.filter((o) => o.daysUntilDue >= 1 && o.daysUntilDue <= 7) },
    { key: "30", title: "Próximos 30 dias", items: open.filter((o) => o.daysUntilDue > 7 && o.daysUntilDue <= 30) },
    { key: "later", title: "Mais adiante", items: open.filter((o) => o.daysUntilDue > 30) },
  ];
  const history = occurrences.filter((o) => o.payments.length || o.status === "waived").reverse();

  const row = (o: OccRow) => (
    <li key={o.occurrenceId} className="flex flex-wrap items-center gap-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-ink">{o.name}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
          <span>
            {f.date(o.dueDate)} · {o.status === "overdue" ? `venceu ${relativeDays(o.daysUntilDue)}` : `vence ${relativeDays(o.daysUntilDue)}`}
          </span>
          <Badge tone={PRIORITY_TONE[o.priority]}>{PRIORITY_LABELS[o.priority]}</Badge>
          <Badge tone={STATUS[o.status].tone}>{STATUS[o.status].label}</Badge>
          {o.paid > 0 && <span>· pago {f.money(o.paid, o.currency)}</span>}
          {o.estLateCost > 0 && <span className="text-danger">· custo estimado do atraso {f.money(o.estLateCost, o.currency)}</span>}
        </p>
      </div>
      <div className="text-right">
        <p className="tabular font-semibold">{f.money(o.remaining, o.currency)}</p>
        {o.minimumRemaining > 0 && o.minimumRemaining < o.remaining && <p className="text-[11px] text-muted">mínimo {f.money(o.minimumRemaining, o.currency)}</p>}
      </div>
      <div className="flex items-center gap-1">
        <Button size="sm" onClick={() => setPaying(o)}>
          Pagar
        </Button>
        <ActionMenu items={[{ label: "Editar este vencimento", icon: <Pencil />, onSelect: () => setEditingOcc(o) }]} />
      </div>
    </li>
  );

  return (
    <>
      <div className="mb-6 grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Para quitar as contas do mês" value={f.money(totals.month)} icon={<CalendarClock />} tone="pink" sub="Inclui as atrasadas" />
        <StatCard label="Atrasadas" value={f.money(totals.overdue)} icon={<AlertTriangle />} tone={totals.counts.overdue ? "danger" : "neutral"} sub={`${totals.counts.overdue} conta(s)`} />
        <StatCard label="Já pago neste mês" value={f.money(totals.paidThisMonth)} icon={<CheckCircle2 />} tone="success" />
        <div className="flex items-center justify-center rounded-2xl border border-dashed border-border-strong p-4">
          <Button onClick={() => setCreating(true)}>
            <Plus /> Nova conta a pagar
          </Button>
        </div>
      </div>

      <Tabs
        defaultValue={initialTab}
        tabs={[
          { value: "overview", label: "Vencimentos", count: open.length },
          { value: "planner", label: "Smart Payment Planner" },
          { value: "bills", label: "Contas cadastradas", count: bills.length },
          { value: "history", label: "Histórico" },
        ]}
      >
        <TabPanel value="overview">
          {!open.length ? (
            <EmptyState
              icon={<CalendarClock />}
              title={bills.length ? "Nenhuma conta em aberto" : "Nenhuma conta cadastrada"}
              description={bills.length ? "Tudo pago por enquanto." : "Cadastre aluguel, telefone, internet e outras obrigações com o vencimento."}
              action={
                !bills.length && (
                  <Button onClick={() => setCreating(true)}>
                    <Plus /> Cadastrar conta
                  </Button>
                )
              }
            />
          ) : (
            <div className="space-y-4">
              {groups
                .filter((g) => g.items.length)
                .map((g) => (
                  <Card key={g.key} className={g.key === "overdue" ? "border-danger/40" : undefined}>
                    <CardHeader>
                      <CardTitle className={g.key === "overdue" ? "text-danger" : undefined}>
                        {g.title} <span className="ml-1 text-muted">({g.items.length})</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-1">
                      <ul className="divide-y divide-border">{g.items.map(row)}</ul>
                    </CardContent>
                  </Card>
                ))}
            </div>
          )}
        </TabPanel>

        <TabPanel value="planner">
          <Planner data={planner} />
        </TabPanel>

        <TabPanel value="bills">
          {bills.length ? (
            <div className="grid gap-3 md:grid-cols-2">
              {bills.map((b) => (
                <Card key={b.id} className={cn("p-5", !b.active && "opacity-60")}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{b.name}</p>
                      <p className="mt-1 flex flex-wrap gap-1.5">
                        <Badge tone={PRIORITY_TONE[b.priority]}>{PRIORITY_LABELS[b.priority]}</Badge>
                        <Badge>{FREQUENCY_LABELS[b.recurrence]}</Badge>
                        <Badge>{b.categoryLabel}</Badge>
                        {b.allowsPartial && <Badge tone="info">aceita parcial</Badge>}
                        {!b.active && <Badge tone="warning">Pausada</Badge>}
                      </p>
                    </div>
                    <ActionMenu
                      items={[
                        { label: "Editar", icon: <Pencil />, onSelect: () => setEditingBill(b.initial) },
                        { label: b.active ? "Pausar" : "Reativar", icon: b.active ? <Pause /> : <Play />, onSelect: () => run(() => setBillActive({ id: b.id, active: !b.active })) },
                        { label: "Excluir", icon: <Trash2 />, danger: true, onSelect: () => setDeletingBill(b) },
                      ]}
                    />
                  </div>
                  <p className="tabular mt-3 text-xl font-semibold">{f.money(b.amount, b.currency)}</p>
                  <p className="mt-1 text-xs text-muted">
                    {b.nextDue ? `Próximo vencimento em aberto: ${f.date(b.nextDue)}` : "Sem vencimentos em aberto"}
                    {(b.lateFee > 0 || Number(b.interestRate) > 0) &&
                      ` · atraso: ${b.lateFee ? f.money(b.lateFee, b.currency) : ""}${b.lateFee && Number(b.interestRate) ? " + " : ""}${Number(b.interestRate) ? `${b.interestRate}% a.a.` : ""}`}
                  </p>
                </Card>
              ))}
            </div>
          ) : (
            <EmptyState icon={<CalendarClock />} title="Nenhuma conta cadastrada" action={<Button onClick={() => setCreating(true)}><Plus /> Cadastrar conta</Button>} />
          )}
        </TabPanel>

        <TabPanel value="history">
          {history.length ? (
            <Card>
              <CardContent className="pt-5">
                <ul className="divide-y divide-border">
                  {history.map((o) => (
                    <li key={o.occurrenceId} className="py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold">
                          {o.name} <span className="font-normal text-muted">· vencimento {f.date(o.dueDate)}</span>
                        </p>
                        <Badge tone={STATUS[o.status].tone}>{STATUS[o.status].label}</Badge>
                      </div>
                      <ul className="mt-1.5 space-y-1">
                        {o.payments.map((p) => (
                          <li key={p.id} className="flex items-center justify-between gap-2 text-sm text-muted">
                            <span>
                              Pago em {f.date(p.date)} {p.transactionId ? "" : "(sem saída registrada)"}
                            </span>
                            <span className="flex items-center gap-2">
                              <span className="tabular font-medium text-ink">{f.money(p.amount, o.currency)}</span>
                              <Button variant="ghost" size="icon-sm" aria-label="Desfazer pagamento" onClick={() => setDeletingPay(p)}>
                                <RotateCcw />
                              </Button>
                            </span>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : (
            <p className="text-sm text-muted">Os pagamentos registrados aparecem aqui.</p>
          )}
        </TabPanel>
      </Tabs>

      <Modal open={creating} onOpenChange={setCreating} title="Nova conta a pagar" size="lg">
        <BillForm onDone={() => setCreating(false)} />
      </Modal>
      <Modal open={!!editingBill} onOpenChange={(o) => !o && setEditingBill(null)} title="Editar conta" size="lg">
        {editingBill && <BillForm initial={editingBill} onDone={() => setEditingBill(null)} />}
      </Modal>
      <Modal open={!!paying} onOpenChange={(o) => !o && setPaying(null)} title={`Pagar ${paying?.name ?? ""}`} description={paying ? `Vencimento ${f.date(paying.dueDate)} · falta ${f.money(paying.remaining, paying.currency)}` : undefined}>
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
      <Modal open={!!editingOcc} onOpenChange={(o) => !o && setEditingOcc(null)} title={`Vencimento de ${f.date(editingOcc?.dueDate)}`} description={editingOcc?.name}>
        {editingOcc && (
          <OccurrenceEditForm
            occurrenceId={editingOcc.occurrenceId}
            amountDue={editingOcc.amountDueInput}
            minimumDue={editingOcc.minimumDueInput}
            waived={editingOcc.waived}
            notes={editingOcc.notes}
            currency={editingOcc.currency}
            onDone={() => setEditingOcc(null)}
          />
        )}
      </Modal>
      <ConfirmDialog
        open={!!deletingBill}
        onOpenChange={(o) => !o && setDeletingBill(null)}
        title={`Excluir “${deletingBill?.name}”?`}
        description="Os vencimentos futuros serão removidos. Pagamentos já registrados continuam no histórico de despesas e no saldo."
        onConfirm={() => (deletingBill ? run(() => deleteBill({ id: deletingBill.id })) : undefined)}
      />
      <ConfirmDialog
        open={!!deletingPay}
        onOpenChange={(o) => !o && setDeletingPay(null)}
        title="Desfazer este pagamento?"
        description="O vencimento volta a ficar em aberto e a saída de dinheiro correspondente é removida."
        confirmLabel="Desfazer"
        onConfirm={() => (deletingPay ? run(() => deleteBillPayment({ id: deletingPay.id, transactionId: deletingPay.transactionId })) : undefined)}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
function Planner({ data }: { data: PlannerData }) {
  const f = useFormat();
  const app = useApp();
  const { run, pending } = useServerAction();
  const { plan } = data;
  const [simulating, setSimulating] = React.useState(false);
  const recommended = React.useMemo(() => Object.fromEntries(plan.order.map((o) => [o.item.id, o.allocated])), [plan]);
  const [manual, setManual] = React.useState<Record<string, string>>(() => Object.fromEntries(plan.order.map((o) => [o.item.id, centsToInput(o.allocated)])));
  const [recording, setRecording] = React.useState(false);
  const [account, setAccount] = React.useState(app.accounts.find((a) => !a.archived)?.id ?? "");
  const [date, setDate] = React.useState(app.today);

  const manualCents = Object.fromEntries(Object.entries(manual).map(([k, v]) => [k, Math.max(0, Math.round(Number(String(v).replace(",", ".")) * 100) || 0)]));
  const allocation = simulating ? manualCents : recommended;
  const evaluation = evaluateManualPlan({ cash: data.cash, buffer: data.buffer, items: data.items, today: data.today }, allocation);

  if (!data.items.length)
    return (
      <EmptyState
        icon={<ListOrdered />}
        title="Nada para planejar nos próximos 30 dias"
        description="O planner analisa contas e despesas pendentes que vencem em até 30 dias (e as atrasadas)."
      />
    );

  const emergency = data.buffer > 0 ? data.buffer : data.essentialMonthly;
  const toOriginal = (id: string, allocatedBase: number) => {
    const it = data.items.find((i) => i.id === id)!;
    const orig = data.originals[id];
    if (allocatedBase >= it.amount) return orig.remaining;
    if (orig.currency === f.base) return allocatedBase;
    return Math.round((allocatedBase * orig.remaining) / it.amount);
  };
  const toRecord = Object.entries(allocation).filter(([, v]) => v > 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Disponível agora" value={f.money(data.cash)} icon={<Wallet />} tone="pink" sub="Saldo real das contas do dia a dia" />
        <StatCard label="Obrigações (30 dias)" value={f.money(plan.totalRequired)} sub={`Mínimos: ${f.money(plan.totalMinimum)}`} />
        <StatCard
          label="Livre após o plano"
          value={f.money(evaluation.safeToSpend)}
          tone={evaluation.safeToSpend > 0 ? "success" : "warning"}
          icon={<ShieldCheck />}
          sub={`Mantendo ${f.money(data.buffer)} de reserva mínima`}
          info={<InfoTip>Quanto você pode gastar sem comprometer os pagamentos listados, depois de separar o valor de cada um e a reserva mínima.</InfoTip>}
        />
        <StatCard label="Falta para cobrir tudo" value={f.money(plan.shortfall)} tone={plan.shortfall ? "danger" : "success"} icon={plan.shortfall ? <ShieldAlert /> : <CheckCircle2 />} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {plan.highestRisk && (
          <Card className={plan.highestRisk.risk === "high" ? "border-danger/40" : undefined}>
            <CardHeader>
              <div>
                <CardTitle>Maior risco de atraso</CardTitle>
                <CardDescription>Combina prioridade, proximidade do vencimento, valor descoberto e custo do atraso.</CardDescription>
              </div>
              <Badge tone={plan.highestRisk.risk === "high" ? "danger" : plan.highestRisk.risk === "medium" ? "warning" : "success"}>
                risco {plan.highestRisk.risk === "high" ? "alto" : plan.highestRisk.risk === "medium" ? "médio" : "baixo (coberta)"}
              </Badge>
            </CardHeader>
            <CardContent>
              <p className="font-semibold">{plan.highestRisk.item.name}</p>
              <p className="text-sm text-muted">
                {f.money(plan.highestRisk.item.amount)} · vence {relativeDays(plan.highestRisk.daysUntilDue)} · custo de 30 dias de atraso: {f.money(plan.highestRisk.costOfDelay30)}
              </p>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Reserva para emergências</CardTitle>
              <CardDescription>Quanto manter disponível para imprevistos.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {emergency ? (
              <>
                <p className="tabular text-xl font-semibold">{f.money(emergency)}</p>
                <p className="text-sm text-muted">
                  {data.buffer > 0
                    ? "Sua reserva mínima configurada. O plano não usa esse valor para contas importantes ou opcionais."
                    : "Sugestão: 1 mês das suas despesas essenciais registradas. Configure sua reserva mínima em Configurações."}
                </p>
              </>
            ) : (
              <p className="text-sm text-muted">Defina sua reserva mínima em Configurações para que o plano a proteja.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {(plan.warnings.length > 0 || evaluation.warnings.length > 0) && (
        <div className="space-y-2">
          {[...new Set([...(simulating ? [] : plan.warnings), ...evaluation.warnings])].map((w) => (
            <p key={w} className="flex items-start gap-2 rounded-xl bg-warning-bg px-4 py-2.5 text-sm text-warning">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {w}
            </p>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <div>
            <CardTitle>{simulating ? "Sua simulação" : "Ordem recomendada de pagamento"}</CardTitle>
            <CardDescription>
              Critérios: prioridade (essencial → importante → opcional), atraso, vencimento, custo do atraso e valor. Uma conta opcional nunca passa à frente de uma
              essencial.
            </CardDescription>
          </div>
          <div className="flex shrink-0 gap-2">
            {simulating ? (
              <Button variant="ghost" size="sm" onClick={() => {
                setSimulating(false);
                setManual(Object.fromEntries(plan.order.map((o) => [o.item.id, centsToInput(o.allocated)])));
              }}>
                Voltar à recomendação
              </Button>
            ) : (
              <Button variant="secondary" size="sm" onClick={() => setSimulating(true)}>
                Simular outra distribuição
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <ol className="space-y-2">
            {plan.order.map((o) => (
              <li key={o.item.id} className="rounded-2xl border border-border p-3 sm:p-4">
                <div className="flex flex-wrap items-start gap-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-pink-50 text-sm font-bold text-pink-600">{o.rank}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{o.item.name}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                      <Badge tone={PRIORITY_TONE[o.item.priority]}>{PRIORITY_LABELS[o.item.priority]}</Badge>
                      <span>{o.overdue ? `atrasada ${relativeDays(o.daysUntilDue)}` : `vence ${relativeDays(o.daysUntilDue)} (${f.date(o.item.dueDate, "short")})`}</span>
                      <span>· total {f.money(o.item.amount)}</span>
                      {o.item.allowsPartial && o.item.minimum < o.item.amount && <span>· mínimo {f.money(o.item.minimum)}</span>}
                    </p>
                    {!simulating && <p className="mt-1.5 text-[13px] text-muted">{o.reason}</p>}
                  </div>
                  <div className="text-right">
                    {simulating ? (
                      <Input
                        aria-label={`Valor para ${o.item.name}`}
                        inputMode="decimal"
                        className="tabular h-9 w-32 text-right"
                        value={manual[o.item.id] ?? ""}
                        onChange={(e) => setManual((m) => ({ ...m, [o.item.id]: e.target.value }))}
                      />
                    ) : (
                      <>
                        <p className="text-[11px] uppercase tracking-wide text-muted">reservar</p>
                        <p className="tabular font-semibold">{f.money(o.allocated)}</p>
                        <Badge tone={o.payWhen === "now" ? "pink" : o.payWhen === "by_due" ? "success" : "danger"}>
                          {o.payWhen === "now" ? "Pagar primeiro" : o.payWhen === "by_due" ? "Pode pagar até o vencimento" : "Precisa de mais dinheiro"}
                        </Badge>
                      </>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ol>
          {plan.tieExplanations.length > 0 && !simulating && (
            <details className="mt-4 rounded-xl bg-surface-2/60 p-3 text-sm">
              <summary className="cursor-pointer font-medium">Como os empates foram decididos</summary>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
                {plan.tieExplanations.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </details>
          )}
          <div className="mt-5 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted">
              Distribuído: <strong className="tabular text-ink">{f.money(evaluation.allocated)}</strong> · sobra{" "}
              <strong className={cn("tabular", evaluation.leftover < 0 ? "text-danger" : "text-ink")}>{f.money(evaluation.leftover)}</strong>
            </p>
            <Button onClick={() => setRecording(true)} disabled={!toRecord.length}>
              Registrar estes pagamentos
            </Button>
          </div>
        </CardContent>
      </Card>

      <Modal open={recording} onOpenChange={setRecording} title="Registrar pagamentos do plano" description="Confirme somente os pagamentos que você já fez de verdade.">
        <div className="space-y-4">
          <ul className="divide-y divide-border rounded-xl border border-border px-3">
            {toRecord.map(([id, v]) => {
              const it = data.items.find((i) => i.id === id)!;
              return (
                <li key={id} className="flex justify-between py-2 text-sm">
                  <span>{it.name}</span>
                  <span className="tabular font-medium">{f.money(toOriginal(id, v), data.originals[id].currency)}</span>
                </li>
              );
            })}
          </ul>
          <Field label="Conta usada" htmlFor="plan-acc">
            <AccountSelect id="plan-acc" value={account} onChange={(e) => setAccount(e.target.value)} />
          </Field>
          <Field label="Data dos pagamentos" htmlFor="plan-date">
            <Input id="plan-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <p className="text-xs text-muted">A Isabelle Wallet não realiza pagamentos reais: isto apenas registra o que você pagou.</p>
          <div className="flex justify-end">
            <Button
              loading={pending}
              onClick={() =>
                run(
                  () =>
                    recordPlannedPayments({
                      date,
                      accountId: account,
                      items: toRecord.map(([id, v]) => ({ id, amount: centsToInput(toOriginal(id, v)) })),
                    }),
                  { onSuccess: () => setRecording(false) },
                )
              }
            >
              Confirmar registro
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
