"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useApp, useServerAction } from "@/components/app-context";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { FREQUENCY_LABELS, EXPENSE_RECURRENCES } from "@/lib/constants";
import type { Currency } from "@/lib/finance/types";
import { expenseSchema, incomeTxSchema, refundSchema, transferSchema } from "@/lib/validation";
import { createExpense, createIncomeTransaction, createRefund, createTransfer, updateExpense, updateIncomeTransaction } from "@/server/actions/transactions";
import { AccountSelect, CategorySelect, CurrencySelect, err, FormGrid, FxField, MoneyInput, PaymentMethodSelect } from "./fields";

export interface ExpenseInitial {
  id?: string;
  description?: string;
  amount?: string;
  currency?: Currency;
  category?: string;
  date?: string;
  paymentMethod?: string | null;
  accountId?: string | null;
  status?: "paid" | "pending";
  recurrence?: string;
  notes?: string | null;
}

function firstAccount(accounts: ReturnType<typeof useApp>["accounts"]) {
  return accounts.find((a) => !a.archived) ?? null;
}

export function ExpenseForm({ initial, onDone }: { initial?: ExpenseInitial; onDone?: () => void }) {
  const app = useApp();
  const acc = firstAccount(app.accounts);
  const { pending, run } = useServerAction();
  const form = useForm({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      description: initial?.description ?? "",
      amount: initial?.amount ?? "",
      currency: initial?.currency ?? acc?.currency ?? app.baseCurrency,
      category: (initial?.category as never) ?? "food",
      date: initial?.date ?? app.today,
      paymentMethod: (initial?.paymentMethod as never) ?? "",
      accountId: initial?.accountId ?? acc?.id ?? "",
      status: initial?.status ?? "paid",
      recurrence: (initial?.recurrence as never) ?? "none",
      notes: initial?.notes ?? "",
      fxRate: "",
    },
  });
  const { register, handleSubmit, watch, formState } = form;
  const e = formState.errors as Record<string, { message?: string }>;
  const status = watch("status");
  const onSubmit = handleSubmit((values) => {
    const payload = { ...values, paymentMethod: values.paymentMethod || null, fxRate: values.fxRate || null };
    return run(() => (initial?.id ? updateExpense({ ...payload, id: initial.id }) : createExpense(payload)), { onSuccess: () => onDone?.() });
  });
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <Field label="What did you buy?" error={err(e, "description")} htmlFor="exp-desc">
        <Input id="exp-desc" placeholder="e.g. Weekly groceries" autoFocus {...register("description")} />
      </Field>
      <FormGrid>
        <Field label="Amount" error={err(e, "amount")} htmlFor="exp-amount">
          <MoneyInput id="exp-amount" currency={watch("currency") as Currency} {...register("amount")} />
        </Field>
        <Field label="Currency" htmlFor="exp-cur">
          <CurrencySelect id="exp-cur" {...register("currency")} />
        </Field>
        <Field label="Category" error={err(e, "category")} htmlFor="exp-cat">
          <CategorySelect id="exp-cat" kind="expense" {...register("category")} />
        </Field>
        <Field label="Date" error={err(e, "date")} htmlFor="exp-date">
          <Input id="exp-date" type="date" {...register("date")} />
        </Field>
        <Field label="Status" htmlFor="exp-status" hint={status === "pending" ? "Pending does not lower your balance until you mark it as paid." : undefined}>
          <Select id="exp-status" {...register("status")}>
            <option value="paid">Paid</option>
            <option value="pending">Not paid yet (pending)</option>
          </Select>
        </Field>
        <Field label="Paid from" error={err(e, "accountId")} htmlFor="exp-acc">
          <AccountSelect id="exp-acc" allowEmpty={status === "pending" ? "Not decided yet" : undefined} {...register("accountId")} />
        </Field>
        <Field label="Payment method" htmlFor="exp-pm">
          <PaymentMethodSelect id="exp-pm" {...register("paymentMethod")} />
        </Field>
        <Field label="Repeats" htmlFor="exp-rec" hint="Repeating expenses are included in your forecasts.">
          <Select id="exp-rec" {...register("recurrence")}>
            {EXPENSE_RECURRENCES.map((r) => (
              <option key={r} value={r}>
                {FREQUENCY_LABELS[r]}
              </option>
            ))}
          </Select>
        </Field>
      </FormGrid>
      {status === "paid" && (
        <FxField
          from={watch("currency") as Currency}
          accountId={watch("accountId")}
          amount={watch("amount") as string}
          register={register("fxRate")}
          error={err(e, "fxRate")}
        />
      )}
      <Field label="Notes (optional)" htmlFor="exp-notes">
        <Textarea id="exp-notes" rows={2} {...register("notes")} />
      </Field>
      {!app.accounts.length && <p className="text-sm text-warning">Add an account on the “Accounts” page to record paid expenses.</p>}
      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit" loading={pending}>
          {initial?.id ? "Save changes" : "Add expense"}
        </Button>
      </div>
    </form>
  );
}

export interface IncomeTxInitial {
  id?: string;
  description?: string;
  amount?: string;
  currency?: Currency;
  category?: string;
  date?: string;
  accountId?: string | null;
  notes?: string | null;
}

export function IncomeTxForm({ initial, onDone }: { initial?: IncomeTxInitial; onDone?: () => void }) {
  const app = useApp();
  const acc = firstAccount(app.accounts);
  const { pending, run } = useServerAction();
  const { register, handleSubmit, watch, formState } = useForm({
    resolver: zodResolver(incomeTxSchema),
    defaultValues: {
      description: initial?.description ?? "",
      amount: initial?.amount ?? "",
      currency: initial?.currency ?? acc?.currency ?? app.baseCurrency,
      category: (initial?.category as never) ?? "side_work",
      date: initial?.date ?? app.today,
      accountId: initial?.accountId ?? acc?.id ?? "",
      notes: initial?.notes ?? "",
      fxRate: "",
    },
  });
  const e = formState.errors as Record<string, { message?: string }>;
  const onSubmit = handleSubmit((v) => {
    const payload = { ...v, fxRate: v.fxRate || null };
    return run(() => (initial?.id ? updateIncomeTransaction({ ...payload, id: initial.id }) : createIncomeTransaction(payload)), {
      onSuccess: () => onDone?.(),
    });
  });
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <p className="rounded-xl bg-surface-2 px-3 py-2 text-xs text-muted">
        Use this for money that <strong>already arrived</strong>. For income that repeats (scholarship, salary), use Income → New income source.
      </p>
      <Field label="Description" error={err(e, "description")} htmlFor="inc-desc">
        <Input id="inc-desc" placeholder="e.g. Design freelance" {...register("description")} />
      </Field>
      <FormGrid>
        <Field label="Amount" error={err(e, "amount")} htmlFor="inc-amount">
          <MoneyInput id="inc-amount" currency={watch("currency") as Currency} {...register("amount")} />
        </Field>
        <Field label="Currency" htmlFor="inc-cur">
          <CurrencySelect id="inc-cur" {...register("currency")} />
        </Field>
        <Field label="Category" htmlFor="inc-cat">
          <CategorySelect id="inc-cat" kind="income" {...register("category")} />
        </Field>
        <Field label="Date received" error={err(e, "date")} htmlFor="inc-date">
          <Input id="inc-date" type="date" {...register("date")} />
        </Field>
        <Field label="Received in" error={err(e, "accountId")} htmlFor="inc-acc" className="sm:col-span-2">
          <AccountSelect id="inc-acc" {...register("accountId")} />
        </Field>
      </FormGrid>
      <FxField from={watch("currency") as Currency} accountId={watch("accountId")} amount={watch("amount") as string} register={register("fxRate")} />
      <Field label="Notes (optional)" htmlFor="inc-notes">
        <Textarea id="inc-notes" rows={2} {...register("notes")} />
      </Field>
      <div className="flex justify-end pt-2">
        <Button type="submit" loading={pending}>
          {initial?.id ? "Save" : "Add income"}
        </Button>
      </div>
    </form>
  );
}

export function TransferForm({ onDone }: { onDone?: () => void }) {
  const app = useApp();
  const active = app.accounts.filter((a) => !a.archived);
  const { pending, run } = useServerAction();
  const { register, handleSubmit, watch, formState } = useForm({
    resolver: zodResolver(transferSchema),
    defaultValues: {
      fromAccountId: active[0]?.id ?? "",
      toAccountId: active[1]?.id ?? "",
      amount: "",
      toAmount: "",
      date: app.today,
      description: "",
    },
  });
  const e = formState.errors as Record<string, { message?: string }>;
  const from = active.find((a) => a.id === watch("fromAccountId"));
  const to = active.find((a) => a.id === watch("toAccountId"));
  const onSubmit = handleSubmit((v) => run(() => createTransfer({ ...v, toAmount: v.toAmount || null }), { onSuccess: () => onDone?.() }));
  if (active.length < 2)
    return <p className="text-sm text-muted">You need at least two accounts to move money between them.</p>;
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <p className="rounded-xl bg-surface-2 px-3 py-2 text-xs text-muted">
        Moving money between your own accounts is not counted as income or expense.
      </p>
      <FormGrid>
        <Field label="From" htmlFor="tr-from">
          <AccountSelect id="tr-from" {...register("fromAccountId")} />
        </Field>
        <Field label="To" error={err(e, "toAccountId")} htmlFor="tr-to">
          <AccountSelect id="tr-to" {...register("toAccountId")} />
        </Field>
        <Field label="Amount sent" error={err(e, "amount")} htmlFor="tr-amount">
          <MoneyInput id="tr-amount" currency={from?.currency} {...register("amount")} />
        </Field>
        {from && to && from.currency !== to.currency ? (
          <Field label="Amount received" hint="Leave empty to convert with the latest rate." htmlFor="tr-to-amount">
            <MoneyInput id="tr-to-amount" currency={to.currency} {...register("toAmount")} />
          </Field>
        ) : (
          <Field label="Date" htmlFor="tr-date">
            <Input id="tr-date" type="date" {...register("date")} />
          </Field>
        )}
        {from && to && from.currency !== to.currency && (
          <Field label="Date" htmlFor="tr-date2">
            <Input id="tr-date2" type="date" {...register("date")} />
          </Field>
        )}
        <Field label="Description (optional)" htmlFor="tr-desc" className="sm:col-span-2">
          <Input id="tr-desc" placeholder="Transfer between accounts" {...register("description")} />
        </Field>
      </FormGrid>
      <div className="flex justify-end pt-2">
        <Button type="submit" loading={pending}>
          Move money
        </Button>
      </div>
    </form>
  );
}

export function RefundForm({ refundOf, initialCategory, onDone }: { refundOf?: string; initialCategory?: string; onDone?: () => void }) {
  const app = useApp();
  const acc = firstAccount(app.accounts);
  const { pending, run } = useServerAction();
  const { register, handleSubmit, watch, formState } = useForm({
    resolver: zodResolver(refundSchema),
    defaultValues: {
      refundOf: refundOf ?? "",
      description: "",
      amount: "",
      currency: acc?.currency ?? app.baseCurrency,
      category: (initialCategory as never) ?? "personal",
      date: app.today,
      accountId: acc?.id ?? "",
      fxRate: "",
    },
  });
  const e = formState.errors as Record<string, { message?: string }>;
  const onSubmit = handleSubmit((v) => run(() => createRefund({ ...v, refundOf: v.refundOf || null, fxRate: v.fxRate || null }), { onSuccess: () => onDone?.() }));
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <Field label="Description" error={err(e, "description")} htmlFor="rf-desc">
        <Input id="rf-desc" placeholder="e.g. Store return" {...register("description")} />
      </Field>
      <FormGrid>
        <Field label="Amount refunded" error={err(e, "amount")} htmlFor="rf-amount">
          <MoneyInput id="rf-amount" currency={watch("currency") as Currency} {...register("amount")} />
        </Field>
        <Field label="Currency" htmlFor="rf-cur">
          <CurrencySelect id="rf-cur" {...register("currency")} />
        </Field>
        <Field label="Category of the original expense" htmlFor="rf-cat">
          <CategorySelect id="rf-cat" kind="expense" {...register("category")} />
        </Field>
        <Field label="Date" htmlFor="rf-date">
          <Input id="rf-date" type="date" {...register("date")} />
        </Field>
        <Field label="Received in" error={err(e, "accountId")} htmlFor="rf-acc" className="sm:col-span-2">
          <AccountSelect id="rf-acc" {...register("accountId")} />
        </Field>
      </FormGrid>
      <FxField from={watch("currency") as Currency} accountId={watch("accountId")} amount={watch("amount") as string} register={register("fxRate")} />
      <div className="flex justify-end pt-2">
        <Button type="submit" loading={pending}>
          Add refund
        </Button>
      </div>
    </form>
  );
}
