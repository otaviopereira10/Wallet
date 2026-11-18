"use client";

import { BellRing, CalendarCheck, CheckCircle2, Pencil, Plus, Repeat, SkipForward, Trash2, XCircle } from "lucide-react";
import * as React from "react";
import { useFormat, useServerAction } from "@/components/app-context";
import { SubscriptionChargeForm, SubscriptionForm, type SubscriptionInitial } from "@/components/forms/entity-forms";
import { Button } from "@/components/ui/button";
import { ActionMenu, ConfirmDialog, Modal } from "@/components/ui/overlays";
import { Badge, Card, EmptyState, StatCard } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import type { Currency } from "@/lib/finance/types";
import { relativeDays } from "@/lib/format";
import { deleteSubscription, markSubscriptionUsed, setSubscriptionStatus, skipSubscriptionCharge } from "@/server/actions/subscriptions";

interface SubView {
  id: string;
  name: string;
  amount: number;
  amountInput: string;
  currency: Currency;
  cycleLabel: string;
  nextChargeDate: string;
  daysUntilCharge: number;
  chargeSoon: boolean;
  chargeOverdue: boolean;
  status: "active" | "cancel_planned" | "cancelled";
  usage: "unknown" | "recent" | "low";
  daysSinceUse: number | null;
  monthly: number;
  yearly: number;
  accountId: string | null;
  totalCharged: number;
  initial: SubscriptionInitial;
}

export function SubscriptionsClient({
  subs,
  totals,
}: {
  subs: SubView[];
  totals: { activeMonthly: number; activeYearly: number; cancelPlannedMonthly: number; count: number };
}) {
  const f = useFormat();
  const { run } = useServerAction();
  const [creating, setCreating] = React.useState(false);
  const [editing, setEditing] = React.useState<SubscriptionInitial | null>(null);
  const [charging, setCharging] = React.useState<SubView | null>(null);
  const [deleting, setDeleting] = React.useState<SubView | null>(null);

  return (
    <>
      <div className="mb-6 grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Per month" value={f.money(totals.activeMonthly)} icon={<Repeat />} tone="pink" sub={`${totals.count} active subscription(s)`} />
        <StatCard label="Per year" value={f.money(totals.activeYearly)} />
        <StatCard label="Savings if you cancel the flagged ones" value={`${f.money(totals.cancelPlannedMonthly)}/month`} tone="success" sub={`${f.money(totals.cancelPlannedMonthly * 12)} per year`} />
        <div className="flex items-center justify-center rounded-2xl border border-dashed border-border-strong p-4">
          <Button onClick={() => setCreating(true)}>
            <Plus /> New subscription
          </Button>
        </div>
      </div>

      {!subs.length ? (
        <EmptyState
          icon={<Repeat />}
          title="No subscriptions yet"
          description="Netflix, Spotify, iCloud, apps and the gym — add them to see what they cost per month and per year."
          action={
            <Button onClick={() => setCreating(true)}>
              <Plus /> Add subscription
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {subs.map((s) => (
            <Card key={s.id} className={cn("p-5", s.status === "cancelled" && "opacity-60")}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{s.name}</p>
                  <p className="mt-1 flex flex-wrap gap-1.5">
                    <Badge>{s.cycleLabel}</Badge>
                    {s.status === "cancel_planned" && <Badge tone="warning">Want to cancel</Badge>}
                    {s.status === "cancelled" && <Badge>Cancelled</Badge>}
                    {s.status !== "cancelled" &&
                      (s.usage === "unknown" ? (
                        <Badge tone="neutral">No usage info</Badge>
                      ) : s.usage === "low" ? (
                        <Badge tone="danger">Not used for {s.daysSinceUse} days</Badge>
                      ) : (
                        <Badge tone="success">In use</Badge>
                      ))}
                  </p>
                </div>
                <ActionMenu
                  items={[
                    s.status !== "cancelled" && { label: "Record a charge", icon: <CalendarCheck />, onSelect: () => setCharging(s) },
                    s.status !== "cancelled" && { label: "Skip this charge", icon: <SkipForward />, onSelect: () => run(() => skipSubscriptionCharge({ id: s.id })) },
                    s.status !== "cancelled" && { label: "I used it today", icon: <CheckCircle2 />, onSelect: () => run(() => markSubscriptionUsed({ id: s.id })) },
                    s.status === "active" && { label: "Flag to cancel", icon: <BellRing />, onSelect: () => run(() => setSubscriptionStatus({ id: s.id, status: "cancel_planned" })) },
                    s.status !== "cancelled" && { label: "I cancelled it", icon: <XCircle />, onSelect: () => run(() => setSubscriptionStatus({ id: s.id, status: "cancelled" })) },
                    s.status !== "active" && { label: "Make active again", icon: <Repeat />, onSelect: () => run(() => setSubscriptionStatus({ id: s.id, status: "active" })) },
                    { label: "Edit", icon: <Pencil />, onSelect: () => setEditing(s.initial) },
                    { label: "Delete", icon: <Trash2 />, danger: true, onSelect: () => setDeleting(s) },
                  ]}
                />
              </div>
              <p className="tabular mt-3 text-xl font-semibold">{f.money(s.amount, s.currency)}</p>
              <p className="tabular text-xs text-muted">
                ≈ {f.money(s.monthly, s.currency)}/month · {f.money(s.yearly, s.currency)}/year
              </p>
              {s.status !== "cancelled" && (
                <p
                  className={cn(
                    "mt-3 rounded-xl px-3 py-2 text-xs",
                    s.chargeOverdue ? "bg-warning-bg text-warning" : s.chargeSoon ? "bg-pink-50 text-pink-600" : "bg-surface-2 text-muted",
                  )}
                >
                  {s.chargeOverdue
                    ? `Charge from ${f.date(s.nextChargeDate)} not recorded yet`
                    : `Next charge ${relativeDays(s.daysUntilCharge)} (${f.date(s.nextChargeDate)})`}
                </p>
              )}
              {s.totalCharged > 0 && <p className="mt-2 text-xs text-muted">Recorded so far: {f.money(s.totalCharged, s.currency)}</p>}
              {s.status !== "cancelled" && (s.chargeSoon || s.chargeOverdue) && (
                <Button size="sm" className="mt-3 w-full" onClick={() => setCharging(s)}>
                  Record charge
                </Button>
              )}
            </Card>
          ))}
        </div>
      )}

      <Modal open={creating} onOpenChange={setCreating} title="New subscription">
        <SubscriptionForm onDone={() => setCreating(false)} />
      </Modal>
      <Modal open={!!editing} onOpenChange={(o) => !o && setEditing(null)} title="Edit subscription">
        {editing && <SubscriptionForm initial={editing} onDone={() => setEditing(null)} />}
      </Modal>
      <Modal open={!!charging} onOpenChange={(o) => !o && setCharging(null)} title={`${charging?.name ?? ""} charge`} description="Records the expense and moves the next charge date forward.">
        {charging && (
          <SubscriptionChargeForm
            subscriptionId={charging.id}
            amount={charging.amountInput}
            currency={charging.currency}
            date={charging.nextChargeDate}
            accountId={charging.accountId}
            onDone={() => setCharging(null)}
          />
        )}
      </Modal>
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete “${deleting?.name}”?`}
        description="Charges you already recorded stay in your expenses."
        onConfirm={() => (deleting ? run(() => deleteSubscription({ id: deleting.id })) : undefined)}
      />
    </>
  );
}
