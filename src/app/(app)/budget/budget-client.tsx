"use client";

import { ChevronLeft, ChevronRight, Lightbulb, Pencil, PieChart, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { useFormat, useServerAction } from "@/components/app-context";
import { BudgetForm } from "@/components/forms/entity-forms";
import { Button } from "@/components/ui/button";
import { ActionMenu, ConfirmDialog, InfoTip, Modal } from "@/components/ui/overlays";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, ProgressBar, StatCard } from "@/components/ui/primitives";
import { categoryLabel } from "@/lib/constants";
import { deleteBudget } from "@/server/actions/goals";

type State = "ok" | "warning" | "over";
interface Line {
  category: string;
  limit: number;
  limitInput: string;
  spent: number;
  remaining: number;
  percent: number;
  state: State;
  projected: number;
  projectedState: State;
  dailyAllowance: number;
  topExpenses: Array<{ id: string; description: string; date: string; amount: number }>;
}

const STATE_UI: Record<State, { label: string; tone: "success" | "warning" | "danger"; bar: "success" | "warning" | "danger" }> = {
  ok: { label: "On track", tone: "success", bar: "success" },
  warning: { label: "Close to the limit", tone: "warning", bar: "warning" },
  over: { label: "Over the limit", tone: "danger", bar: "danger" },
};

export function BudgetClient({
  monthKey,
  monthLabel,
  prevKey,
  nextKey,
  isCurrent,
  summary,
}: {
  monthKey: string;
  monthLabel: string;
  prevKey: string;
  nextKey: string | null;
  isCurrent: boolean;
  summary: {
    lines: Line[];
    totalLimit: number;
    totalSpent: number;
    totalRemaining: number;
    percent: number;
    totalProjected: number;
    daysElapsed: number;
    daysInMonth: number;
    unbudgeted: Array<{ category: string; spent: number }>;
    recommendations: string[];
  };
}) {
  const f = useFormat();
  const { run } = useServerAction();
  const [editing, setEditing] = React.useState<{ category?: string; amount?: string; lock?: boolean } | null>(null);
  const [deleting, setDeleting] = React.useState<string | null>(null);

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-full border border-border bg-surface p-1">
          <Button asChild variant="ghost" size="icon-sm" aria-label="Previous month">
            <Link href={`/budget?month=${prevKey}`}>
              <ChevronLeft />
            </Link>
          </Button>
          <span className="inline-block min-w-36 text-center text-sm font-semibold first-letter:uppercase">{monthLabel}</span>
          {nextKey ? (
            <Button asChild variant="ghost" size="icon-sm" aria-label="Next month">
              <Link href={`/budget?month=${nextKey}`}>
                <ChevronRight />
              </Link>
            </Button>
          ) : (
            <span className="size-8" />
          )}
        </div>
        <Button onClick={() => setEditing({})}>
          <Plus /> Set a limit
        </Button>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total budget" value={f.money(summary.totalLimit)} tone="pink" icon={<PieChart />} />
        <StatCard label="Spent" value={f.money(summary.totalSpent)} sub={`${summary.percent}% used`} />
        <StatCard label="Left" value={f.money(summary.totalRemaining)} tone={summary.totalRemaining < 0 ? "danger" : "success"} />
        <StatCard
          label="Expected by month end"
          value={isCurrent ? f.money(summary.totalProjected) : "—"}
          tone={isCurrent && summary.totalProjected > summary.totalLimit ? "danger" : "neutral"}
          sub={isCurrent ? `Day ${summary.daysElapsed} of ${summary.daysInMonth}` : "Month is over"}
          info={<InfoTip>What you spent so far + your daily pace of everyday spending × the days left. Bills and repeating expenses are not multiplied.</InfoTip>}
        />
      </div>

      {summary.recommendations.length > 0 && (
        <Card className="mb-4 border-warning/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lightbulb className="size-4 text-warning" /> Tips
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-2">
            {summary.recommendations.map((r) => (
              <p key={r} className="text-sm text-ink">
                • {r}
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      {!summary.lines.length ? (
        <EmptyState
          icon={<PieChart />}
          title="No limits yet"
          description="Decide how much you want to spend each month per category — for example Food, Transportation, Entertainment."
          action={
            <Button onClick={() => setEditing({})}>
              <Plus /> Set your first limit
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {summary.lines.map((l) => {
            const ui = STATE_UI[l.state];
            return (
              <Card key={l.category} className="p-5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{categoryLabel(l.category)}</p>
                    <Badge tone={ui.tone} className="mt-1">
                      {ui.label}
                    </Badge>
                  </div>
                  <ActionMenu
                    items={[
                      { label: "Edit limit", icon: <Pencil />, onSelect: () => setEditing({ category: l.category, amount: l.limitInput, lock: true }) },
                      { label: "Remove limit", icon: <Trash2 />, danger: true, onSelect: () => setDeleting(l.category) },
                    ]}
                  />
                </div>
                <div className="mt-4 flex items-baseline justify-between gap-2">
                  <p className="tabular text-xl font-semibold">{f.money(l.spent)}</p>
                  <p className="tabular text-sm text-muted">of {f.money(l.limit)}</p>
                </div>
                <ProgressBar className="mt-2" value={l.percent} tone={ui.bar} label={`${categoryLabel(l.category)}: ${l.percent}%`} />
                <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-muted">
                  <span>
                    {l.percent}% · {l.remaining >= 0 ? `${f.money(l.remaining)} left` : `over by ${f.money(-l.remaining)}`}
                  </span>
                  {isCurrent && (
                    <span className={l.projectedState === "over" ? "font-medium text-danger" : ""}>expected {f.money(l.projected)}</span>
                  )}
                </div>
                {isCurrent && l.remaining > 0 && <p className="mt-1 text-xs text-muted">Up to {f.money(l.dailyAllowance)} per day for the rest of the month.</p>}
                {l.topExpenses.length > 0 && (
                  <details className="mt-3 text-xs">
                    <summary className="cursor-pointer text-muted">Biggest expenses</summary>
                    <ul className="mt-1.5 space-y-1">
                      {l.topExpenses.map((t) => (
                        <li key={t.id} className="flex justify-between">
                          <span>
                            {f.date(t.date, "short")} · {t.description}
                          </span>
                          <span className="tabular">{f.money(t.amount)}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {summary.unbudgeted.length > 0 && (
        <Card className="mt-4">
          <CardHeader>
            <div>
              <CardTitle>Spending without a limit</CardTitle>
              <CardDescription>Categories with spending this month that do not have a limit yet.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {summary.unbudgeted.map((u) => (
                <li key={u.category} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <span>{categoryLabel(u.category)}</span>
                  <span className="flex items-center gap-3">
                    <span className="tabular font-medium">{f.money(u.spent)}</span>
                    {u.category !== "debt" && (
                      <Button size="sm" variant="secondary" onClick={() => setEditing({ category: u.category, lock: true })}>
                        Set limit
                      </Button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Modal open={!!editing} onOpenChange={(o) => !o && setEditing(null)} title={editing?.category ? `${categoryLabel(editing.category)} limit` : "Set a monthly limit"}>
        {editing && <BudgetForm category={editing.category} amount={editing.amount} lockCategory={editing.lock} onDone={() => setEditing(null)} />}
      </Modal>
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Remove this limit?"
        description="Your expenses stay recorded; only the limit is removed."
        confirmLabel="Remove"
        onConfirm={() => (deleting ? run(() => deleteBudget({ category: deleting })) : undefined)}
      />
      <p className="sr-only">{monthKey}</p>
    </>
  );
}
