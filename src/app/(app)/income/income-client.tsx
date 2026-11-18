"use client";

import { ArrowDownLeft, CalendarCheck, CheckCircle2, Pause, Pencil, Play, Plus, Search, Trash2, XCircle } from "lucide-react";
import * as React from "react";
import { useFormat, useServerAction } from "@/components/app-context";
import { IncomeSourceForm, ReceiveIncomeForm, type IncomeSourceInitial } from "@/components/forms/entity-forms";
import { IncomeTxForm, type IncomeTxInitial } from "@/components/forms/transaction-forms";
import { Button } from "@/components/ui/button";
import { ActionMenu, ConfirmDialog, InfoTip, Modal, TabPanel, Tabs } from "@/components/ui/overlays";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, Input, StatCard } from "@/components/ui/primitives";
import { categoryLabel } from "@/lib/constants";
import type { Currency } from "@/lib/finance/types";
import { deleteIncome, setIncomeActive, skipIncomeOccurrence } from "@/server/actions/incomes";
import { deleteTransaction } from "@/server/actions/transactions";
import type { TxRow } from "@/server/view";

interface SourceView extends Omit<IncomeSourceInitial, "amount"> {
  id: string;
  name: string;
  amount: number;
  amountInput: string;
  currency: Currency;
  categoryLabel: string;
  frequencyLabel: string;
  startDate: string;
  active: boolean;
  next: string | null;
  monthly: number;
  received: number;
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function IncomeClient({
  sources,
  pendingConfirm,
  projection,
  upcoming,
  receipts,
  initialQuery,
  monthIncome,
  monthlyExpected,
}: {
  sources: SourceView[];
  pendingConfirm: Array<{ incomeId: string; name: string; date: string; amount: number; amountInput: string; currency: Currency; accountId: string | null }>;
  projection: Array<{ month: string; label: string; inflow: number; outflow: number; net: number; balance: number }>;
  upcoming: Array<{ id: string; label: string; date: string; amount: number }>;
  receipts: TxRow[];
  initialQuery: string;
  monthIncome: number;
  monthlyExpected: number | null;
}) {
  const f = useFormat();
  const { run } = useServerAction();
  const [creating, setCreating] = React.useState(false);
  const [oneOff, setOneOff] = React.useState(false);
  const [editing, setEditing] = React.useState<IncomeSourceInitial | null>(null);
  const [editingTx, setEditingTx] = React.useState<IncomeTxInitial | null>(null);
  const [receiving, setReceiving] = React.useState<(typeof pendingConfirm)[number] | null>(null);
  const [deleting, setDeleting] = React.useState<SourceView | null>(null);
  const [deletingTx, setDeletingTx] = React.useState<TxRow | null>(null);
  const [query, setQuery] = React.useState(initialQuery);
  const filtered = receipts.filter((r) => !query || norm(`${r.description} ${categoryLabel(r.category)}`).includes(norm(query)));

  return (
    <>
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatCard label="Received this month" value={f.money(monthIncome)} tone="success" icon={<ArrowDownLeft />} />
        <StatCard
          label="Regular monthly income"
          value={monthlyExpected === null ? "—" : f.money(monthlyExpected)}
          sub="Monthly average of your repeating income"
          info={<InfoTip>Weekly × 52/12, every 2 weeks × 26/12, every 6 months ÷ 6, yearly ÷ 12. One-time income is not included.</InfoTip>}
        />
        <div className="flex flex-col justify-center gap-2 rounded-2xl border border-dashed border-border-strong p-4">
          <Button onClick={() => setCreating(true)}>
            <Plus /> New income source
          </Button>
          <Button variant="outline" onClick={() => setOneOff(true)}>
            <CheckCircle2 /> Record money received
          </Button>
        </div>
      </div>

      {pendingConfirm.length > 0 && (
        <Card className="mb-6 border-info/40">
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <CalendarCheck className="size-4 text-info" /> Waiting for you to confirm
              </CardTitle>
              <CardDescription>Expected payments whose date has passed. They only count in your balance after you confirm them.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {pendingConfirm.map((p) => (
                <li key={`${p.incomeId}-${p.date}`} className="flex flex-wrap items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{p.name}</p>
                    <p className="text-xs text-muted">Expected on {f.date(p.date)}</p>
                  </div>
                  <span className="tabular font-semibold">{f.money(p.amount, p.currency)}</span>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => setReceiving(p)}>
                      I got it
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => run(() => skipIncomeOccurrence({ incomeId: p.incomeId, occurrence: p.date }))}>
                      Did not arrive
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Tabs
        defaultValue="sources"
        tabs={[
          { value: "sources", label: "Income sources", count: sources.length },
          { value: "projection", label: "Next 6 months" },
          { value: "history", label: "Received", count: receipts.length },
        ]}
      >
        <TabPanel value="sources">
          {!sources.length ? (
            <EmptyState
              icon={<ArrowDownLeft />}
              title="No income sources yet"
              description="Add your scholarship, salary, side work or family support — and how often it arrives."
              action={
                <Button onClick={() => setCreating(true)}>
                  <Plus /> Add income
                </Button>
              }
            />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {sources.map((s) => (
                <Card key={s.id} className={`p-5 ${s.active ? "" : "opacity-60"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{s.name}</p>
                      <p className="mt-0.5 flex flex-wrap gap-1.5 text-xs text-muted">
                        <Badge tone="success">{s.categoryLabel}</Badge>
                        <Badge>{s.frequencyLabel}</Badge>
                        {!s.active && <Badge tone="warning">Paused</Badge>}
                      </p>
                    </div>
                    <ActionMenu
                      items={[
                        { label: "Edit", icon: <Pencil />, onSelect: () => setEditing({ ...s, amount: s.amountInput }) },
                        {
                          label: s.active ? "Pause" : "Resume",
                          icon: s.active ? <Pause /> : <Play />,
                          onSelect: () => run(() => setIncomeActive({ id: s.id, active: !s.active })),
                        },
                        { label: "Delete", icon: <Trash2 />, danger: true, onSelect: () => setDeleting(s) },
                      ]}
                    />
                  </div>
                  <p className="tabular mt-3 text-xl font-semibold">{f.money(s.amount, s.currency)}</p>
                  <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-muted">
                    <span>{s.next ? `Next: ${f.date(s.next)}` : "No upcoming payments"}</span>
                    {s.monthly > 0 && <span>≈ {f.money(s.monthly)}/month</span>}
                    <span>{s.received} payment(s) received</span>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabPanel>

        <TabPanel value="projection">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Expected money in the next months</CardTitle>
                <CardDescription>
                  Starts from what you have today, adds expected repeating income, and subtracts bills, subscriptions, repeating expenses and planned
                  payments. Everyday spending is not included.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted">
                    <th className="pb-2 font-medium">Month</th>
                    <th className="pb-2 text-right font-medium">Expected in</th>
                    <th className="pb-2 text-right font-medium">Scheduled out</th>
                    <th className="pb-2 text-right font-medium">Difference</th>
                    <th className="pb-2 text-right font-medium">Expected balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {projection.map((p) => (
                    <tr key={p.month}>
                      <td className="py-2.5 first-letter:uppercase">{p.label}</td>
                      <td className="tabular py-2.5 text-right text-success">{f.money(p.inflow)}</td>
                      <td className="tabular py-2.5 text-right">{f.money(p.outflow)}</td>
                      <td className={`tabular py-2.5 text-right font-medium ${p.net < 0 ? "text-danger" : ""}`}>{f.money(p.net, undefined, { signed: true })}</td>
                      <td className={`tabular py-2.5 text-right font-semibold ${p.balance < 0 ? "text-danger" : ""}`}>{f.money(p.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-3 text-xs text-muted">An estimate, not a guarantee: it depends on your income arriving on time.</p>
            </CardContent>
          </Card>
          {upcoming.length > 0 && (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle>Upcoming expected payments</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="divide-y divide-border">
                  {upcoming.map((u) => (
                    <li key={u.id} className="flex justify-between py-2 text-sm">
                      <span>
                        {f.date(u.date)} · {u.label}
                      </span>
                      <span className="tabular font-medium text-success">{f.money(u.amount)}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </TabPanel>

        <TabPanel value="history">
          <div className="relative mb-4">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <Input className="pl-10" placeholder="Search received money…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search received money" />
          </div>
          {filtered.length ? (
            <Card className="overflow-hidden">
              <ul className="divide-y divide-border">
                {filtered.slice(0, 200).map((r) => (
                  <li key={r.id} className="flex items-center gap-3 px-4 py-3 sm:px-6">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{r.description}</p>
                      <p className="text-xs text-muted">
                        {f.date(r.date)} · {categoryLabel(r.category)} · {r.accountName}
                      </p>
                    </div>
                    <span className="tabular text-sm font-semibold text-success">+{f.money(r.amount, r.currency)}</span>
                    <ActionMenu
                      items={[
                        r.source !== "income" && {
                          label: "Edit",
                          icon: <Pencil />,
                          onSelect: () =>
                            setEditingTx({ id: r.id, description: r.description, amount: r.amountInput, currency: r.currency, category: r.category ?? "other_income", date: r.date, accountId: r.accountId, notes: r.notes }),
                        },
                        { label: r.source === "income" ? "Undo confirmation" : "Delete", icon: r.source === "income" ? <XCircle /> : <Trash2 />, danger: true, onSelect: () => setDeletingTx(r) },
                      ]}
                    />
                  </li>
                ))}
              </ul>
            </Card>
          ) : (
            <p className="text-sm text-muted">Nothing received yet.</p>
          )}
        </TabPanel>
      </Tabs>

      <Modal open={creating} onOpenChange={setCreating} title="New income source">
        <IncomeSourceForm onDone={() => setCreating(false)} />
      </Modal>
      <Modal open={oneOff} onOpenChange={setOneOff} title="Record money received">
        <IncomeTxForm onDone={() => setOneOff(false)} />
      </Modal>
      <Modal open={!!editing} onOpenChange={(o) => !o && setEditing(null)} title="Edit income source">
        {editing && <IncomeSourceForm initial={editing} onDone={() => setEditing(null)} />}
      </Modal>
      <Modal open={!!editingTx} onOpenChange={(o) => !o && setEditingTx(null)} title="Edit received money">
        {editingTx && <IncomeTxForm initial={editingTx} onDone={() => setEditingTx(null)} />}
      </Modal>
      <Modal open={!!receiving} onOpenChange={(o) => !o && setReceiving(null)} title={`Confirm: ${receiving?.name ?? ""}`} description={receiving ? `Expected on ${f.date(receiving.date)}` : undefined}>
        {receiving && (
          <ReceiveIncomeForm
            incomeId={receiving.incomeId}
            occurrence={receiving.date}
            amount={receiving.amountInput}
            currency={receiving.currency}
            accountId={receiving.accountId}
            onDone={() => setReceiving(null)}
          />
        )}
      </Modal>
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete “${deleting?.name}”?`}
        description="This income source stops appearing in forecasts. Payments you already confirmed stay in your history and balance."
        onConfirm={() => (deleting ? run(() => deleteIncome({ id: deleting.id })) : undefined)}
      />
      <ConfirmDialog
        open={!!deletingTx}
        onOpenChange={(o) => !o && setDeletingTx(null)}
        title={deletingTx?.source === "income" ? "Undo this confirmation?" : "Delete this entry?"}
        description="The amount will be removed from the account balance."
        onConfirm={() => (deletingTx ? run(() => deleteTransaction({ id: deletingTx.id })) : undefined)}
      />
    </>
  );
}
