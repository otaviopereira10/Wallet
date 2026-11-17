"use client";

import * as React from "react";
import { useApp } from "@/components/app-context";
import { Field, Input, Select } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { CATEGORY_LABELS, EXPENSE_CATEGORIES, INCOME_CATEGORIES, PAYMENT_METHOD_LABELS, PAYMENT_METHODS } from "@/lib/constants";
import type { Currency } from "@/lib/finance/types";

export const MoneyInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { currency?: Currency }>(
  ({ currency = "USD", className, ...props }, ref) => (
    <div className="relative">
      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-medium text-muted">
        {currency === "BRL" ? "R$" : "US$"}
      </span>
      <Input ref={ref} inputMode="decimal" autoComplete="off" placeholder="0,00" className={cn("tabular pl-11", className)} {...props} />
    </div>
  ),
);
MoneyInput.displayName = "MoneyInput";

export function CurrencySelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <Select {...props}>
      <option value="USD">USD — Dólar</option>
      <option value="BRL">BRL — Real</option>
    </Select>
  );
}

export const AccountSelect = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement> & { allowEmpty?: string; includeArchived?: boolean }
>(({ allowEmpty, includeArchived, ...props }, ref) => {
  const { accounts } = useApp();
  return (
    <Select ref={ref} {...props}>
      {allowEmpty !== undefined && <option value="">{allowEmpty}</option>}
      {accounts
        .filter((a) => includeArchived || !a.archived)
        .map((a) => (
          <option key={a.id} value={a.id}>
            {a.name} ({a.currency})
          </option>
        ))}
    </Select>
  );
});
AccountSelect.displayName = "AccountSelect";

export const CategorySelect = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement> & { kind: "expense" | "income" }>(
  ({ kind, ...props }, ref) => (
    <Select ref={ref} {...props}>
      {(kind === "expense" ? EXPENSE_CATEGORIES : INCOME_CATEGORIES).map((c) => (
        <option key={c} value={c}>
          {CATEGORY_LABELS[c]}
        </option>
      ))}
    </Select>
  ),
);
CategorySelect.displayName = "CategorySelect";

export const PaymentMethodSelect = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>((props, ref) => (
  <Select ref={ref} {...props}>
    <option value="">Não informado</option>
    {PAYMENT_METHODS.map((m) => (
      <option key={m} value={m}>
        {PAYMENT_METHOD_LABELS[m]}
      </option>
    ))}
  </Select>
));
PaymentMethodSelect.displayName = "PaymentMethodSelect";

/**
 * Shows an exchange-rate field when the movement currency differs from the
 * account currency, so conversions are always explicit.
 */
export function FxField({
  from,
  accountId,
  amount,
  register,
  error,
}: {
  from: Currency;
  accountId: string | null | undefined;
  amount: string | undefined;
  register: React.InputHTMLAttributes<HTMLInputElement> & { ref?: React.Ref<HTMLInputElement> };
  error?: string;
}) {
  const { accounts, usdBrl, locale } = useApp();
  const acc = accounts.find((a) => a.id === accountId);
  if (!acc || acc.currency === from) return null;
  const latest = usdBrl ? (from === "USD" ? Number(usdBrl.rate) : 1 / Number(usdBrl.rate)) : null;
  const value = Number(String(amount ?? "").replace(",", "."));
  return (
    <Field
      label={`Taxa de câmbio: 1 ${from} = ? ${acc.currency}`}
      error={error}
      hint={
        latest
          ? `Em branco = última cotação (${latest.toLocaleString(locale, { maximumFractionDigits: 4 })}${usdBrl?.isManual ? ", manual" : ""}). ${
              value > 0 ? `≈ ${(value * latest).toLocaleString(locale, { style: "currency", currency: acc.currency })} na conta.` : ""
            }`
          : "Sem cotação salva: informe a taxa para converter."
      }
    >
      <Input inputMode="decimal" placeholder={latest ? latest.toFixed(4) : "ex.: 5,4321"} {...register} />
    </Field>
  );
}

export function FormGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("grid grid-cols-1 gap-4 sm:grid-cols-2", className)}>{children}</div>;
}

export function CheckboxRow({
  label,
  description,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; description?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-surface-2/50 p-3">
      <input type="checkbox" className="mt-0.5 size-4 accent-[var(--c-pink-500)]" {...props} />
      <span>
        <span className="block text-sm font-medium text-ink">{label}</span>
        {description && <span className="block text-xs text-muted">{description}</span>}
      </span>
    </label>
  );
}

export function err(errors: Record<string, { message?: unknown } | undefined>, key: string): string | undefined {
  const m = errors[key]?.message;
  return typeof m === "string" ? m : undefined;
}
