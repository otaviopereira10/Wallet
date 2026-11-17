"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import * as React from "react";
import { useForm } from "react-hook-form";
import { useApp, useServerAction } from "@/components/app-context";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/overlays";
import { Field, Input, Select } from "@/components/ui/primitives";
import type { Currency } from "@/lib/finance/types";
import { profileSchema } from "@/lib/validation";
import { updateProfile } from "@/server/actions/settings";
import { CheckboxRow, err, FormGrid, MoneyInput } from "./fields";

export interface ProfileValues {
  displayName: string;
  baseCurrency: Currency;
  locale: "pt-BR" | "en-US";
  timezone: string;
  theme: "light" | "dark" | "system";
  emergencyBuffer: string;
  alertDaysAhead: number;
  aiEnabled: boolean;
}

const COMMON_TZ = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "America/Manaus",
  "America/Recife",
  "Europe/Lisbon",
  "Europe/London",
  "UTC",
];

export function ProfileForm({
  initial,
  onDone,
  submitLabel = "Salvar preferências",
  compact,
  detectTimezone,
}: {
  initial: ProfileValues;
  onDone?: () => void;
  submitLabel?: string;
  compact?: boolean;
  detectTimezone?: boolean;
}) {
  const app = useApp();
  const { pending, run } = useServerAction();
  const { register, handleSubmit, watch, setValue, formState } = useForm({
    resolver: zodResolver(profileSchema),
    defaultValues: { ...initial },
  });
  React.useEffect(() => {
    if (!detectTimezone) return;
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz) setValue("timezone", tz);
    } catch {
      /* keep default */
    }
  }, [detectTimezone, setValue]);
  const tz = watch("timezone");
  const zones = COMMON_TZ.includes(tz) ? COMMON_TZ : [tz, ...COMMON_TZ];
  const e = formState.errors as Record<string, { message?: string }>;
  return (
    <form noValidate className="space-y-4" onSubmit={handleSubmit((v) => run(() => updateProfile(v), { onSuccess: () => onDone?.() }))}>
      <FormGrid>
        <Field label="Como você quer ser chamada?" htmlFor="pf-name">
          <Input id="pf-name" placeholder="Isabelle" {...register("displayName")} />
        </Field>
        <Field
          label={
            <>
              Moeda principal
              <InfoTip>Todos os totais são convertidos para esta moeda usando a cotação registrada. Você pode mudar quando quiser.</InfoTip>
            </>
          }
          htmlFor="pf-cur"
        >
          <Select id="pf-cur" {...register("baseCurrency")}>
            <option value="USD">USD — Dólar americano</option>
            <option value="BRL">BRL — Real brasileiro</option>
          </Select>
        </Field>
        <Field label="Fuso horário" htmlFor="pf-tz" hint="Define o que é “hoje” para vencimentos.">
          <Select id="pf-tz" {...register("timezone")}>
            {zones.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label={
            <>
              Reserva mínima na conta
              <InfoTip>Valor que você quer manter sempre disponível para imprevistos. É descontado do “quanto posso gastar”.</InfoTip>
            </>
          }
          error={err(e, "emergencyBuffer")}
          htmlFor="pf-buffer"
        >
          <MoneyInput id="pf-buffer" currency={watch("baseCurrency") as Currency} {...register("emergencyBuffer")} />
        </Field>
        {!compact && (
          <>
            <Field label="Formato de números" htmlFor="pf-locale">
              <Select id="pf-locale" {...register("locale")}>
                <option value="pt-BR">Português (1.234,56)</option>
                <option value="en-US">English (1,234.56)</option>
              </Select>
            </Field>
            <Field label="Avisar contas com antecedência de (dias)" error={err(e, "alertDaysAhead")} htmlFor="pf-alert">
              <Input id="pf-alert" type="number" min={0} max={30} {...register("alertDaysAhead")} />
            </Field>
            <Field label="Tema" htmlFor="pf-theme">
              <Select id="pf-theme" {...register("theme")}>
                <option value="light">Claro</option>
                <option value="dark">Escuro</option>
                <option value="system">Seguir o sistema</option>
              </Select>
            </Field>
          </>
        )}
      </FormGrid>
      {!compact && (
        <CheckboxRow
          label="Usar IA nas respostas da Isabelle Intelligence"
          description={
            app.aiAvailable
              ? "Envia um resumo dos seus números ao provedor de IA configurado no servidor somente quando você pergunta. Os cálculos continuam sendo feitos pelo app."
              : "Indisponível: nenhuma chave de IA configurada no servidor. Os cálculos locais funcionam normalmente."
          }
          disabled={!app.aiAvailable}
          {...register("aiEnabled")}
        />
      )}
      <div className="flex justify-end pt-2">
        <Button type="submit" loading={pending}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
