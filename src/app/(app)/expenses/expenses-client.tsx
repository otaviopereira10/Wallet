"use client";

import { CalendarPlus, CheckCircle2, Copy, Pencil, Receipt, Repeat, RotateCcw, Search, SlidersHorizontal, Trash2, TrendingUp } from "lucide-react";
import * as React from "react";
import { useApp, useFormat, useServerAction } from "@/components/app-context";
import { CATEGORY_COLORS, DonutChart, IncomeExpenseChart } from "@/components/charts/charts";
import { AccountSelect } from "@/components/forms/fields";
import { ExpenseForm, RefundForm, type ExpenseInitial } from "@/components/forms/transaction-forms";
import { Button } from "@/components/ui/button";
import { ActionMenu, ConfirmDialog, Modal, TabPanel, Tabs } from "@/components/ui/overlays";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, Field, Input, Select } from "@/components/ui/primitives";
import { categoryLabel, EXPENSE_CATEGORIES, FREQUENCY_LABELS, PAYMENT_METHOD_LABELS, TX_KIND_LABELS } from "@/lib/constants";
import type { Currency } from "@/lib/finance/types";
import { addNextOccurrence, deleteTransaction, markExpensePaid } from "@/server/actions/transactions";
import type { TxRow } from "@/server/view";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

interface SeriesView {
  seriesId: string;
  id: string;
  description: string;
  amount: number;
  currency: Currency;
  recurrence: string;
  category: string | null;
  lastDate: string;
  nextDate: string | null;
  monthly: number;
}

export function ExpensesClient({
  rows,
  initialQuery,
  evolution,
  thisMonth,
  prevMonth,
  comparisonMtd,
  unusual,
  series,
  monthsWithData,
}: {
  rows: TxRow[];
  initialQuery: string;
  evolution: Array<{ label: string; income: number; expenses: number; debt: number }>;
  thisMonth: Record<string, number>;
  prevMonth: Record<string, number>;
  comparisonMtd: Array<{ category: string; current: number; previous: number; delta: number; pct: number | null }>;
  unusual: Array<{ category: string; current: number; average: number }>;
  series: SeriesView[];
  monthsWithData: number;
}) {
  const f = useFormat();
  const app = useApp();
  const { run, pending } = useServerAction();
  const [query, setQuery] = React.useState(initialQuery);
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [min, setMin] = React.useState("");
  const [max, setMax] = React.useState("");
  const [showFilters, setShowFilters] = React.useState(false);
  const [limit, setLimit] = React.useState(60);
  const [editing, setEditing] = React.useState<ExpenseInitial | null>(null);
  const [refunding, setRefunding] = React.useState<TxRow | null>(null);
  const [deleting, setDeleting] = React.useState<TxRow | null>(null);
  const [paying, setPaying] = React.useState<TxRow | null>(null);
  const [payAccount, setPayAccount] = React.useState(app.accounts.find((a) => !a.archived)?.id ?? "");
  const [payDate, setPayDate] = React.useState(app.today);

  const filtered = rows.filter((r) => {
    if (query && !norm(`${r.description} ${r.notes ?? ""} ${categoryLabel(r.category)} ${r.accountName ?? ""}`).includes(norm(query))) return false;
    if (from && r.date < from) return false;
    if (to && r.date > to) return false;
    if (category && r.category !== category) return false;
    if (status === "overdue" ? !r.overdue : status && r.status !== status) return false;
    const v = r.baseAmount / 100;
    if (min && v < Number(min.replace(",", "."))) return false;
    if (max && v > Number(max.replace(",", "."))) return false;
    return true;
  });
  const total = filtered.reduce((s, r) => s + (r.kind === "refund" ? -r.baseAmount : r.baseAmount), 0);
  const activeFilters = [from, to, category, status, min, max].filter(Boolean).length;

  const donut = Object.entries(thisMonth)
    .filter(([, v]) => v > 0)
    .sort((x, y) => y[1] - x[1]);
  const monthTotal = donut.reduce((s, [, v]) => s + v, 0);
  const allCats = [...new Set([...Object.keys(thisMonth), ...Object.keys(prevMonth)])]
    .map((c) => ({ c, now: thisMonth[c] ?? 0, prev: prevMonth[c] ?? 0 }))
    .filter((x) => x.now || x.prev)
    .sort((x, y) => y.now - x.now);

  return (
    <>
      <Tabs
        defaultValue="history"
        tabs={[
          { value: "history", label: "History", count: rows.length },
          { value: "analysis", label: "Insights" },
          { value: "recurring", label: "Repeating", count: series.length },
        ]}
      >
        <TabPanel value="history">
          <Card>
            <CardContent className="pt-5">
              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
                  <Input className="pl-10" placeholder="Search expenses…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search expenses" />
                </div>
                <Button variant="outline" onClick={() => setShowFilters((s) => !s)} aria-expanded={showFilters}>
                  <SlidersHorizontal /> Filters {activeFilters > 0 && <Badge tone="pink">{activeFilters}</Badge>}
                </Button>
              </div>
              {showFilters && (
                <div className="fade-in mt-4 grid grid-cols-2 gap-3 lg:grid-cols-6">
                  <Field label="From" htmlFor="f-from">
                    <Input id="f-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                  </Field>
                  <Field label="To" htmlFor="f-to">
                    <Input id="f-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                  </Field>
                  <Field label="Category" htmlFor="f-cat">
                    <Select id="f-cat" value={category} onChange={(e) => setCategory(e.target.value)}>
                      <option value="">All</option>
                      {EXPENSE_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {categoryLabel(c)}
                        </option>
                      ))}
                      <option value="debt">University debt</option>
                    </Select>
                  </Field>
                  <Field label="Status" htmlFor="f-status">
                    <Select id="f-status" value={status} onChange={(e) => setStatus(e.target.value)}>
                      <option value="">All</option>
                      <option value="paid">Paid</option>
                      <option value="pending">Pending</option>
                      <option value="overdue">Overdue</option>
                    </Select>
                  </Field>
                  <Field label={`Min amount (${f.base})`} htmlFor="f-min">
                    <Input id="f-min" inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value)} />
                  </Field>
                  <Field label={`Max amount (${f.base})`} htmlFor="f-max">
                    <Input id="f-max" inputMode="decimal" value={max} onChange={(e) => setMax(e.target.value)} />
                  </Field>
                  {activeFilters > 0 && (
                    <Button
                      variant="link"
                      className="col-span-2 justify-start lg:col-span-6"
                      onClick={() => {
                        setFrom("");
                        setTo("");
                        setCategory("");
                        setStatus("");
                        setMin("");
                        setMax("");
                      }}
                    >
                      Clear filters
                    </Button>
                  )}
                </div>
              )}
              <p className="mt-4 text-xs text-muted">
                {filtered.length} result(s) · net total {f.money(total)}
              </p>
            </CardContent>
          </Card>

          {!rows.length ? (
            <EmptyState
              className="mt-4"
              icon={<Receipt />}
              title="No expenses yet"
              description="Use “New expense” to record purchases, bills and everyday spending."
            />
          ) : (
            <Card className="mt-4 overflow-hidden">
              <ul className="divide-y divide-border">
                {filtered.slice(0, limit).map((r) => (
                  <li key={r.id} className="flex items-center gap-3 px-4 py-3 sm:px-6">
                    <div className="hidden w-20 shrink-0 text-xs text-muted sm:block">{f.date(r.date, "medium")}</div>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 truncate text-sm font-semibold text-ink">
                        {r.description}
                        {r.recurrence !== "none" && <Repeat className="size-3.5 shrink-0 text-pink-500" aria-label="Repeats" />}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                        <span className="sm:hidden">{f.date(r.date, "short")} ·</span>
                        <span>{categoryLabel(r.category)}</span>
                        {r.accountName && <span>· {r.accountName}</span>}
                        {r.paymentMethod && <span>· {PAYMENT_METHOD_LABELS[r.paymentMethod]}</span>}
                        {r.kind !== "expense" && <Badge tone={r.kind === "refund" ? "success" : "plum"}>{TX_KIND_LABELS[r.kind]}</Badge>}
                        {r.source === "bill" && <Badge tone="info">Bill payment</Badge>}
                        {r.source === "subscription" && <Badge tone="info">Subscription</Badge>}
                        {r.overdue ? <Badge tone="danger">Overdue</Badge> : r.status === "pending" && <Badge tone="warning">Pending</Badge>}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`tabular text-sm font-semibold ${r.kind === "refund" ? "text-success" : "text-ink"}`}>
                        {r.kind === "refund" ? "+" : "−"}
                        {f.money(r.amount, r.currency)}
                      </p>
                      {r.currency !== f.base && <p className="tabular text-[11px] text-muted">≈ {f.money(r.baseAmount)}</p>}
                    </div>
                    <ActionMenu
                      items={[
                        r.status === "pending" && { label: "Mark as paid", icon: <CheckCircle2 />, onSelect: () => setPaying(r) },
                        r.kind === "expense" &&
                          r.source === "manual" && {
                            label: "Edit",
                            icon: <Pencil />,
                            onSelect: () =>
                              setEditing({
                                id: r.id,
                                description: r.description,
                                amount: r.amountInput,
                                currency: r.currency,
                                category: r.category ?? "other",
                                date: r.date,
                                paymentMethod: r.paymentMethod,
                                accountId: r.accountId,
                                status: r.status,
                                recurrence: r.recurrence,
                                notes: r.notes,
                              }),
                          },
                        r.kind === "expense" && r.recurrence !== "none" && {
                          label: "Add the next one",
                          icon: <CalendarPlus />,
                          onSelect: () => run(() => addNextOccurrence({ id: r.id })),
                        },
                        r.kind === "expense" &&
                          r.status === "paid" && { label: "Add a refund", icon: <RotateCcw />, onSelect: () => setRefunding(r) },
                        r.kind === "expense" && {
                          label: "Duplicate",
                          icon: <Copy />,
                          onSelect: () =>
                            setEditing({
                              description: r.description,
                              amount: r.amountInput,
                              currency: r.currency,
                              category: r.category ?? "other",
                              date: app.today,
                              paymentMethod: r.paymentMethod,
                              accountId: r.accountId,
                              status: "paid",
                              recurrence: "none",
                              notes: r.notes,
                            }),
                        },
                        { label: "Delete", icon: <Trash2 />, danger: true, onSelect: () => setDeleting(r) },
                      ]}
                    />
                  </li>
                ))}
              </ul>
              {filtered.length > limit && (
                <div className="border-t border-border p-3 text-center">
                  <Button variant="ghost" onClick={() => setLimit((l) => l + 100)}>
                    Show more ({filtered.length - limit} left)
                  </Button>
                </div>
              )}
            </Card>
          )}
        </TabPanel>

        <TabPanel value="analysis">
          {unusual.length > 0 && (
            <Card className="mb-4 border-warning/40">
              <CardHeader>
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="size-4 text-warning" /> Unusual increases
                  </CardTitle>
                  <CardDescription>Categories above 150% of their average over the last {monthsWithData} full month(s).</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {unusual.map((u) => (
                  <p key={u.category} className="text-sm">
                    <strong>{categoryLabel(u.category)}</strong>: {f.money(u.current)} this month, average {f.money(u.average)} (
                    {Math.round((u.current / u.average) * 100)}%)
                  </p>
                ))}
              </CardContent>
            </Card>
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Where it went this month</CardTitle>
                  <CardDescription>Biggest categories (paid and pending).</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                {donut.length ? (
                  <>
                    <DonutChart data={donut.map(([k, v]) => ({ name: categoryLabel(k), value: v / 100 }))} centerLabel="This month" centerValue={f.money(monthTotal)} />
                    <ul className="mt-4 space-y-1.5">
                      {donut.slice(0, 6).map(([k, v], i) => (
                        <li key={k} className="flex items-center justify-between text-sm">
                          <span className="flex items-center gap-2">
                            <span className="size-2.5 rounded-full" style={{ background: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }} />
                            {i + 1}. {categoryLabel(k)}
                          </span>
                          <span className="tabular font-medium">{f.money(v)}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className="py-10 text-center text-sm text-muted">No expenses this month.</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Month by month</CardTitle>
                  <CardDescription>Expenses (minus refunds) and debt payments.</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <IncomeExpenseChart data={evolution} hideIncome />
              </CardContent>
            </Card>
          </div>
          <Card className="mt-4">
            <CardHeader>
              <div>
                <CardTitle>Compare months</CardTitle>
                <CardDescription>This month so far vs. all of last month, and vs. last month up to the same day.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {allCats.length ? (
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted">
                      <th className="pb-2 font-medium">Category</th>
                      <th className="pb-2 text-right font-medium">This month</th>
                      <th className="pb-2 text-right font-medium">Last month</th>
                      <th className="pb-2 text-right font-medium">Same days last month</th>
                      <th className="pb-2 text-right font-medium">Change</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {allCats.map((x) => {
                      const mtd = comparisonMtd.find((c) => c.category === x.c);
                      return (
                        <tr key={x.c}>
                          <td className="py-2">{categoryLabel(x.c)}</td>
                          <td className="tabular py-2 text-right font-medium">{f.money(x.now)}</td>
                          <td className="tabular py-2 text-right text-muted">{f.money(x.prev)}</td>
                          <td className="tabular py-2 text-right text-muted">{mtd ? f.money(mtd.previous) : "—"}</td>
                          <td className="py-2 text-right">
                            {mtd?.pct !== null && mtd?.pct !== undefined ? (
                              <Badge tone={mtd.pct > 15 ? "danger" : mtd.pct < -15 ? "success" : "neutral"}>
                                {mtd.pct > 0 ? "+" : ""}
                                {Math.round(mtd.pct)}%
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <p className="text-sm text-muted">There is not enough data from two months to compare yet.</p>
              )}
            </CardContent>
          </Card>
        </TabPanel>

        <TabPanel value="recurring">
          {series.length ? (
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Repeating expenses</CardTitle>
                  <CardDescription>
                    Estimated monthly total: {f.money(series.reduce((s, x) => s + x.monthly, 0))}. The next one is included in your Cash Flow forecast.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <ul className="divide-y divide-border">
                  {series.map((x) => (
                    <li key={x.seriesId} className="flex flex-wrap items-center gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-ink">{x.description}</p>
                        <p className="text-xs text-muted">
                          {FREQUENCY_LABELS[x.recurrence]} · {categoryLabel(x.category)} · last on {f.date(x.lastDate)} · next {f.date(x.nextDate)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="tabular font-semibold">{f.money(x.amount, x.currency)}</p>
                        <p className="tabular text-xs text-muted">≈ {f.money(x.monthly)}/month</p>
                      </div>
                      <Button size="sm" variant="secondary" loading={pending} onClick={() => run(() => addNextOccurrence({ id: x.id }))}>
                        <CalendarPlus /> Add the next one
                      </Button>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : (
            <EmptyState
              icon={<Repeat />}
              title="No repeating expenses"
              description="Choose how often an expense repeats when you add it (e.g. monthly rent) and it will be included in your forecasts. Subscriptions have their own page."
            />
          )}
        </TabPanel>
      </Tabs>

      <Modal open={!!editing} onOpenChange={(o) => !o && setEditing(null)} title={editing?.id ? "Edit expense" : "New expense"}>
        {editing && <ExpenseForm initial={editing} onDone={() => setEditing(null)} />}
      </Modal>
      <Modal open={!!refunding} onOpenChange={(o) => !o && setRefunding(null)} title="Add a refund" description={refunding ? `For “${refunding.description}”` : undefined}>
        {refunding && <RefundForm refundOf={refunding.id} initialCategory={refunding.category ?? undefined} onDone={() => setRefunding(null)} />}
      </Modal>
      <Modal open={!!paying} onOpenChange={(o) => !o && setPaying(null)} title="Mark as paid" description={paying?.description}>
        {paying && (
          <div className="space-y-4">
            <Field label="Paid from" htmlFor="pay-acc">
              <AccountSelect id="pay-acc" value={payAccount} onChange={(e) => setPayAccount(e.target.value)} />
            </Field>
            <Field label="Payment date" htmlFor="pay-date">
              <Input id="pay-date" type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
            </Field>
            <div className="flex justify-end">
              <Button
                loading={pending}
                onClick={() => run(() => markExpensePaid({ id: paying.id, accountId: payAccount, date: payDate }), { onSuccess: () => setPaying(null) })}
              >
                Confirm payment
              </Button>
            </div>
          </div>
        )}
      </Modal>
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete this entry?"
        description={
          deleting?.source === "bill"
            ? "This is a bill payment: the bill will show as unpaid again."
            : deleting?.source === "debt"
              ? "This payment will also be removed from the debt history."
              : "This cannot be undone."
        }
        onConfirm={() => (deleting ? run(() => deleteTransaction({ id: deleting.id })) : undefined)}
      />
    </>
  );
}
