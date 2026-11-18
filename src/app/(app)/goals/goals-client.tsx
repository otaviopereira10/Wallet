"use client";

import { Archive, ArchiveRestore, CheckCircle2, Lightbulb, Pencil, PiggyBank, Plus, Trash2 } from "lucide-react";
import * as React from "react";
import { useFormat, useServerAction } from "@/components/app-context";
import { ContributionForm, GoalForm, type GoalInitial } from "@/components/forms/entity-forms";
import { Button } from "@/components/ui/button";
import { ActionMenu, ConfirmDialog, InfoTip, Modal } from "@/components/ui/overlays";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, ProgressBar, StatCard } from "@/components/ui/primitives";
import type { Currency } from "@/lib/finance/types";
import { monthsToText } from "@/lib/format";
import { deleteContribution, deleteGoal, setGoalArchived } from "@/server/actions/goals";

export interface GoalView {
  id: string;
  name: string;
  kindLabel: string;
  priority: string;
  priorityLabel: string;
  currency: Currency;
  target: number;
  saved: number;
  remaining: number;
  percent: number;
  completed: boolean;
  monthly: number;
  monthsToTarget: number | null;
  estimatedDate: string | null;
  requiredMonthly: number | null;
  deadline: string | null;
  onTrack: boolean | null;
  contributedThisMonth: number;
  archived: boolean;
  recommended: number | null;
  contributions: Array<{ id: string; date: string; amount: number; note: string | null }>;
  initial: GoalInitial;
}

export function GoalsClient({
  goals,
  totalSaved,
  capacity,
  plannedGoals,
  assumptions,
  missing,
  emergencyMonths,
}: {
  goals: GoalView[];
  totalSaved: number;
  capacity: number | null;
  plannedGoals: number;
  assumptions: string[];
  missing: string[];
  emergencyMonths: number | null;
}) {
  const f = useFormat();
  const { run } = useServerAction();
  const [creating, setCreating] = React.useState(false);
  const [editing, setEditing] = React.useState<GoalInitial | null>(null);
  const [contributing, setContributing] = React.useState<GoalView | null>(null);
  const [deleting, setDeleting] = React.useState<GoalView | null>(null);
  const active = goals.filter((g) => !g.archived);
  const archived = goals.filter((g) => g.archived);

  return (
    <>
      <div className="mb-6 grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total saved" value={f.money(totalSaved)} icon={<PiggyBank />} tone="pink" />
        <StatCard label="Planned per month" value={f.money(plannedGoals)} />
        <StatCard
          label="You can save per month"
          value={capacity === null ? "—" : f.money(capacity)}
          tone="success"
          info={<InfoTip>What is left each month (repeating income − repeating bills − average everyday spending), minus your planned debt payment.</InfoTip>}
          sub={capacity === null ? "Add repeating income to calculate this" : "Without risking your bills"}
        />
        <div className="flex items-center justify-center rounded-2xl border border-dashed border-border-strong p-4">
          <Button onClick={() => setCreating(true)}>
            <Plus /> New goal
          </Button>
        </div>
      </div>

      {capacity !== null && active.length > 0 && (
        <Card className="mb-4">
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <Lightbulb className="size-4 text-pink-500" /> How much to put in each goal
              </CardTitle>
              <CardDescription>What you can save, split by priority (high 3 : medium 2 : low 1), without giving a goal more than it still needs.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {active.map((g) => (
                <li key={g.id} className="flex items-center justify-between rounded-xl bg-surface-2/60 px-3 py-2 text-sm">
                  <span className="truncate">{g.name}</span>
                  <span className="tabular font-semibold">{g.recommended ? `${f.money(g.recommended)}/month` : g.completed ? "done" : "—"}</span>
                </li>
              ))}
            </ul>
            {emergencyMonths !== null && <p className="mt-3 text-xs text-muted">Your emergency fund covers {emergencyMonths.toFixed(1)} month(s) of essential expenses.</p>}
            {(assumptions.length > 0 || missing.length > 0) && (
              <p className="mt-2 text-xs text-muted">
                {assumptions.join(" ")} {missing.length ? `Missing: ${missing.join(", ")}.` : ""}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {!active.length ? (
        <EmptyState
          icon={<PiggyBank />}
          title="No goals yet"
          description="Create your emergency fund, a trip, electronics or a college fund."
          action={
            <Button onClick={() => setCreating(true)}>
              <Plus /> Create goal
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {active.map((g) => (
            <GoalCard key={g.id} g={g} onContribute={() => setContributing(g)} onEdit={() => setEditing(g.initial)} onDelete={() => setDeleting(g)} />
          ))}
        </div>
      )}
      {archived.length > 0 && (
        <>
          <h3 className="mb-3 mt-8 text-xs font-semibold uppercase tracking-[0.12em] text-muted">Archived</h3>
          <div className="grid gap-3 opacity-80 md:grid-cols-2">
            {archived.map((g) => (
              <GoalCard key={g.id} g={g} onContribute={() => setContributing(g)} onEdit={() => setEditing(g.initial)} onDelete={() => setDeleting(g)} />
            ))}
          </div>
        </>
      )}

      <Modal open={creating} onOpenChange={setCreating} title="New goal">
        <GoalForm onDone={() => setCreating(false)} />
      </Modal>
      <Modal open={!!editing} onOpenChange={(o) => !o && setEditing(null)} title="Edit goal">
        {editing && <GoalForm initial={editing} onDone={() => setEditing(null)} />}
      </Modal>
      <Modal open={!!contributing} onOpenChange={(o) => !o && setContributing(null)} title={`Add to “${contributing?.name ?? ""}”`}>
        {contributing && <ContributionForm goalId={contributing.id} currency={contributing.currency} onDone={() => setContributing(null)} />}
      </Modal>
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete “${deleting?.name}”?`}
        description="The goal and its contribution history will be deleted. To keep the history, archive it instead."
        onConfirm={() => (deleting ? run(() => deleteGoal({ id: deleting.id })) : undefined)}
      />
    </>
  );

  function GoalCard({ g, onContribute, onEdit, onDelete }: { g: GoalView; onContribute: () => void; onEdit: () => void; onDelete: () => void }) {
    return (
      <Card className="rise-in p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-semibold">{g.name}</p>
            <p className="mt-1 flex flex-wrap gap-1.5">
              <Badge tone="pink">{g.kindLabel}</Badge>
              <Badge>{g.priorityLabel} priority</Badge>
              {g.completed && (
                <Badge tone="success">
                  <CheckCircle2 className="size-3" /> Done
                </Badge>
              )}
              {g.onTrack === false && <Badge tone="warning">Behind schedule</Badge>}
              {g.onTrack === true && !g.completed && <Badge tone="success">On track</Badge>}
            </p>
          </div>
          <ActionMenu
            items={[
              { label: "Edit", icon: <Pencil />, onSelect: onEdit },
              { label: g.archived ? "Unarchive" : "Archive", icon: g.archived ? <ArchiveRestore /> : <Archive />, onSelect: () => run(() => setGoalArchived({ id: g.id, archived: !g.archived })) },
              { label: "Delete", icon: <Trash2 />, danger: true, onSelect: onDelete },
            ]}
          />
        </div>
        <div className="mt-4 flex items-baseline justify-between">
          <p className="tabular text-xl font-semibold">{f.money(g.saved, g.currency)}</p>
          <p className="tabular text-sm text-muted">of {f.money(g.target, g.currency)}</p>
        </div>
        <ProgressBar className="mt-2" value={g.percent} tone={g.completed ? "success" : "pink"} label={`${g.name}: ${g.percent}%`} />
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <Info label="Still to save" value={f.money(g.remaining, g.currency)} />
          <Info label="Planned per month" value={g.monthly ? `${f.money(g.monthly, g.currency)}/month` : "not set"} />
          <Info
            label="Expected to reach it"
            value={g.completed ? "Done" : g.estimatedDate ? `${f.date(g.estimatedDate)} (${monthsToText(g.monthsToTarget)})` : "Set a monthly amount"}
          />
          <Info
            label={g.deadline ? `To reach it by ${f.date(g.deadline)}` : "Target date"}
            value={g.deadline ? (g.requiredMonthly !== null ? `${f.money(g.requiredMonthly, g.currency)}/month` : "—") : "no target date"}
          />
        </div>
        {g.contributions.length > 0 && (
          <details className="mt-3 text-xs">
            <summary className="cursor-pointer text-muted">Recent contributions</summary>
            <ul className="mt-1.5 space-y-1">
              {g.contributions.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2">
                  <span>
                    {f.date(c.date, "short")} {c.note ? `· ${c.note}` : ""}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className={`tabular ${c.amount < 0 ? "text-danger" : ""}`}>{f.money(c.amount, g.currency, { signed: true })}</span>
                    <button type="button" aria-label="Remove contribution" className="text-muted hover:text-danger" onClick={() => run(() => deleteContribution({ id: c.id }))}>
                      <Trash2 className="size-3.5" />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
        <Button className="mt-4 w-full" variant="secondary" onClick={onContribute}>
          <Plus /> Add money to this goal
        </Button>
      </Card>
    );
  }
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-surface-2/60 px-3 py-2">
      <p className="text-muted">{label}</p>
      <p className="mt-0.5 font-semibold text-ink">{value}</p>
    </div>
  );
}
