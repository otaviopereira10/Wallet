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
  initial: { label: "Starting balance", tone: "neutral" },
  increment: { label: "Semester charge", tone: "plum" },
  interest: { label: "Interest", tone: "danger" },
  payment: { label: "Payment", tone: "success" },
  adjustment: { label: "Correction", tone: "info" },
};

const STRATEGY_TEXT: Record<StrategyKey, string> = {
  conservative: "Smaller payment, keeps more money free.",
  balanced: "A balance between paying the debt and your own expenses.",
  aggressive: "Pays the debt off fastest, while protecting essentials and your safety cushion.",
};

export function DebtClient({ data, debts }: { data: DebtPageData | null; debts: Array<{ id: string; name: string }> }) {
  const [creating, setCreating] = React.useState(false);
  if (!data)
    return (
      <>
        <EmptyState
          icon={<GraduationCap />}
          title="Add your student loan"
          description="Enter what you owe today, the next semester charge date and the charge amount (5,500 by default — you can change it)."
          action={
            <Button onClick={() => setCreating(true)}>
              <Plus /> Add debt
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
    { key: "s0", name: "No payments", amount: 0, color: SERIES.debt, dashed: true },
    { key: "s1", name: `Small (${money(st[0]?.monthlyPayment || 10000)}/mo)`, amount: st[0]?.monthlyPayment || 10000, color: SERIES.gold },
    { key: "s2", name: `Medium (${money(st[1]?.monthlyPayment || 30000)}/mo)`, amount: st[1]?.monthlyPayment || 30000, color: SERIES.netWorth },
    { key: "s3", name: `Fast (${money(st[2]?.monthlyPayment || 50000)}/mo)`, amount: st[2]?.monthlyPayment || 50000, color: SERIES.income },
  ].map((x) => ({ ...x, r: sim(x.amount) }));
  const chartData = Array.from({ length: 61 }, (_, i) => {
    const point: Record<string, number | string> = { label: formatMonth(addMonths(data.baseParams.today, i).slice(0, 7), f.locale) };
    for (const c of chartScenarios) point[c.key] = balanceAfterMonths(c.r, i) / 100;
    return point;
  });
  const horizons = [
    { m: 6, label: "6 months" },
    { m: 12, label: "1 year" },
    { m: 24, label: "2 years" },
    { m: 36, label: "3 years" },
    { m: 60, label: "5 years" },
  ];

  const resultText = (r: DebtSimResult) =>
    r.paidOff && r.payoffDate ? `${f.date(r.payoffDate)} (${monthsToText(r.monthsToPayoff)})` : r.incrementsOngoing ? "Never, while the semester charges continue" : "More than 50 years";

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
          <Wallet /> Record a payment
        </Button>
        <Button variant="outline" onClick={() => setAddingEvent(true)}>
          <CalendarPlus /> Add a charge or correction
        </Button>
        <Button variant="ghost" onClick={() => setEditing(true)}>
          <Pencil /> Debt settings
        </Button>
        <ActionMenu
          items={[
            { label: "Add another debt", icon: <Plus />, onSelect: () => setCreating(true) },
            { label: "Delete this debt", icon: <Trash2 />, danger: true, onSelect: () => setDeleting(true) },
          ]}
        />
      </div>

      {data.insufficient && (
        <div className="mb-4 flex items-start gap-3 rounded-2xl border border-danger/30 bg-danger-bg px-4 py-3 text-sm text-danger">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" />
          <p>
            <strong>Your planned payment ({money(data.plannedMonthlyPayment)}/month) does not keep up with the semester charges.</strong> With{" "}
            {money(data.incrementAmount)} added every {data.incrementIntervalMonths} months{Number(data.interestRate) > 0 ? " plus interest" : ""}, the debt only stops
            growing at {money(data.breakEven)} per month or more
            {data.incrementsEndDate ? ` — until the last charge (${f.date(data.incrementsEndDate)}) it will keep going up.` : "."}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-3">
        <StatCard label="You owe" value={money(data.balance)} icon={<GraduationCap />} tone="plum" sub={data.name} />
        <StatCard
          label="Next semester charge"
          value={data.nextIncrement ? `+${money(data.incrementAmount)}` : "—"}
          icon={<TrendingUp />}
          tone="danger"
          sub={data.nextIncrement ? `${f.date(data.nextIncrement)} (${relativeDays(data.daysToIncrement ?? 0)})` : "No more charges set up"}
        />
        <StatCard
          label="Minimum to stop it growing"
          value={`${money(data.breakEven)}/month`}
          icon={<ArrowDownRight />}
          tone="warning"
          info={<InfoTip>The semester charge divided by the months between charges, plus one month of interest on today's balance (if there is interest).</InfoTip>}
        />
        <StatCard label="Paid so far" value={money(data.paidTotal)} tone="success" />
        <StatCard label="Semester charges so far" value={money(data.incrementsTotal)} sub={`${money(data.incrementAmount)} every ${data.incrementIntervalMonths} months`} />
        <StatCard label="Interest so far" value={money(data.interestTotal)} sub={Number(data.interestRate) > 0 ? `${data.interestRate}% per year` : "No interest set up"} />
      </div>

      <Card className="mt-4">
        <CardHeader>
          <div>
            <CardTitle>Your current plan</CardTitle>
            <CardDescription>
              Paying {money(data.plannedMonthlyPayment)} on day {data.paymentDay} of each month.{" "}
              {data.incrementsEndDate ? `Semester charges until ${f.date(data.incrementsEndDate)}.` : "No end date for the semester charges."}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-4">
          <Metric label="Paid off by" value={data.plannedMonthlyPayment ? resultText(planned) : "Set a monthly amount"} />
          <Metric label="Total you will pay" value={planned.paidOff ? money(planned.totalPaid) : "—"} />
          <Metric label="New charges until then" value={planned.paidOff ? `${planned.incrementsCount} (${money(planned.incrementsTotal)})` : "—"} />
          <Metric
            label={data.targetPayoffDate ? `To pay off by ${f.date(data.targetPayoffDate)}` : "Target date"}
            value={data.targetPayoffDate ? (data.targetRequired !== null ? `${money(data.targetRequired)}/month` : "Not possible with the charges") : "Not set"}
          />
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <div>
            <CardTitle>Payoff simulator</CardTitle>
            <CardDescription>Each option follows the real date of every semester charge and any interest you set up.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted">Try your own amount:</span>
            <Input className="tabular h-9 w-36" inputMode="decimal" placeholder="e.g. 750" value={custom} onChange={(e) => setCustom(e.target.value)} aria-label="Custom monthly payment" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="pb-2 font-medium">Per month</th>
                  <th className="pb-2 font-medium">Paid off by</th>
                  <th className="pb-2 text-right font-medium">Total paid</th>
                  <th className="pb-2 text-right font-medium">New charges</th>
                  <th className="pb-2 text-right font-medium">Toward the loan</th>
                  <th className="pb-2 text-right font-medium">Interest</th>
                  <th className="pb-2 text-right font-medium">vs. your plan</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {scenarios.map(({ amount, r, isPlan, isCustom }) => {
                  const diff = planned.paidOff && r.paidOff && planned.monthsToPayoff !== null && r.monthsToPayoff !== null ? planned.monthsToPayoff - r.monthsToPayoff : null;
                  return (
                    <tr key={amount} className={cn(isPlan && "bg-pink-50/50")}>
                      <td className="tabular py-2.5 font-semibold">
                        {money(amount)} {isPlan && <Badge tone="pink">your plan</Badge>} {isCustom && <Badge>custom</Badge>}
                        {!r.coversIncrements && r.incrementsOngoing && (
                          <span className="block text-[11px] font-normal text-danger">does not keep up with charges</span>
                        )}
                      </td>
                      <td className="py-2.5">{resultText(r)}</td>
                      <td className="tabular py-2.5 text-right">{r.paidOff ? money(r.totalPaid) : "—"}</td>
                      <td className="tabular py-2.5 text-right">{r.paidOff ? r.incrementsCount : "∞"}</td>
                      <td className="tabular py-2.5 text-right">{r.paidOff ? money(r.principalPaid) : "—"}</td>
                      <td className="tabular py-2.5 text-right">{r.paidOff ? money(r.interestPaid) : "—"}</td>
                      <td className="py-2.5 text-right text-xs">
                        {isPlan ? "—" : diff === null ? "—" : diff > 0 ? <span className="text-success">{monthsToText(diff)} sooner</span> : diff < 0 ? <span className="text-warning">{monthsToText(-diff)} later</span> : "same"}
                      </td>
                      <td className="py-2.5 text-right">
                        {!isPlan && (
                          <Button size="sm" variant="ghost" loading={pending} onClick={() => run(() => setPlannedPayment({ id: data.id, amount: centsToInput(amount) }))}>
                            Use this
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
              <Sparkles className="size-4 text-pink-500" /> Options that fit your budget
            </CardTitle>
            <CardDescription>
              Based on what you have left each month{data.capacity.surplus !== null ? ` (${f.money(data.capacity.surplus)} before debt and goals)` : ""} and your emergency fund.
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
                      {rec && <Badge tone="pink">Recommended</Badge>}
                    </div>
                    <p className="mt-1 text-xs text-muted">{STRATEGY_TEXT[s.key]}</p>
                    <p className="tabular mt-3 text-xl font-semibold">{money(s.monthlyPayment)}/month</p>
                    <p className="text-xs text-muted">{Math.round(s.share * 100)}% of what is left each month</p>
                    <p className="mt-2 text-sm">{resultText(r)}</p>
                    {r.paidOff && <p className="text-xs text-muted">Total: {money(r.totalPaid)}</p>}
                    <Button
                      size="sm"
                      variant={rec ? "primary" : "outline"}
                      className="mt-3 w-full"
                      disabled={s.monthlyPayment === data.plannedMonthlyPayment}
                      onClick={() => run(() => setPlannedPayment({ id: data.id, amount: centsToInput(s.monthlyPayment) }))}
                    >
                      {s.monthlyPayment === data.plannedMonthlyPayment ? "Your current plan" : "Use as my plan"}
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
              <summary className="cursor-pointer font-medium text-ink">Assumptions and missing data</summary>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {data.capacity.assumptions.map((x) => (
                  <li key={x}>{x}</li>
                ))}
                {data.capacity.missing.map((x) => (
                  <li key={x}>Missing: {x}</li>
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
              <CardTitle>How the debt changes over time</CardTitle>
              <CardDescription>Next 5 years. Each step up is a semester charge.</CardDescription>
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
              <CardTitle>Long-term outlook</CardTitle>
              <CardDescription>What you would still owe at the end of each period.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="pb-2 font-medium">After</th>
                  {chartScenarios.map((c) => (
                    <th key={c.key} className="pb-2 text-right font-medium">
                      {c.amount ? `${money(c.amount)}/mo` : "No payments"}
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
            <p className="mt-3 text-xs text-muted">An estimate, not a guarantee: it uses the charge amount, schedule and interest as set up today.</p>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <div>
            <CardTitle>Debt history</CardTitle>
            <CardDescription>Every charge, payment, interest and correction, with the balance after each one.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="pb-2 font-medium">Date</th>
                <th className="pb-2 font-medium">What happened</th>
                <th className="pb-2 text-right font-medium">Before</th>
                <th className="pb-2 text-right font-medium">Amount</th>
                <th className="pb-2 text-right font-medium">After</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {[...data.history].reverse().map((h, i) => (
                <tr key={h.id ?? `initial-${i}`} className={cn(h.voided && "opacity-50")}>
                  <td className="py-2.5">{f.date(h.date)}</td>
                  <td className="py-2.5">
                    <Badge tone={TYPE_LABEL[h.type].tone}>{TYPE_LABEL[h.type].label}</Badge>
                    {h.automatic && <span className="ml-1.5 text-[11px] text-muted">automatic</span>}
                    {h.voided && <span className="ml-1.5 text-[11px] text-danger">cancelled</span>}
                    {h.note && h.type !== "initial" && !h.automatic && <span className="block text-xs text-muted">{h.note}</span>}
                  </td>
                  <td className="tabular py-2.5 text-right text-muted">{h.type === "initial" ? "—" : money(h.balanceBefore)}</td>
                  <td className={cn("tabular py-2.5 text-right font-medium", h.type === "payment" ? "text-success" : h.type === "initial" ? "" : "text-danger")}>
                    {h.type === "initial" ? money(h.delta) : `${h.delta > 0 ? "+" : "−"}${money(Math.abs(h.delta))}`}
                  </td>
                  <td className="tabular py-2.5 text-right font-semibold">{money(h.balanceAfter)}</td>
                  <td className="py-2.5 text-right">
                    {h.id && (
                      <Button variant="ghost" size="icon-sm" aria-label={h.voided ? "Restore" : "Remove"} onClick={() => setRemoving(h)}>
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

      <Modal open={paying} onOpenChange={setPaying} title="Debt payment">
        <DebtPaymentForm debts={[{ id: data.id, name: data.name, currency: data.currency }]} debtId={data.id} onDone={() => setPaying(false)} />
      </Modal>
      <Modal open={addingEvent} onOpenChange={setAddingEvent} title="Add a charge or correction" description="Scheduled semester charges are added automatically; use this for a different amount or to fix something.">
        <DebtEventForm debtId={data.id} currency={data.currency} onDone={() => setAddingEvent(false)} />
      </Modal>
      <Modal open={editing} onOpenChange={setEditing} title="Debt settings" size="lg">
        <DebtForm initial={data.initial} onDone={() => setEditing(false)} />
      </Modal>
      <Modal open={creating} onOpenChange={setCreating} title="New debt" size="lg">
        <DebtForm onDone={() => setCreating(false)} />
      </Modal>
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete “${data.name}”?`}
        description="The debt history will be deleted. Recorded payments stay as money out of your accounts."
        onConfirm={() => run(() => deleteDebt({ id: data.id }))}
      />
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        tone={removing?.voided ? "primary" : "danger"}
        confirmLabel={removing?.voided ? "Restore" : removing?.automatic ? "Cancel it" : "Remove"}
        title={removing?.voided ? "Restore this entry?" : "Remove this entry?"}
        description={
          removing?.automatic
            ? "Automatic entries are cancelled (they stay in the history) so they are not added again."
            : removing?.transactionId
              ? "The payment will also be removed from your money out."
              : "The debt balance will be recalculated."
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
