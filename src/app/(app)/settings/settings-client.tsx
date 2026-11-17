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
                <UserRound className="size-4 text-pink-500" /> Perfil e preferências
              </CardTitle>
              <CardDescription>Moeda principal, formato, fuso horário, reserva mínima, alertas e tema.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <ProfileForm initial={profile} />
          </CardContent>
        </Card>

        <Card id="cambio">
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <ArrowLeftRight className="size-4 text-pink-500" /> Câmbio USD ↔ BRL
              </CardTitle>
              <CardDescription>
                Fonte: {fx.provider === "frankfurter" ? "Frankfurter (taxas de referência do Banco Central Europeu)" : "AwesomeAPI"}. Valores em moedas diferentes nunca são
                misturados sem conversão explícita.
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" loading={pending} onClick={() => run(() => refreshFxNow())}>
              <RefreshCw /> Atualizar
            </Button>
          </CardHeader>
          <CardContent className="space-y-5">
            {fx.latest ? (
              <div className="flex flex-wrap items-end justify-between gap-3 rounded-2xl bg-surface-2/60 p-4">
                <div>
                  <p className="text-xs text-muted">Taxa em uso</p>
                  <p className="tabular font-display text-3xl">
                    1 USD = {Number(fx.latest.rate).toLocaleString(f.locale, { maximumFractionDigits: 4 })} BRL
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    Data da cotação {f.date(fx.latest.rateDate)} · atualizada em {formatDateTime(fx.latest.fetchedAt.replace(" ", "T"), f.locale)}
                  </p>
                </div>
                <Badge tone={fx.latest.isManual ? "warning" : "success"}>{fx.latest.isManual ? "Taxa manual" : `Fonte: ${fx.latest.source}`}</Badge>
              </div>
            ) : (
              <p className="rounded-xl bg-warning-bg px-4 py-3 text-sm text-warning">
                Nenhuma cotação salva ainda. Clique em “Atualizar” ou informe uma taxa manual abaixo. Valores em outra moeda não entram nos totais até haver uma cotação.
              </p>
            )}
            {fx.history.length > 1 && (
              <MultiLineChart
                height={180}
                data={[...fx.history].reverse().map((h) => ({ label: f.date(h.date, "short"), rate: Number(h.rate) }))}
                series={[{ key: "rate", name: "BRL por 1 USD", color: SERIES.netWorth }]}
                currency="BRL"
              />
            )}
            <ManualRateForm />
            {fx.manual.length > 0 && (
              <div className="flex items-center justify-between text-xs text-muted">
                <span>
                  {fx.manual.length} taxa(s) manual(is) registrada(s). A mais recente (manual ou automática) é a que vale.
                </span>
                <Button variant="danger-ghost" size="sm" onClick={() => run(() => deleteManualRates())}>
                  Remover taxas manuais
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
                <KeyRound className="size-4 text-pink-500" /> Segurança
              </CardTitle>
              <CardDescription>Conectada como {system.email}</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <PasswordForm />
            <form action={signOutAction}>
              <Button type="submit" variant="outline" className="w-full">
                <LogOut /> Sair da conta
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-pink-500" /> Privacidade e sistema
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="Armazenamento" value={system.backend === "supabase" ? "Supabase (PostgreSQL com RLS)" : "Banco local embutido (PostgreSQL/PGlite com RLS)"} />
            <Row label="Isolamento dos dados" value="Row Level Security: cada linha só é visível para a dona" />
            <Row label="IA" value={system.aiConfigured ? `Configurada (${system.aiModel}) · ${app.aiEnabled ? "ativada por você" : "desativada"}` : "Não configurada — cálculos locais funcionam"} />
            <Row label="Pagamentos reais" value="Nunca: o app apenas organiza, calcula e recomenda" />
            <Link href="/data" className="inline-flex items-center gap-2 text-sm font-semibold text-pink-600 hover:underline">
              <Database className="size-4" /> Backup, importação e exportação
            </Link>
          </CardContent>
        </Card>

        <Card className="border-danger/30">
          <CardHeader>
            <div>
              <CardTitle className="text-danger">Zona de perigo</CardTitle>
              <CardDescription>Apaga todas as contas, movimentações, dívidas, metas e configurações financeiras. Seu login é mantido.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <Button variant="danger" onClick={() => setResetOpen(true)}>
              <Trash2 /> Apagar todos os dados financeiros
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
        title="Apagar todos os dados?"
        description={
          <span className="block space-y-3">
            <span className="block">Esta ação não pode ser desfeita. Baixe um backup antes, se quiser guardar uma cópia.</span>
            <span className="block">
              Digite <strong>APAGAR</strong> para confirmar:
              <Input className="mt-2" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} aria-label="Confirmação" />
            </span>
          </span>
        }
        confirmLabel="Apagar tudo"
        onConfirm={async () => {
          if (confirmText !== "APAGAR") {
            toast.error("Digite APAGAR para confirmar.");
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
      <p className="mb-3 text-sm font-medium">Informar taxa manual</p>
      <FormGrid className="sm:grid-cols-4">
        <Field label="De" htmlFor="mr-base">
          <Select id="mr-base" {...register("base")}>
            <option value="USD">USD</option>
            <option value="BRL">BRL</option>
          </Select>
        </Field>
        <Field label="Para" htmlFor="mr-quote">
          <Select id="mr-quote" {...register("quote")}>
            <option value="BRL">BRL</option>
            <option value="USD">USD</option>
          </Select>
        </Field>
        <Field label="Taxa" error={err(e, "rate")} htmlFor="mr-rate">
          <Input id="mr-rate" inputMode="decimal" placeholder="5,4321" {...register("rate")} />
        </Field>
        <Field label="Data" htmlFor="mr-date">
          <Input id="mr-date" type="date" {...register("date")} />
        </Field>
      </FormGrid>
      <div className="mt-3 flex justify-end">
        <Button type="submit" size="sm" loading={pending}>
          Salvar taxa manual
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
          toast.success(r.message ?? "Senha alterada");
          reset();
        } else toast.error(r.error ?? "Erro");
      })}
    >
      <Field label="Senha atual" error={err(e, "current")} htmlFor="pw-cur">
        <Input id="pw-cur" type="password" autoComplete="current-password" {...register("current")} />
      </Field>
      <Field label="Nova senha" error={err(e, "next")} htmlFor="pw-new">
        <Input id="pw-new" type="password" autoComplete="new-password" {...register("next")} />
      </Field>
      <Field label="Confirmar nova senha" error={err(e, "confirm")} htmlFor="pw-conf">
        <Input id="pw-conf" type="password" autoComplete="new-password" {...register("confirm")} />
      </Field>
      <Button type="submit" variant="secondary" className="w-full" loading={busy}>
        Alterar senha
      </Button>
    </form>
  );
}
