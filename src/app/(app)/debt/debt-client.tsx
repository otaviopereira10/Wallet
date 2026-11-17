"use client";

import { AlertTriangle, ArrowDownRight, CalendarPlus, GraduationCap, Pencil, Plus, RotateCcw, Sparkles, Trash2, TrendingUp, Wallet } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { useFormat, useServerAction } from "@/components/app-context";
import { MultiLineChart, SERIES } from "@/components/charts/charts";
import { DebtEventForm, DebtForm, DebtPaymentForm, type DebtInitial } from "@/components/forms/entity-forms";
import { Button } from "@/components/ui/button";
import { ActionMenu, ConfirmDialog, InfoTip, Modal } from "@/components/ui/overlays";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, Input, StatCard } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { addMonths } from "@/lib/finance/dates";
import { balanceAfterMonths, simulateDebt, type DebtHistoryRow, type DebtSimParams, type DebtSimResult, type StrategyKey } from "@/lib/finance/debt";
import type { Currency } from "@/lib/finance/types";
import { centsToInput, formatMonth, monthsToText, relativeDays } from "@/lib/format";
import { deleteDebt, removeDebtEvent, setPlannedPayment } from "@/server/actions/debts";

export interface DebtPageData {
  id: string;
  name: string;
  currency: Currency;
  balance: number;
  nextIncrement: string | null;
  daysToIncrement: number | null;
  incrementAmount: number;
  incrementIntervalMonths: number;
  incrementsEndDate: string | null;
  interestRate: string;
  plannedMonthlyPayment: number;
  paymentDay: number;
  targetPayoffDate: string | null;
  paidTotal: number;
  incrementsTotal: number;
  interestTotal: number;
  breakEven: number;
  insufficient: boolean;
  targetRequired: number | null;
  baseParams: Omit<DebtSimParams, "monthlyPayment">;
  history: DebtHistoryRow[];
  strategies: {
    recommended: StrategyKey | null;
    reasons: string[];
    list: Array<{ key: StrategyKey; label: string; share: number; monthlyPayment: number }>;
  };
  capacity: { surplus: number | null; assumptions: string[]; missing: string[]; emergencyMonths: number | null };
  initial: DebtInitial;
}

const TYPE_LABEL: Record<string, { label: string; tone: "plum" | "danger" | "success" | "info" | "neutral" }> = {
  initial: { label: "Saldo inicial", tone: "neutral" },
  increment: { label: "Acréscimo semestral", tone: "plum" },
  interest: { label: "Juros", tone: "danger" },
  payment: { label: "Pagamento", tone: "success" },
  adjustment: { label: "Ajuste", tone: "info" },
};

const STRATEGY_TEXT: Record<StrategyKey, string> = {
  conservative: "Pagamento menor, preservando mais dinheiro disponível.",
  balanced: "Equilíbrio entre quitar a dívida e as despesas pessoais.",
  aggressive: "Prioriza a quitação, mantendo necessidades essenciais e reserva protegidas.",
};

export function DebtClient({ data, debts }: { data: DebtPageData | null; debts: Array<{ id: string; name: string }> }) {
  const [creating, setCreating] = React.useState(false);
  if (!data)
    return (
      <>
        <EmptyState
          icon={<GraduationCap />}
          title="Cadastre o empréstimo da faculdade"
          description="Informe o saldo atual, a próxima data de acréscimo e o valor do acréscimo semestral (5.500 por padrão, configurável)."
          action={
            <Button onClick={() => setCreating(true)}>
              <Plus /> Cadastrar dívida
            </Button>
          }
        />
        <Modal open={creating} onOpenChange={setCreating} title="University Debt Manager" size="lg">
          <DebtForm onDone={() => setCreating(false)} />
        </Modal>
      </>
    );
  return <DebtView data={data} debts={debts} />;
}

function DebtView({ data, debts }: { data: DebtPageData; debts: Array<{ id: string; name: string }> }) {
  const f = useFormat();
  const money = (c: number | null | undefined) => f.money(c, data.currency);
  const { run, pending } = useServerAction();
  const [paying, setPaying] = React.useState(false);
  const [addingEvent, setAddingEvent] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [custom, setCustom] = React.useState("");
  const [removing, setRemoving] = React.useState<DebtHistoryRow | null>(null);

  const sim = React.useCallback((cents: number) => simulateDebt({ ...data.baseParams, monthlyPayment: cents }), [data.baseParams]);
  const planned = React.useMemo(() => sim(data.plannedMonthlyPayment), [sim, data.plannedMonthlyPayment]);
  const customCents = Math.round(Number(custom.replace(",", ".")) * 100) || 0;

  const fixed = [10000, 20000, 30000, 50000];
  const scenarioAmounts = [...new Set([...(data.plannedMonthlyPayment ? [data.plannedMonthlyPayment] : []), ...fixed, ...(customCents > 0 ? [customCents] : [])])].sort((x, y) => x - y);
  const scenarios = scenarioAmounts.map((amount) => ({ amount, r: sim(amount), isPlan: amount === data.plannedMonthlyPayment, isCustom: amount === customCents && !fixed.includes(amount) }));

  // Comparison chart: none / small / intermediate / aggressive.
  const st = data.strategies.list;
  const chartScenarios = [
    { key: "s0", name: "Sem pagamentos", amount: 0, color: SERIES.debt, dashed: true },
    { key: "s1", name: `Pequeno (${money(st[0]?.monthlyPayment || 10000)}/mês)`, amount: st[0]?.monthlyPayment || 10000, color: SERIES.gold },
    { key: "s2", name: `Intermediário (${money(st[1]?.monthlyPayment || 30000)}/mês)`, amount: st[1]?.monthlyPayment || 30000, color: SERIES.netWorth },
    { key: "s3", name: `Agressivo (${money(st[2]?.monthlyPayment || 50000)}/mês)`, amount: st[2]?.monthlyPayment || 50000, color: SERIES.income },
  ].map((x) => ({ ...x, r: sim(x.amount) }));
  const chartData = Array.from({ length: 61 }, (_, i) => {
    const point: Record<string, number | string> = { label: formatMonth(addMonths(data.baseParams.today, i).slice(0, 7), f.locale) };
    for (const c of chartScenarios) point[c.key] = balanceAfterMonths(c.r, i) / 100;
    return point;
  });
  const horizons = [
    { m: 6, label: "6 meses" },
    { m: 12, label: "1 ano" },
    { m: 24, label: "2 anos" },
    { m: 36, label: "3 anos" },
    { m: 60, label: "5 anos" },
  ];

  const resultText = (r: DebtSimResult) =>
    r.paidOff && r.payoffDate ? `${f.date(r.payoffDate)} (${monthsToText(r.monthsToPayoff)})` : r.incrementsOngoing ? "Não quita enquanto os acréscimos continuarem" : "Mais de 50 anos";

  return (
    <>
      {debts.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {debts.map((d) => (
            <Link key={d.id} href={`/debt?id=${d.id}`} className={cn("rounded-full border px-3 py-1 text-sm", d.id === data.id ? "border-pink-300 bg-pink-50 text-pink-600" : "border-border")}>
              {d.name}
            </Link>
          ))}
        </div>
      )}
      <div className="mb-4 flex flex-wrap gap-2">
        <Button onClick={() => setPaying(true)}>
          <Wallet /> Registrar pagamento
        </Button>
        <Button variant="outline" onClick={() => setAddingEvent(true)}>
          <CalendarPlus /> Acréscimo ou ajuste manual
        </Button>
        <Button variant="ghost" onClick={() => setEditing(true)}>
          <Pencil /> Configurar dívida
        </Button>
        <ActionMenu
          items={[
            { label: "Cadastrar outra dívida", icon: <Plus />, onSelect: () => setCreating(true) },
            { label: "Excluir esta dívida", icon: <Trash2 />, danger: true, onSelect: () => setDeleting(true) },
          ]}
        />
      </div>

      {data.insufficient && (
        <div className="mb-4 flex items-start gap-3 rounded-2xl border border-danger/30 bg-danger-bg px-4 py-3 text-sm text-danger">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" />
          <p>
            <strong>O valor mensal planejado ({money(data.plannedMonthlyPayment)}) não compensa os novos acréscimos.</strong> Com acréscimos de{" "}
            {money(data.incrementAmount)} a cada {data.incrementIntervalMonths} meses{Number(data.interestRate) > 0 ? " e os juros" : ""}, a dívida só para de
            crescer com pelo menos {money(data.breakEven)} por mês
            {data.incrementsEndDate ? ` — até o último acréscimo (${f.date(data.incrementsEndDate)}) ela continuará aumentando.` : "."}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Saldo atual da dívida" value={money(data.balance)} icon={<GraduationCap />} tone="plum" sub={data.name} />
        <StatCard
          label="Próximo acréscimo"
          value={data.nextIncrement ? `+${money(data.incrementAmount)}` : "—"}
          icon={<TrendingUp />}
          tone="danger"
          sub={data.nextIncrement ? `${f.date(data.nextIncrement)} (${relativeDays(data.daysToIncrement ?? 0)})` : "Nenhum acréscimo futuro configurado"}
        />
        <StatCard
          label="Mínimo para não crescer"
          value={`${money(data.breakEven)}/mês`}
          icon={<ArrowDownRight />}
          tone="warning"
          info={<InfoTip>Acréscimo dividido pelos meses do período + 1 mês de juros sobre o saldo atual (se houver juros).</InfoTip>}
        />
        <StatCard label="Total já pago" value={money(data.paidTotal)} tone="success" />
        <StatCard label="Acréscimos lançados" value={money(data.incrementsTotal)} sub={`${money(data.incrementAmount)} a cada ${data.incrementIntervalMonths} meses`} />
        <StatCard label="Juros lançados" value={money(data.interestTotal)} sub={Number(data.interestRate) > 0 ? `${data.interestRate}% ao ano` : "Sem juros configurados"} />
      </div>

      <Card className="mt-4">
        <CardHeader>
          <div>
            <CardTitle>Seu plano atual</CardTitle>
            <CardDescription>
              Pagando {money(data.plannedMonthlyPayment)} todo dia {data.paymentDay}.{" "}
              {data.incrementsEndDate ? `Acréscimos até ${f.date(data.incrementsEndDate)}.` : "Sem data de término dos acréscimos."}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-4">
          <Metric label="Quitação estimada" value={data.plannedMonthlyPayment ? resultText(planned) : "Defina um valor mensal"} />
          <Metric label="Total a pagar" value={planned.paidOff ? money(planned.totalPaid) : "—"} />
          <Metric label="Novos acréscimos até lá" value={planned.paidOff ? `${planned.incrementsCount} (${money(planned.incrementsTotal)})` : "—"} />
          <Metric
            label={data.targetPayoffDate ? `Para quitar até ${f.date(data.targetPayoffDate)}` : "Prazo desejado"}
            value={data.targetPayoffDate ? (data.targetRequired !== null ? `${money(data.targetRequired)}/mês` : "Inviável com os acréscimos") : "Não definido"}
          />
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <div>
            <CardTitle>Simulador de quitação</CardTitle>
            <CardDescription>Cada cenário respeita a data real de cada acréscimo semestral e os juros configurados.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted">Valor personalizado:</span>
            <Input className="tabular h-9 w-36" inputMode="decimal" placeholder="ex.: 750" value={custom} onChange={(e) => setCustom(e.target.value)} aria-label="Pagamento mensal personalizado" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="pb-2 font-medium">Pagamento/mês</th>
                  <th className="pb-2 font-medium">Quitação</th>
                  <th className="pb-2 text-right font-medium">Total pago</th>
                  <th className="pb-2 text-right font-medium">Acréscimos</th>
                  <th className="pb-2 text-right font-medium">Principal</th>
                  <th className="pb-2 text-right font-medium">Juros</th>
                  <th className="pb-2 text-right font-medium">vs. plano atual</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {scenarios.map(({ amount, r, isPlan, isCustom }) => {
                  const diff = planned.paidOff && r.paidOff && planned.monthsToPayoff !== null && r.monthsToPayoff !== null ? planned.monthsToPayoff - r.monthsToPayoff : null;
                  return (
                    <tr key={amount} className={cn(isPlan && "bg-pink-50/50")}>
                      <td className="tabular py-2.5 font-semibold">
                        {money(amount)} {isPlan && <Badge tone="pink">plano</Badge>} {isCustom && <Badge>personalizado</Badge>}
                        {!r.coversIncrements && r.incrementsOngoing && (
                          <span className="block text-[11px] font-normal text-danger">não cobre os acréscimos</span>
                        )}
                      </td>
                      <td className="py-2.5">{resultText(r)}</td>
                      <td className="tabular py-2.5 text-right">{r.paidOff ? money(r.totalPaid) : "—"}</td>
                      <td className="tabular py-2.5 text-right">{r.paidOff ? r.incrementsCount : "∞"}</td>
                      <td className="tabular py-2.5 text-right">{r.paidOff ? money(r.principalPaid) : "—"}</td>
                      <td className="tabular py-2.5 text-right">{r.paidOff ? money(r.interestPaid) : "—"}</td>
                      <td className="py-2.5 text-right text-xs">
                        {isPlan ? "—" : diff === null ? "—" : diff > 0 ? <span className="text-success">{monthsToText(diff)} antes</span> : diff < 0 ? <span className="text-warning">{monthsToText(-diff)} depois</span> : "igual"}
                      </td>
                      <td className="py-2.5 text-right">
                        {!isPlan && (
                          <Button size="sm" variant="ghost" loading={pending} onClick={() => run(() => setPlannedPayment({ id: data.id, amount: centsToInput(amount) }))}>
                            Usar
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="size-4 text-pink-500" /> Estratégias para a sua realidade
            </CardTitle>
            <CardDescription>
              Baseadas na sua sobra mensal estimada{data.capacity.surplus !== null ? ` (${f.money(data.capacity.surplus)} antes de dívida e metas)` : ""} e na sua reserva.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {data.strategies.list.length ? (
            <div className="grid gap-3 md:grid-cols-3">
              {data.strategies.list.map((s) => {
                const r = sim(s.monthlyPayment);
                const rec = s.key === data.strategies.recommended;
                return (
                  <div key={s.key} className={cn("rounded-2xl border p-4", rec ? "border-pink-300 bg-pink-50/60" : "border-border")}>
                    <div className="flex items-center justify-between">
                      <p className="font-semibold">{s.label}</p>
                      {rec && <Badge tone="pink">Recomendada</Badge>}
                    </div>
                    <p className="mt-1 text-xs text-muted">{STRATEGY_TEXT[s.key]}</p>
                    <p className="tabular mt-3 text-xl font-semibold">{money(s.monthlyPayment)}/mês</p>
                    <p className="text-xs text-muted">{Math.round(s.share * 100)}% da sobra mensal</p>
                    <p className="mt-2 text-sm">{resultText(r)}</p>
                    {r.paidOff && <p className="text-xs text-muted">Total: {money(r.totalPaid)}</p>}
                    <Button
                      size="sm"
                      variant={rec ? "primary" : "outline"}
                      className="mt-3 w-full"
                      disabled={s.monthlyPayment === data.plannedMonthlyPayment}
                      onClick={() => run(() => setPlannedPayment({ id: data.id, amount: centsToInput(s.monthlyPayment) }))}
                    >
                      {s.monthlyPayment === data.plannedMonthlyPayment ? "Plano atual" : "Adotar como plano"}
                    </Button>
                  </div>
                );
              })}
            </div>
          ) : null}
          <ul className="mt-4 space-y-1.5 text-sm text-muted">
            {data.strategies.reasons.map((r) => (
              <li key={r}>• {r}</li>
            ))}
          </ul>
          {(data.capacity.assumptions.length > 0 || data.capacity.missing.length > 0) && (
            <details className="mt-3 rounded-xl bg-surface-2/60 p-3 text-xs text-muted">
              <summary className="cursor-pointer font-medium text-ink">Premissas e dados faltando</summary>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {data.capacity.assumptions.map((x) => (
                  <li key={x}>{x}</li>
                ))}
                {data.capacity.missing.map((x) => (
                  <li key={x}>Falta: {x}</li>
                ))}
              </ul>
            </details>
          )}
        </CardContent>
      </Card>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Evolução da dívida por cenário</CardTitle>
              <CardDescription>Próximos 5 anos. Os degraus mostram cada acréscimo semestral.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <MultiLineChart
              data={chartData}
              currency={data.currency}
              series={chartScenarios.map((c) => ({ key: c.key, name: c.name, color: c.color, dashed: c.dashed }))}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Projeção de longo prazo</CardTitle>
              <CardDescription>Saldo devedor ao fim de cada período.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="pb-2 font-medium">Período</th>
                  {chartScenarios.map((c) => (
                    <th key={c.key} className="pb-2 text-right font-medium">
                      {c.amount ? `${money(c.amount)}/mês` : "Sem pagar"}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {horizons.map((h) => (
                  <tr key={h.m}>
                    <td className="py-2">{h.label}</td>
                    {chartScenarios.map((c) => (
                      <td key={c.key} className="tabular py-2 text-right">
                        {money(balanceAfterMonths(c.r, h.m))}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-muted">Projeção, não garantia: considera o acréscimo, a periodicidade e os juros configurados hoje.</p>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <div>
            <CardTitle>Histórico da dívida</CardTitle>
            <CardDescription>Cada acréscimo, pagamento, juro e ajuste, com o saldo após a movimentação.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="pb-2 font-medium">Data</th>
                <th className="pb-2 font-medium">Movimentação</th>
                <th className="pb-2 text-right font-medium">Saldo anterior</th>
                <th className="pb-2 text-right font-medium">Valor</th>
                <th className="pb-2 text-right font-medium">Saldo após</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {[...data.history].reverse().map((h, i) => (
                <tr key={h.id ?? `initial-${i}`} className={cn(h.voided && "opacity-50")}>
                  <td className="py-2.5">{f.date(h.date)}</td>
                  <td className="py-2.5">
                    <Badge tone={TYPE_LABEL[h.type].tone}>{TYPE_LABEL[h.type].label}</Badge>
                    {h.automatic && <span className="ml-1.5 text-[11px] text-muted">automático</span>}
                    {h.voided && <span className="ml-1.5 text-[11px] text-danger">anulado</span>}
                    {h.note && h.type !== "initial" && !h.automatic && <span className="block text-xs text-muted">{h.note}</span>}
                  </td>
                  <td className="tabular py-2.5 text-right text-muted">{h.type === "initial" ? "—" : money(h.balanceBefore)}</td>
                  <td className={cn("tabular py-2.5 text-right font-medium", h.type === "payment" ? "text-success" : h.type === "initial" ? "" : "text-danger")}>
                    {h.type === "initial" ? money(h.delta) : `${h.delta > 0 ? "+" : "−"}${money(Math.abs(h.delta))}`}
                  </td>
                  <td className="tabular py-2.5 text-right font-semibold">{money(h.balanceAfter)}</td>
                  <td className="py-2.5 text-right">
                    {h.id && (
                      <Button variant="ghost" size="icon-sm" aria-label={h.voided ? "Restaurar" : "Remover"} onClick={() => setRemoving(h)}>
                        {h.voided ? <RotateCcw /> : <Trash2 />}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Modal open={paying} onOpenChange={setPaying} title="Pagamento da dívida">
        <DebtPaymentForm debts={[{ id: data.id, name: data.name, currency: data.currency }]} debtId={data.id} onDone={() => setPaying(false)} />
      </Modal>
      <Modal open={addingEvent} onOpenChange={setAddingEvent} title="Acréscimo ou ajuste manual" description="Os acréscimos programados são lançados automaticamente; use isto para valores diferentes ou correções.">
        <DebtEventForm debtId={data.id} currency={data.currency} onDone={() => setAddingEvent(false)} />
      </Modal>
      <Modal open={editing} onOpenChange={setEditing} title="Configuração da dívida" size="lg">
        <DebtForm initial={data.initial} onDone={() => setEditing(false)} />
      </Modal>
      <Modal open={creating} onOpenChange={setCreating} title="Nova dívida" size="lg">
        <DebtForm onDone={() => setCreating(false)} />
      </Modal>
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Excluir “${data.name}”?`}
        description="O histórico da dívida será apagado. Os pagamentos registrados continuam como saídas de dinheiro nas suas contas."
        onConfirm={() => run(() => deleteDebt({ id: data.id }))}
      />
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        tone={removing?.voided ? "primary" : "danger"}
        confirmLabel={removing?.voided ? "Restaurar" : removing?.automatic ? "Anular" : "Remover"}
        title={removing?.voided ? "Restaurar lançamento?" : "Remover lançamento?"}
        description={
          removing?.automatic
            ? "Lançamentos automáticos são anulados (não somem do histórico) para não serem recriados."
            : removing?.transactionId
              ? "O pagamento também será removido das suas saídas de dinheiro."
              : "O saldo da dívida será recalculado."
        }
        onConfirm={() => (removing?.id ? run(() => removeDebtEvent({ id: removing.id!, restore: removing.voided })) : undefined)}
      />
    </>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-surface-2/60 p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-sm font-semibold text-ink">{value}</p>
    </div>
  );
}
