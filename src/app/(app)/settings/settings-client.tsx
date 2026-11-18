"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeftRight, Database, KeyRound, LogOut, RefreshCw, ShieldCheck, Trash2, UserRound } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { useApp, useFormat, useServerAction } from "@/components/app-context";
import { MultiLineChart, SERIES } from "@/components/charts/charts";
import { err, FormGrid } from "@/components/forms/fields";
import { ProfileForm, type ProfileValues } from "@/components/forms/profile-form";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/overlays";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Input, Select } from "@/components/ui/primitives";
import type { ResolvedRate } from "@/lib/finance/fx";
import { formatDateTime } from "@/lib/format";
import { manualRateSchema, passwordChangeSchema } from "@/lib/validation";
import { changePasswordAction, signOutAction } from "@/server/actions/auth";
import { deleteManualRates, refreshFxNow, resetAllData, setManualRate } from "@/server/actions/settings";

export function SettingsClient({
  profile,
  fx,
  system,
}: {
  profile: ProfileValues;
  fx: {
    latest: ResolvedRate | null;
    history: Array<{ date: string; rate: string; source: string }>;
    manual: Array<{ date: string; rate: string; base: string; quote: string; fetchedAt: string }>;
    provider: string;
  };
  system: { backend: "local" | "supabase"; email: string; aiConfigured: boolean; aiModel: string };
}) {
  const f = useFormat();
  const app = useApp();
  const { run, pending } = useServerAction();
  const [resetOpen, setResetOpen] = React.useState(false);
  const [confirmText, setConfirmText] = React.useState("");

  return (
    <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <UserRound className="size-4 text-pink-500" /> Profile & preferences
              </CardTitle>
              <CardDescription>Main currency, number format, time zone, safety cushion, reminders and theme.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <ProfileForm initial={profile} />
          </CardContent>
        </Card>

        <Card id="exchange">
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <ArrowLeftRight className="size-4 text-pink-500" /> Exchange rate USD ↔ BRL
              </CardTitle>
              <CardDescription>
                Source: {fx.provider === "frankfurter" ? "Frankfurter (European Central Bank reference rates)" : "AwesomeAPI"}. Amounts in different currencies are never
                added together without converting them first.
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" loading={pending} onClick={() => run(() => refreshFxNow())}>
              <RefreshCw /> Update
            </Button>
          </CardHeader>
          <CardContent className="space-y-5">
            {fx.latest ? (
              <div className="flex flex-wrap items-end justify-between gap-3 rounded-2xl bg-surface-2/60 p-4">
                <div>
                  <p className="text-xs text-muted">Rate in use</p>
                  <p className="tabular font-display text-3xl">
                    1 USD = {Number(fx.latest.rate).toLocaleString(f.locale, { maximumFractionDigits: 4 })} BRL
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    Rate date {f.date(fx.latest.rateDate)} · updated {formatDateTime(fx.latest.fetchedAt.replace(" ", "T"), f.locale)}
                  </p>
                </div>
                <Badge tone={fx.latest.isManual ? "warning" : "success"}>{fx.latest.isManual ? "Manual rate" : `Source: ${fx.latest.source}`}</Badge>
              </div>
            ) : (
              <p className="rounded-xl bg-warning-bg px-4 py-3 text-sm text-warning">
                No exchange rate saved yet. Click “Update” or enter a manual rate below. Amounts in the other currency are left out of totals until there is a rate.
              </p>
            )}
            {fx.history.length > 1 && (
              <MultiLineChart
                height={180}
                data={[...fx.history].reverse().map((h) => ({ label: f.date(h.date, "short"), rate: Number(h.rate) }))}
                series={[{ key: "rate", name: "BRL per 1 USD", color: SERIES.netWorth }]}
                currency="BRL"
              />
            )}
            <ManualRateForm />
            {fx.manual.length > 0 && (
              <div className="flex items-center justify-between text-xs text-muted">
                <span>
                  {fx.manual.length} manual rate(s) saved. The most recent rate (manual or automatic) is the one used.
                </span>
                <Button variant="danger-ghost" size="sm" onClick={() => run(() => deleteManualRates())}>
                  Remove manual rates
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <KeyRound className="size-4 text-pink-500" /> Security
              </CardTitle>
              <CardDescription>Signed in as {system.email}</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <PasswordForm />
            <form action={signOutAction}>
              <Button type="submit" variant="outline" className="w-full">
                <LogOut /> Sign out
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-pink-500" /> Privacy & system
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="Storage" value={system.backend === "supabase" ? "Supabase (PostgreSQL with Row Level Security)" : "Built-in local database (PostgreSQL/PGlite with Row Level Security)"} />
            <Row label="Who can see your data" value="Only you — every row is locked to your account (Row Level Security)" />
            <Row label="AI" value={system.aiConfigured ? `Set up (${system.aiModel}) · ${app.aiEnabled ? "turned on by you" : "turned off"}` : "Not set up — all calculations still work"} />
            <Row label="Real payments" value="Never: the app only organizes, calculates and recommends" />
            <Link href="/data" className="inline-flex items-center gap-2 text-sm font-semibold text-pink-600 hover:underline">
              <Database className="size-4" /> Backup, import and export
            </Link>
          </CardContent>
        </Card>

        <Card className="border-danger/30">
          <CardHeader>
            <div>
              <CardTitle className="text-danger">Danger zone</CardTitle>
              <CardDescription>Deletes all accounts, transactions, debts, goals and financial settings. Your login stays.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <Button variant="danger" onClick={() => setResetOpen(true)}>
              <Trash2 /> Delete all financial data
            </Button>
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={resetOpen}
        onOpenChange={(o) => {
          setResetOpen(o);
          if (!o) setConfirmText("");
        }}
        title="Delete all data?"
        description={
          <span className="block space-y-3">
            <span className="block">This cannot be undone. Download a backup first if you want to keep a copy.</span>
            <span className="block">
              Type <strong>DELETE</strong> to confirm:
              <Input className="mt-2" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} aria-label="Confirmation" />
            </span>
          </span>
        }
        confirmLabel="Delete everything"
        onConfirm={async () => {
          if (confirmText !== "DELETE") {
            toast.error("Type DELETE to confirm.");
            return false;
          }
          const ok = await run(() => resetAllData({ confirm: confirmText }));
          if (ok) window.location.href = "/onboarding";
          return ok;
        }}
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-border pb-2 last:border-0">
      <span className="text-xs text-muted">{label}</span>
      <span className="text-ink">{value}</span>
    </div>
  );
}

function ManualRateForm() {
  const app = useApp();
  const { run, pending } = useServerAction();
  const { register, handleSubmit, formState, reset } = useForm({
    resolver: zodResolver(manualRateSchema),
    defaultValues: { base: "USD" as const, quote: "BRL" as const, rate: "", date: app.today },
  });
  const e = formState.errors as Record<string, { message?: string }>;
  return (
    <form noValidate onSubmit={handleSubmit((v) => run(() => setManualRate(v), { onSuccess: () => reset({ base: "USD", quote: "BRL", rate: "", date: app.today }) }))} className="rounded-2xl border border-border p-4">
      <p className="mb-3 text-sm font-medium">Enter a rate manually</p>
      <FormGrid className="sm:grid-cols-4">
        <Field label="From" htmlFor="mr-base">
          <Select id="mr-base" {...register("base")}>
            <option value="USD">USD</option>
            <option value="BRL">BRL</option>
          </Select>
        </Field>
        <Field label="To" htmlFor="mr-quote">
          <Select id="mr-quote" {...register("quote")}>
            <option value="BRL">BRL</option>
            <option value="USD">USD</option>
          </Select>
        </Field>
        <Field label="Rate" error={err(e, "rate")} htmlFor="mr-rate">
          <Input id="mr-rate" inputMode="decimal" placeholder="5.4321" {...register("rate")} />
        </Field>
        <Field label="Date" htmlFor="mr-date">
          <Input id="mr-date" type="date" {...register("date")} />
        </Field>
      </FormGrid>
      <div className="mt-3 flex justify-end">
        <Button type="submit" size="sm" loading={pending}>
          Save manual rate
        </Button>
      </div>
    </form>
  );
}

function PasswordForm() {
  const [busy, setBusy] = React.useState(false);
  const { register, handleSubmit, formState, reset } = useForm({
    resolver: zodResolver(passwordChangeSchema),
    defaultValues: { current: "", next: "", confirm: "" },
  });
  const e = formState.errors as Record<string, { message?: string }>;
  return (
    <form
      noValidate
      className="space-y-3"
      onSubmit={handleSubmit(async (v) => {
        setBusy(true);
        const r = await changePasswordAction(v);
        setBusy(false);
        if (r.ok) {
          toast.success(r.message ?? "Password changed");
          reset();
        } else toast.error(r.error ?? "Something went wrong");
      })}
    >
      <Field label="Current password" error={err(e, "current")} htmlFor="pw-cur">
        <Input id="pw-cur" type="password" autoComplete="current-password" {...register("current")} />
      </Field>
      <Field label="New password" error={err(e, "next")} htmlFor="pw-new">
        <Input id="pw-new" type="password" autoComplete="new-password" {...register("next")} />
      </Field>
      <Field label="Confirm new password" error={err(e, "confirm")} htmlFor="pw-conf">
        <Input id="pw-conf" type="password" autoComplete="new-password" {...register("confirm")} />
      </Field>
      <Button type="submit" variant="secondary" className="w-full" loading={busy}>
        Change password
      </Button>
    </form>
  );
}
