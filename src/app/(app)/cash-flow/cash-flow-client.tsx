"use client";

import { ArrowDownLeft, ArrowUpRight, CalendarRange, FlaskConical, ShieldCheck, TrendingDown, Wallet } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { useFormat } from "@/components/app-context";
import { BalanceAreaChart } from "@/components/charts/charts";
import { MoneyInput } from "@/components/forms/fields";
import { InfoTip, TabPanel, Tabs } from "@/components/ui/overlays";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Input, StatCard } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import {
  aggregateTimeline,
  buildTimeline,
  lowestPoint,
  maxSpendKeepingFloor,
  nextIncomeEvent,
  safeToSpendUntil,
  type FlowEvent,
} from "@/lib/finance/cashflow";
import { addDays, endOfMonth, maxDate, startOfWeek } from "@/lib/finance/dates";
import { formatMonth } from "@/lib/format";

const TYPE_LABEL: Record<FlowEvent["type"], string> = {
  income: "Expected income",
  bill: "Bill",
  expense: "Pending expense",
  recurring: "Repeating expense",
  subscription: "Subscription",
  debt: "Debt",
  goal: "Saving for a goal",
  whatif: "What-if",
};

export function CashFlowClient({
  today,
  to,
  days,
  horizons,
  includeGoals,
  start,
  buffer,
  events,
  variableMonthly,
  missingFx,
  unconfirmedCount,
}: {
  today: string;
  to: string;
  days: number;
  horizons: number[];
  includeGoals: boolean;
  start: number;
  buffer: number;
  events: FlowEvent[];
  variableMonthly: number | null;
  missingFx: string[];
  unconfirmedCount: number;
}) {
  const f = useFormat();
  const [purchase, setPurchase] = React.useState("");
  const [purchaseDate, setPurchaseDate] = React.useState(today);
  const [payNow, setPayNow] = React.useState<string[]>([]);
  const [includeVariable, setIncludeVariable] = React.useState(false);

  const purchaseCents = Math.round(Number(purchase.replace(",", ".")) * 100) || 0;
  const scenario = React.useMemo(() => {
    let list = events.map((e) => (payNow.includes(e.id) ? { ...e, date: today, originalDate: e.originalDate ?? e.date } : e));
    if (purchaseCents > 0) list = [...list, { id: "whatif:purchase", date: purchaseDate < today ? today : purchaseDate, type: "whatif" as const, label: "Pretend purchase", amount: -purchaseCents }];
    if (includeVariable && variableMonthly) {
      const perDay = Math.round(variableMonthly / 30.44);
      for (let d = today; d <= to; d = addDays(d, 1)) list.push({ id: `var:${d}`, date: d, type: "whatif", label: "Everyday spending (average)", amount: -perDay });
    }
    return list.sort((a, b) => (a.date === b.date ? b.amount - a.amount : a.date < b.date ? -1 : 1));
  }, [events, payNow, purchaseCents, purchaseDate, includeVariable, variableMonthly, today, to]);

  const timeline = buildTimeline(start, scenario, today, to);
  const baseline = buildTimeline(start, events, today, to);
  const low = lowestPoint(timeline);
  const nextIncome = nextIncomeEvent(scenario, addDays(today, 0));
  const untilIncome = nextIncome ? maxDate(today, addDays(nextIncome.date, -1)) : to;
  const weekEnd = addDays(startOfWeek(today), 6);
  const safeNow = safeToSpendUntil(start, scenario, untilIncome, buffer);
  const safeWeek = safeToSpendUntil(start, scenario, maxDate(weekEnd, untilIncome), buffer);
  const floorSpend = maxSpendKeepingFloor(timeline, buffer);
  const monthEndBalance = timeline.find((d) => d.date === endOfMonth(today))?.balance ?? timeline[timeline.length - 1]?.balance ?? start;
  const monthLow = lowestPoint(timeline.filter((d) => d.date <= endOfMonth(today)));
  const beforeIncome = nextIncome ? timeline.find((d) => d.date === untilIncome)?.balance : null;
  const billsCoveredThisMonth = (monthLow?.balance ?? start) >= 0;

  const chart = timeline.map((d) => ({ label: f.date(d.date, "short"), balance: d.balance / 100 }));
  const weekly = aggregateTimeline(start, timeline, "week");
  const monthly = aggregateTimeline(start, timeline, "month");
  const payable = events.filter((e) => (e.type === "bill" || e.type === "expense") && e.amount < 0 && e.date > today);

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="flex rounded-full border border-border bg-surface p-1">
          {horizons.map((h) => (
            <Link
              key={h}
              href={`/cash-flow?days=${h}${includeGoals ? "" : "&goals=0"}`}
              className={cn("rounded-full px-3.5 py-1.5 text-sm font-medium", h === days ? "bg-pink-500 text-on-primary" : "text-muted hover:text-ink")}
            >
              {h} days
            </Link>
          ))}
        </div>
        <Link
          href={`/cash-flow?days=${days}${includeGoals ? "&goals=0" : ""}`}
          className={cn("rounded-full border px-3.5 py-1.5 text-sm", includeGoals ? "border-pink-300 bg-pink-50 text-pink-600" : "border-border text-muted")}
        >
          {includeGoals ? "✓ " : ""}Include money set aside for goals
        </Link>
      </div>

      {(missingFx.length > 0 || unconfirmedCount > 0) && (
        <div className="mb-4 space-y-2 text-sm">
          {missingFx.length > 0 && <p className="rounded-xl bg-warning-bg px-4 py-2 text-warning">No exchange rate for {missingFx.join(", ")}: some amounts are left out of this forecast.</p>}
          {unconfirmedCount > 0 && (
            <p className="rounded-xl bg-info-bg px-4 py-2 text-info">
              {unconfirmedCount} past payment(s) are waiting for you to confirm and are not in your balance yet. <Link href="/income" className="font-semibold underline">Confirm</Link>
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Real balance today" value={f.money(start)} icon={<Wallet />} tone="pink" sub="Starting point (money you actually have)" />
        <StatCard
          label="Safe to spend until your next income"
          value={f.money(safeNow.amount)}
          icon={<ShieldCheck />}
          tone={safeNow.amount > 0 ? "success" : "danger"}
          sub={nextIncome ? `Until ${f.date(untilIncome)} · ${nextIncome.label} on ${f.date(nextIncome.date)}` : "No income expected in this period"}
          info={<InfoTip>Real balance − everything due before your next income − safety cushion. Money that has not arrived yet is not counted.</InfoTip>}
        />
        <StatCard
          label="Safe to spend this week"
          value={f.money(safeWeek.amount)}
          icon={<CalendarRange />}
          sub={`Keeps bills covered until ${f.date(maxDate(weekEnd, untilIncome))}`}
        />
        <StatCard
          label="Lowest expected balance"
          value={low ? f.money(low.balance) : "—"}
          icon={<TrendingDown />}
          tone={low && low.balance < buffer ? "danger" : "neutral"}
          sub={low ? `On ${f.date(low.date)}${low.balance < 0 ? " — below zero!" : low.balance < buffer ? " — below your cushion" : ""}` : undefined}
        />
      </div>

      <Card className="mt-4">
        <CardHeader>
          <div>
            <CardTitle>Your balance, day by day</CardTitle>
            <CardDescription>
              Expected balance each day, with expected income and scheduled payments{payNow.length || purchaseCents || includeVariable ? " — including your what-if" : ""}.
            </CardDescription>
          </div>
          <Badge tone="info">Estimate</Badge>
        </CardHeader>
        <CardContent>
          <BalanceAreaChart data={chart} buffer={buffer / 100} />
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2">
              <FlaskConical className="size-4 text-pink-500" /> What if…?
            </CardTitle>
            <CardDescription>Try a decision before you make it. Nothing is saved.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <p className="text-sm font-semibold">If I buy something…</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Amount" htmlFor="wi-amount">
                <MoneyInput id="wi-amount" currency={f.base} value={purchase} onChange={(e) => setPurchase(e.target.value)} />
              </Field>
              <Field label="Date" htmlFor="wi-date">
                <Input id="wi-date" type="date" min={today} max={to} value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
              </Field>
            </div>
            {purchaseCents > 0 && (
              <p className={cn("rounded-xl px-3 py-2 text-sm", billsCoveredThisMonth && floorSpend >= 0 && (monthLow?.balance ?? 0) >= buffer ? "bg-success-bg text-success" : "bg-danger-bg text-danger")}>
                {(monthLow?.balance ?? 0) >= buffer
                  ? `Yes: even with this purchase, every bill this month is covered and you stay above your cushion (lowest ${f.money(monthLow?.balance ?? 0)}).`
                  : (monthLow?.balance ?? 0) >= 0
                    ? `Bills this month are covered, but your balance drops to ${f.money(monthLow?.balance ?? 0)}, below your safety cushion.`
                    : `No: with this purchase your balance goes below zero (${f.money(monthLow?.balance ?? 0)}) on ${f.date(monthLow?.date)}.`}
              </p>
            )}
            <label className="flex items-start gap-3 rounded-xl border border-border p-3 text-sm">
              <input type="checkbox" className="mt-0.5 size-4 accent-[var(--c-pink-500)]" checked={includeVariable} onChange={(e) => setIncludeVariable(e.target.checked)} disabled={!variableMonthly} />
              <span>
                Include my average everyday spending
                <span className="block text-xs text-muted">
                  {variableMonthly ? `≈ ${f.money(variableMonthly)}/month, spread across each day (average of past months).` : "Not enough history to estimate yet."}
                </span>
              </span>
            </label>
          </div>
          <div className="space-y-3">
            <p className="text-sm font-semibold">If I pay these bills today…</p>
            {payable.length ? (
              <ul className="scrollbar-thin max-h-60 space-y-1.5 overflow-y-auto pr-1">
                {payable.slice(0, 20).map((e) => (
                  <li key={e.id}>
                    <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-border px-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        className="size-4 accent-[var(--c-pink-500)]"
                        checked={payNow.includes(e.id)}
                        onChange={(ev) => setPayNow((p) => (ev.target.checked ? [...p, e.id] : p.filter((x) => x !== e.id)))}
                      />
                      <span className="min-w-0 flex-1 truncate">
                        {e.label} <span className="text-muted">· {f.date(e.date, "short")}</span>
                      </span>
                      <span className="tabular font-medium">{f.money(-e.amount)}</span>
                    </label>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">No upcoming bills in this period.</p>
            )}
            {payNow.length > 0 && (
              <p className="rounded-xl bg-surface-2 px-3 py-2 text-sm">
                {nextIncome
                  ? `Until your next income (${f.date(nextIncome.date)}) you would have ${f.money(beforeIncome ?? 0)} left.`
                  : `At the end of the period you would have ${f.money(timeline[timeline.length - 1]?.balance ?? 0)} left.`}{" "}
                Free to spend until then: {f.money(safeNow.amount)}.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardContent className="pt-5">
          <Tabs
            defaultValue="events"
            tabs={[
              { value: "events", label: "Daily" },
              { value: "weekly", label: "Weekly" },
              { value: "monthly", label: "Monthly" },
            ]}
          >
            <TabPanel value="events">
              {timeline.some((d) => d.events.length) ? (
                <ul className="divide-y divide-border">
                  {timeline
                    .filter((d) => d.events.length)
                    .map((d) => (
                      <li key={d.date} className="py-3">
                        <div className="mb-1.5 flex items-center justify-between text-sm">
                          <span className="font-semibold">{f.date(d.date, "long")}</span>
                          <span className={cn("tabular text-xs", d.balance < 0 ? "font-semibold text-danger" : "text-muted")}>expected balance {f.money(d.balance)}</span>
                        </div>
                        <ul className="space-y-1">
                          {d.events.map((e) => (
                            <li key={e.id} className="flex items-center gap-2 text-sm">
                              {e.amount >= 0 ? <ArrowDownLeft className="size-3.5 text-success" /> : <ArrowUpRight className="size-3.5 text-pink-500" />}
                              <span className="min-w-0 flex-1 truncate">
                                {e.label}
                                <span className="ml-1.5 text-xs text-muted">
                                  {TYPE_LABEL[e.type]}
                                  {e.originalDate ? ` · was due ${f.date(e.originalDate, "short")}` : ""}
                                </span>
                              </span>
                              <span className={cn("tabular font-medium", e.amount >= 0 ? "text-success" : "")}>{f.money(e.amount, undefined, { signed: true })}</span>
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                </ul>
              ) : (
                <p className="py-6 text-center text-sm text-muted">Nothing expected in this period. Add your income, bills and subscriptions to see the forecast.</p>
              )}
            </TabPanel>
            <TabPanel value="weekly">
              <FlowTable rows={weekly.map((w) => ({ ...w, label: `${f.date(w.from, "short")} – ${f.date(w.to, "short")}` }))} />
            </TabPanel>
            <TabPanel value="monthly">
              <FlowTable rows={monthly.map((m) => ({ ...m, label: formatMonth(m.key, f.locale, "long") }))} />
            </TabPanel>
          </Tabs>
          <p className="mt-4 text-xs text-muted">
            Assumptions: repeating income arrives on its expected dates; overdue bills and late pending expenses are counted as due today; repeating expenses repeat
            their last amount; debt payments follow your plan. Without a what-if, the expected final balance is {f.money(baseline[baseline.length - 1]?.balance ?? start)}; at the end of this month,{" "}
            {f.money(monthEndBalance)}.
          </p>
        </CardContent>
      </Card>
    </>
  );
}

function FlowTable({ rows }: { rows: Array<{ key: string; label: string; opening: number; inflow: number; outflow: number; closing: number }> }) {
  const f = useFormat();
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="text-left text-xs text-muted">
            <th className="pb-2 font-medium">Period</th>
            <th className="pb-2 text-right font-medium">Start</th>
            <th className="pb-2 text-right font-medium">Money in</th>
            <th className="pb-2 text-right font-medium">Money out</th>
            <th className="pb-2 text-right font-medium">End</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={r.key}>
              <td className="py-2 first-letter:uppercase">{r.label}</td>
              <td className="tabular py-2 text-right text-muted">{f.money(r.opening)}</td>
              <td className="tabular py-2 text-right text-success">{f.money(r.inflow)}</td>
              <td className="tabular py-2 text-right">{f.money(r.outflow)}</td>
              <td className={cn("tabular py-2 text-right font-semibold", r.closing < 0 && "text-danger")}>{f.money(r.closing)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
