"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useApp, useServerAction } from "@/components/app-context";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/overlays";
import { Field, Input, Select, Textarea } from "@/components/ui/primitives";
import {
  ACCOUNT_TYPE_LABELS,
  ACCOUNT_TYPES,
  BILL_RECURRENCES,
  CATEGORY_LABELS,
  FREQUENCY_LABELS,
  GOAL_KIND_LABELS,
  GOAL_KINDS,
  GOAL_PRIORITY_LABELS,
  INCOME_FREQUENCIES,
  PRIORITY_LABELS,
  SUBSCRIPTION_CYCLES,
  SUBSCRIPTION_STATUS_LABELS,
} from "@/lib/constants";
import type { Currency } from "@/lib/finance/types";
import {
  accountSchema,
  billPaymentSchema,
  billSchema,
  budgetSchema,
  contributionSchema,
  debtEventSchema,
  debtPaymentSchema,
  debtSchema,
  goalSchema,
  incomeSchema,
  occurrenceUpdateSchema,
  receiveIncomeSchema,
  subscriptionChargeSchema,
  subscriptionSchema,
} from "@/lib/validation";
import { payBill, createBill, updateBill, updateOccurrence } from "@/server/actions/bills";
import { addDebtEvent, createDebt, payDebt, updateDebt } from "@/server/actions/debts";
import { addContribution, createGoal, updateGoal, upsertBudget } from "@/server/actions/goals";
import { createIncome, receiveIncome, updateIncome } from "@/server/actions/incomes";
import { createAccount, updateAccount } from "@/server/actions/settings";
import { createSubscription, recordSubscriptionCharge, updateSubscription } from "@/server/actions/subscriptions";
import { AccountSelect, CategorySelect, CheckboxRow, CurrencySelect, err, FormGrid, FxField, MoneyInput, PaymentMethodSelect } from "./fields";

type Errors = Record<string, { message?: string }>;
const Submit = ({ pending, children }: { pending: boolean; children: React.ReactNode }) => (
  <div className="flex justify-end pt-2">
    <Button type="submit" loading={pending}>
      {children}
    </Button>
  </div>
);
const nul = (v: unknown) => (v === "" || v === undefined ? null : v);

// ---------------------------------------------------------------------------
export interface AccountInitial {
  id?: string;
  name?: string;
  type?: string;
  currency?: Currency;
  openingBalance?: string;
  openingDate?: string;
  includeInAvailable?: boolean;
}
export function AccountForm({ initial, onDone }: { initial?: AccountInitial; onDone?: () => void }) {
  const app = useApp();
  const { pending, run } = useServerAction();
  const { register, handleSubmit, watch, formState } = useForm({
    resolver: zodResolver(accountSchema),
    defaultValues: {
      name: initial?.name ?? "",
      type: (initial?.type as never) ?? "checking",
      currency: initial?.currency ?? app.baseCurrency,
      openingBalance: initial?.openingBalance ?? "0",
      openingDate: initial?.openingDate ?? app.today,
      includeInAvailable: initial?.includeInAvailable ?? true,
    },
  });
  const e = formState.errors as Errors;
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={handleSubmit((v) => run(() => (initial?.id ? updateAccount({ ...v, id: initial.id }) : createAccount(v)), { onSuccess: () => onDone?.() }))}
    >
      <Field label="Account name" error={err(e, "name")} htmlFor="acc-name">
        <Input id="acc-name" placeholder="e.g. Chase Checking, Nubank" {...register("name")} />
      </Field>
      <FormGrid>
        <Field label="Type" htmlFor="acc-type">
          <Select id="acc-type" {...register("type")}>
            {ACCOUNT_TYPES.map((t) => (
              <option key={t} value={t}>
                {ACCOUNT_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Currency" htmlFor="acc-cur">
          <CurrencySelect id="acc-cur" {...register("currency")} />
        </Field>
        <Field
          label={
            <>
              Current balance
              <InfoTip>How much was in the account on the date below. Anything recorded before that date will not change the balance again.</InfoTip>
            </>
          }
          error={err(e, "openingBalance")}
          htmlFor="acc-bal"
          hint="Credit card with a balance owed? Use a negative number."
        >
          <MoneyInput id="acc-bal" currency={watch("currency") as Currency} {...register("openingBalance")} />
        </Field>
        <Field label="Balance as of" error={err(e, "openingDate")} htmlFor="acc-date">
          <Input id="acc-date" type="date" {...register("openingDate")} />
        </Field>
      </FormGrid>
      <CheckboxRow
        label="Count this as money I can spend"
        description="Uncheck for savings or investments you do not use day to day."
        {...register("includeInAvailable")}
      />
      <Submit pending={pending}>{initial?.id ? "Save" : "Add account"}</Submit>
    </form>
  );
}

// ---------------------------------------------------------------------------
export interface IncomeSourceInitial {
  id?: string;
  name?: string;
  amount?: string;
  currency?: Currency;
  category?: string;
  startDate?: string;
  frequency?: string;
  customInterval?: number | null;
  customUnit?: string | null;
  endDate?: string | null;
  accountId?: string | null;
  notes?: string | null;
}
export function IncomeSourceForm({ initial, onDone }: { initial?: IncomeSourceInitial; onDone?: () => void }) {
  const app = useApp();
  const { pending, run } = useServerAction();
  const { register, handleSubmit, watch, formState } = useForm({
    resolver: zodResolver(incomeSchema),
    defaultValues: {
      name: initial?.name ?? "",
      amount: initial?.amount ?? "",
      currency: initial?.currency ?? app.baseCurrency,
      category: (initial?.category as never) ?? "scholarship",
      startDate: initial?.startDate ?? app.today,
      frequency: (initial?.frequency as never) ?? "monthly",
      customInterval: initial?.customInterval ?? "",
      customUnit: (initial?.customUnit as never) ?? "",
      endDate: initial?.endDate ?? "",
      accountId: initial?.accountId ?? app.accounts.find((a) => !a.archived)?.id ?? "",
      notes: initial?.notes ?? "",
      receivedNow: false,
    },
  });
  const e = formState.errors as Errors;
  const freq = watch("frequency");
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={handleSubmit((v) =>
        run(() => (initial?.id ? updateIncome({ ...v, id: initial.id }) : createIncome(v)), { onSuccess: () => onDone?.() }),
      )}
    >
      <Field label="Name" error={err(e, "name")} htmlFor="src-name">
        <Input id="src-name" placeholder="e.g. Scholarship" {...register("name")} />
      </Field>
      <FormGrid>
        <Field label="Amount" error={err(e, "amount")} htmlFor="src-amount">
          <MoneyInput id="src-amount" currency={watch("currency") as Currency} {...register("amount")} />
        </Field>
        <Field label="Currency" htmlFor="src-cur">
          <CurrencySelect id="src-cur" {...register("currency")} />
        </Field>
        <Field label="Category" htmlFor="src-cat">
          <CategorySelect id="src-cat" kind="income" {...register("category")} />
        </Field>
        <Field label="How often" htmlFor="src-freq">
          <Select id="src-freq" {...register("frequency")}>
            {INCOME_FREQUENCIES.map((f) => (
              <option key={f} value={f}>
                {FREQUENCY_LABELS[f]}
              </option>
            ))}
          </Select>
        </Field>
        {freq === "custom" && (
          <>
            <Field label="Every" error={err(e, "customInterval")} htmlFor="src-int">
              <Input id="src-int" type="number" min={1} max={365} {...register("customInterval")} />
            </Field>
            <Field label="Unit" htmlFor="src-unit">
              <Select id="src-unit" {...register("customUnit")}>
                <option value="">Choose</option>
                <option value="day">days</option>
                <option value="week">weeks</option>
                <option value="month">months</option>
              </Select>
            </Field>
          </>
        )}
        <Field label={freq === "once" ? "Date received" : "First / next payment date"} error={err(e, "startDate")} htmlFor="src-start">
          <Input id="src-start" type="date" {...register("startDate")} />
        </Field>
        {freq !== "once" && (
          <Field label="Ends on (optional)" error={err(e, "endDate")} htmlFor="src-end">
            <Input id="src-end" type="date" {...register("endDate")} />
          </Field>
        )}
        <Field label="Goes into" htmlFor="src-acc" className="sm:col-span-2">
          <AccountSelect id="src-acc" allowEmpty="Decide when received" {...register("accountId")} />
        </Field>
      </FormGrid>
      <Field label="Notes (optional)" htmlFor="src-notes">
        <Textarea id="src-notes" rows={2} {...register("notes")} />
      </Field>
      {!initial?.id && (
        <CheckboxRow
          label="I already received the first payment"
          description="Records it in the account on the date above."
          {...register("receivedNow")}
        />
      )}
      <p className="text-xs text-muted">Future payments show up in your forecasts, but only count in your balance after you confirm you received them.</p>
      <Submit pending={pending}>{initial?.id ? "Save" : "Add income"}</Submit>
    </form>
  );
}

export function ReceiveIncomeForm({
  incomeId,
  occurrence,
  amount,
  currency,
  accountId,
  onDone,
}: {
  incomeId: string;
  occurrence: string;
  amount: string;
  currency: Currency;
  accountId: string | null;
  onDone?: () => void;
}) {
  const app = useApp();
  const { pending, run } = useServerAction();
  const { register, handleSubmit, watch, formState } = useForm({
    resolver: zodResolver(receiveIncomeSchema),
    defaultValues: {
      incomeId,
      occurrence,
      date: occurrence > app.today ? app.today : occurrence,
      amount,
      accountId: accountId ?? app.accounts.find((a) => !a.archived)?.id ?? "",
      fxRate: "",
    },
  });
  const e = formState.errors as Errors;
  return (
    <form noValidate className="space-y-4" onSubmit={handleSubmit((v) => run(() => receiveIncome(v), { onSuccess: () => onDone?.() }))}>
      <FormGrid>
        <Field label="Amount received" error={err(e, "amount")} htmlFor="rcv-amount" hint="Change it if a different amount arrived.">
          <MoneyInput id="rcv-amount" currency={currency} {...register("amount")} />
        </Field>
        <Field label="Date it arrived" error={err(e, "date")} htmlFor="rcv-date">
          <Input id="rcv-date" type="date" {...register("date")} />
        </Field>
        <Field label="Received in" error={err(e, "accountId")} htmlFor="rcv-acc" className="sm:col-span-2">
          <AccountSelect id="rcv-acc" {...register("accountId")} />
        </Field>
      </FormGrid>
      <FxField from={currency} accountId={watch("accountId")} amount={watch("amount") as string} register={register("fxRate")} />
      <Submit pending={pending}>Confirm received</Submit>
    </form>
  );
}

// ---------------------------------------------------------------------------
export interface BillInitial {
  id?: string;
  name?: string;
  amount?: string;
  minimumAmount?: string | null;
  currency?: Currency;
  category?: string;
  priority?: string;
  recurrence?: string;
  firstDueDate?: string;
  endDate?: string | null;
  lateFee?: string;
  interestRate?: string;
  allowsPartial?: boolean;
  accountId?: string | null;
  notes?: string | null;
}
export function BillForm({ initial, onDone }: { initial?: BillInitial; onDone?: () => void }) {
  const app = useApp();
  const { pending, run } = useServerAction();
  const { register, handleSubmit, watch, formState } = useForm({
    resolver: zodResolver(billSchema),
    defaultValues: {
      name: initial?.name ?? "",
      amount: initial?.amount ?? "",
      minimumAmount: initial?.minimumAmount ?? "",
      currency: initial?.currency ?? app.baseCurrency,
      category: (initial?.category as never) ?? "housing",
      priority: (initial?.priority as never) ?? "essential",
      recurrence: (initial?.recurrence as never) ?? "monthly",
      firstDueDate: initial?.firstDueDate ?? app.today,
      endDate: initial?.endDate ?? "",
      lateFee: initial?.lateFee ?? "0",
      interestRate: initial?.interestRate ?? "0",
      allowsPartial: initial?.allowsPartial ?? false,
      accountId: initial?.accountId ?? "",
      notes: initial?.notes ?? "",
    },
  });
  const e = formState.errors as Errors;
  const cur = watch("currency") as Currency;
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={handleSubmit((v) => run(() => (initial?.id ? updateBill({ ...v, id: initial.id }) : createBill(v)), { onSuccess: () => onDone?.() }))}
    >
      <Field label="Bill name" error={err(e, "name")} htmlFor="bill-name">
        <Input id="bill-name" placeholder="e.g. Rent, Internet, Phone" {...register("name")} />
      </Field>
      <FormGrid>
        <Field label="Amount" error={err(e, "amount")} htmlFor="bill-amount">
          <MoneyInput id="bill-amount" currency={cur} {...register("amount")} />
        </Field>
        <Field label="Currency" htmlFor="bill-cur">
          <CurrencySelect id="bill-cur" {...register("currency")} />
        </Field>
        <Field label={initial?.id ? "Due date (reference)" : "Next due date"} error={err(e, "firstDueDate")} htmlFor="bill-due">
          <Input id="bill-due" type="date" {...register("firstDueDate")} />
        </Field>
        <Field label="Repeats" htmlFor="bill-rec">
          <Select id="bill-rec" {...register("recurrence")}>
            {BILL_RECURRENCES.map((r) => (
              <option key={r} value={r}>
                {FREQUENCY_LABELS[r]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Category" htmlFor="bill-cat">
          <CategorySelect id="bill-cat" kind="expense" {...register("category")} />
        </Field>
        <Field
          label={
            <>
              Priority
              <InfoTip>
                Essential: housing, food, health, transportation, education. Important: phone, internet, other obligations. Optional: can wait.
              </InfoTip>
            </>
          }
          htmlFor="bill-pri"
        >
          <Select id="bill-pri" {...register("priority")}>
            {(["essential", "important", "optional"] as const).map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABELS[p]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Late fee (fixed)" error={err(e, "lateFee")} htmlFor="bill-fee">
          <MoneyInput id="bill-fee" currency={cur} {...register("lateFee")} />
        </Field>
        <Field
          label={
            <>
              Late interest (% per year)
              <InfoTip>Yearly rate charged on the late amount, if the company tells you. Used to estimate what paying late would cost.</InfoTip>
            </>
          }
          error={err(e, "interestRate")}
          htmlFor="bill-int"
        >
          <Input id="bill-int" inputMode="decimal" {...register("interestRate")} />
        </Field>
        <Field label="Minimum payment (optional)" error={err(e, "minimumAmount")} htmlFor="bill-min">
          <MoneyInput id="bill-min" currency={cur} {...register("minimumAmount")} />
        </Field>
        <Field label="Ends on (optional)" error={err(e, "endDate")} htmlFor="bill-end">
          <Input id="bill-end" type="date" {...register("endDate")} />
        </Field>
        <Field label="Usually paid from" htmlFor="bill-acc" className="sm:col-span-2">
          <AccountSelect id="bill-acc" allowEmpty="Choose when paying" {...register("accountId")} />
        </Field>
      </FormGrid>
      <CheckboxRow label="Partial payments allowed" description="You can pay part of it (e.g. credit card, tuition plan)." {...register("allowsPartial")} />
      <Field label="Notes (optional)" htmlFor="bill-notes">
        <Textarea id="bill-notes" rows={2} {...register("notes")} />
      </Field>
      {initial?.id && <p className="text-xs text-muted">Upcoming due dates that have no payments yet will be updated with the new details.</p>}
      <Submit pending={pending}>{initial?.id ? "Save" : "Add bill"}</Submit>
    </form>
  );
}

export function BillPaymentForm({
  occurrenceId,
  remaining,
  currency,
  allowsPartial,
  defaultAccountId,
  onDone,
}: {
  occurrenceId: string;
  remaining: string;
  currency: Currency;
  allowsPartial: boolean;
  defaultAccountId?: string | null;
  onDone?: () => void;
}) {
  const app = useApp();
  const { pending, run } = useServerAction();
  const { register, handleSubmit, watch, formState } = useForm({
    resolver: zodResolver(billPaymentSchema),
    defaultValues: {
      occurrenceId,
      amount: remaining,
      date: app.today,
      accountId: defaultAccountId ?? app.accounts.find((a) => !a.archived)?.id ?? "",
      paymentMethod: "",
      recordOutflow: true,
      fxRate: "",
    },
  });
  const e = formState.errors as Errors;
  const record = watch("recordOutflow");
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={handleSubmit((v) => run(() => payBill({ ...v, accountId: nul(v.accountId), paymentMethod: nul(v.paymentMethod) }), { onSuccess: () => onDone?.() }))}
    >
      <FormGrid>
        <Field label="Amount paid" error={err(e, "amount")} htmlFor="bp-amount" hint={allowsPartial ? "Partial payment allowed." : "This bill must be paid in full."}>
          <MoneyInput id="bp-amount" currency={currency} readOnly={!allowsPartial} {...register("amount")} />
        </Field>
        <Field label="Payment date" error={err(e, "date")} htmlFor="bp-date">
          <Input id="bp-date" type="date" {...register("date")} />
        </Field>
        {record && (
          <>
            <Field label="Paid from" error={err(e, "accountId")} htmlFor="bp-acc">
              <AccountSelect id="bp-acc" {...register("accountId")} />
            </Field>
            <Field label="Payment method" htmlFor="bp-pm">
              <PaymentMethodSelect id="bp-pm" {...register("paymentMethod")} />
            </Field>
          </>
        )}
      </FormGrid>
      {record && <FxField from={currency} accountId={watch("accountId")} amount={watch("amount") as string} register={register("fxRate")} />}
      <CheckboxRow
        label="Take this money out of the account"
        description="Uncheck only for old payments already included in your starting balance."
        {...register("recordOutflow")}
      />
      <p className="text-xs text-muted">Isabelle Wallet only records the payment. No real money is moved.</p>
      <Submit pending={pending}>Record payment</Submit>
    </form>
  );
}

export function OccurrenceEditForm({
  occurrenceId,
  amountDue,
  minimumDue,
  waived,
  notes,
  currency,
  onDone,
}: {
  occurrenceId: string;
  amountDue: string;
  minimumDue: string | null;
  waived: boolean;
  notes: string | null;
  currency: Currency;
  onDone?: () => void;
}) {
  const { pending, run } = useServerAction();
  const { register, handleSubmit, formState } = useForm({
    resolver: zodResolver(occurrenceUpdateSchema),
    defaultValues: { occurrenceId, amountDue, minimumDue: minimumDue ?? "", waived, notes: notes ?? "" },
  });
  const e = formState.errors as Errors;
  return (
    <form noValidate className="space-y-4" onSubmit={handleSubmit((v) => run(() => updateOccurrence(v), { onSuccess: () => onDone?.() }))}>
      <FormGrid>
        <Field label="Amount for this due date" error={err(e, "amountDue")} htmlFor="oc-amount" hint="Useful for bills that change each month or had a fee added.">
          <MoneyInput id="oc-amount" currency={currency} {...register("amountDue")} />
        </Field>
        <Field label="Minimum (optional)" error={err(e, "minimumDue")} htmlFor="oc-min">
          <MoneyInput id="oc-min" currency={currency} {...register("minimumDue")} />
        </Field>
      </FormGrid>
      <CheckboxRow label="Skip this due date" description="e.g. a free month. It will not count in your totals." {...register("waived")} />
      <Field label="Notes (optional)" htmlFor="oc-notes">
        <Textarea id="oc-notes" rows={2} {...register("notes")} />
      </Field>
      <Submit pending={pending}>Save</Submit>
    </form>
  );
}

// ---------------------------------------------------------------------------
export interface SubscriptionInitial {
  id?: string;
  name?: string;
  amount?: string;
  currency?: Currency;
  billingCycle?: string;
  nextChargeDate?: string;
  category?: string;
  accountId?: string | null;
  status?: string;
  lastUsedOn?: string | null;
  usageNote?: string | null;
  notes?: string | null;
}
export function SubscriptionForm({ initial, onDone }: { initial?: SubscriptionInitial; onDone?: () => void }) {
  const app = useApp();
  const { pending, run } = useServerAction();
  const { register, handleSubmit, watch, formState } = useForm({
    resolver: zodResolver(subscriptionSchema),
    defaultValues: {
      name: initial?.name ?? "",
      amount: initial?.amount ?? "",
      currency: initial?.currency ?? app.baseCurrency,
      billingCycle: (initial?.billingCycle as never) ?? "monthly",
      nextChargeDate: initial?.nextChargeDate ?? app.today,
      category: (initial?.category as never) ?? "subscriptions",
      accountId: initial?.accountId ?? "",
      status: (initial?.status as never) ?? "active",
      lastUsedOn: initial?.lastUsedOn ?? "",
      usageNote: initial?.usageNote ?? "",
      notes: initial?.notes ?? "",
    },
  });
  const e = formState.errors as Errors;
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={handleSubmit((v) =>
        run(() => (initial?.id ? updateSubscription({ ...v, id: initial.id }) : createSubscription(v)), { onSuccess: () => onDone?.() }),
      )}
    >
      <Field label="Name" error={err(e, "name")} htmlFor="sub-name">
        <Input id="sub-name" placeholder="e.g. Netflix, Spotify, iCloud" {...register("name")} />
      </Field>
      <FormGrid>
        <Field label="Price per charge" error={err(e, "amount")} htmlFor="sub-amount">
          <MoneyInput id="sub-amount" currency={watch("currency") as Currency} {...register("amount")} />
        </Field>
        <Field label="Currency" htmlFor="sub-cur">
          <CurrencySelect id="sub-cur" {...register("currency")} />
        </Field>
        <Field label="Billed" htmlFor="sub-cycle">
          <Select id="sub-cycle" {...register("billingCycle")}>
            {SUBSCRIPTION_CYCLES.map((c) => (
              <option key={c} value={c}>
                {FREQUENCY_LABELS[c]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Next charge" error={err(e, "nextChargeDate")} htmlFor="sub-next">
          <Input id="sub-next" type="date" {...register("nextChargeDate")} />
        </Field>
        <Field label="Category" htmlFor="sub-cat">
          <CategorySelect id="sub-cat" kind="expense" {...register("category")} />
        </Field>
        <Field label="Status" htmlFor="sub-status">
          <Select id="sub-status" {...register("status")}>
            {Object.entries(SUBSCRIPTION_STATUS_LABELS).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Charged to" htmlFor="sub-acc">
          <AccountSelect id="sub-acc" allowEmpty="Not set" {...register("accountId")} />
        </Field>
        <Field
          label={
            <>
              Last used (optional)
              <InfoTip>We only flag “rarely used” when you tell us when you last used it. Nothing is assumed.</InfoTip>
            </>
          }
          htmlFor="sub-used"
        >
          <Input id="sub-used" type="date" {...register("lastUsedOn")} />
        </Field>
      </FormGrid>
      <Field label="Notes (optional)" htmlFor="sub-notes">
        <Textarea id="sub-notes" rows={2} {...register("notes")} />
      </Field>
      <Submit pending={pending}>{initial?.id ? "Save" : "Add subscription"}</Submit>
    </form>
  );
}

export function SubscriptionChargeForm({
  subscriptionId,
  amount,
  currency,
  date,
  accountId,
  onDone,
}: {
  subscriptionId: string;
  amount: string;
  currency: Currency;
  date: string;
  accountId: string | null;
  onDone?: () => void;
}) {
  const app = useApp();
  const { pending, run } = useServerAction();
  const { register, handleSubmit, watch, formState } = useForm({
    resolver: zodResolver(subscriptionChargeSchema),
    defaultValues: { subscriptionId, amount, date: date > app.today ? app.today : date, accountId: accountId ?? app.accounts[0]?.id ?? "", fxRate: "" },
  });
  const e = formState.errors as Errors;
  return (
    <form noValidate className="space-y-4" onSubmit={handleSubmit((v) => run(() => recordSubscriptionCharge(v), { onSuccess: () => onDone?.() }))}>
      <FormGrid>
        <Field label="Amount charged" error={err(e, "amount")} htmlFor="sc-amount">
          <MoneyInput id="sc-amount" currency={currency} {...register("amount")} />
        </Field>
        <Field label="Date" error={err(e, "date")} htmlFor="sc-date">
          <Input id="sc-date" type="date" {...register("date")} />
        </Field>
        <Field label="Charged to" error={err(e, "accountId")} htmlFor="sc-acc" className="sm:col-span-2">
          <AccountSelect id="sc-acc" {...register("accountId")} />
        </Field>
      </FormGrid>
      <FxField from={currency} accountId={watch("accountId")} amount={watch("amount") as string} register={register("fxRate")} />
      <Submit pending={pending}>Record charge</Submit>
    </form>
  );
}

// ---------------------------------------------------------------------------
export interface DebtInitial {
  id?: string;
  name?: string;
  currency?: Currency;
  initialBalance?: string;
  startDate?: string;
  incrementAmount?: string;
  incrementIntervalMonths?: number;
  incrementAnchorDate?: string | null;
  incrementsEndDate?: string | null;
  interestRate?: string;
  interestSince?: string | null;
  plannedMonthlyPayment?: string;
  paymentDay?: number;
  targetPayoffDate?: string | null;
  notes?: string | null;
}
export function DebtForm({ initial, onDone }: { initial?: DebtInitial; onDone?: () => void }) {
  const app = useApp();
  const { pending, run } = useServerAction();
  const { register, handleSubmit, watch, formState } = useForm({
    resolver: zodResolver(debtSchema),
    defaultValues: {
      name: initial?.name ?? "Student loan",
      currency: initial?.currency ?? app.baseCurrency,
      initialBalance: initial?.initialBalance ?? "",
      startDate: initial?.startDate ?? app.today,
      incrementAmount: initial?.incrementAmount ?? "5500",
      incrementIntervalMonths: initial?.incrementIntervalMonths ?? 6,
      incrementAnchorDate: initial?.incrementAnchorDate ?? "",
      incrementsEndDate: initial?.incrementsEndDate ?? "",
      interestRate: initial?.interestRate ?? "0",
      interestSince: initial?.interestSince ?? "",
      plannedMonthlyPayment: initial?.plannedMonthlyPayment ?? "0",
      paymentDay: initial?.paymentDay ?? 5,
      targetPayoffDate: initial?.targetPayoffDate ?? "",
      notes: initial?.notes ?? "",
    },
  });
  const e = formState.errors as Errors;
  const cur = watch("currency") as Currency;
  return (
    <form
      noValidate
      className="space-y-5"
      onSubmit={handleSubmit((v) => run(() => (initial?.id ? updateDebt({ ...v, id: initial.id }) : createDebt(v)), { onSuccess: () => onDone?.() }))}
    >
      <FormGrid>
        <Field label="Name" error={err(e, "name")} htmlFor="debt-name" className="sm:col-span-2">
          <Input id="debt-name" {...register("name")} />
        </Field>
        <Field label="How much you owe" error={err(e, "initialBalance")} htmlFor="debt-bal" hint="The balance today (or on the date next to it).">
          <MoneyInput id="debt-bal" currency={cur} {...register("initialBalance")} />
        </Field>
        <Field label="Currency" htmlFor="debt-cur">
          <CurrencySelect id="debt-cur" {...register("currency")} />
        </Field>
        <Field label="Balance as of" error={err(e, "startDate")} htmlFor="debt-start">
          <Input id="debt-start" type="date" {...register("startDate")} />
        </Field>
      </FormGrid>
      <div className="rounded-2xl border border-pink-100 bg-pink-50/60 p-4">
        <p className="mb-3 text-sm font-semibold text-ink">Semester charge from your school</p>
        <FormGrid>
          <Field
            label={
              <>
                Amount added
                <InfoTip>Amount added to the loan every period (e.g. 5,500 per semester). It is a new charge, kept separate from interest.</InfoTip>
              </>
            }
            error={err(e, "incrementAmount")}
            htmlFor="debt-inc"
          >
            <MoneyInput id="debt-inc" currency={cur} {...register("incrementAmount")} />
          </Field>
          <Field label="Every (months)" error={err(e, "incrementIntervalMonths")} htmlFor="debt-int" hint="6 = every semester">
            <Input id="debt-int" type="number" min={1} max={24} {...register("incrementIntervalMonths")} />
          </Field>
          <Field label="Next charge date" error={err(e, "incrementAnchorDate")} htmlFor="debt-anchor">
            <Input id="debt-anchor" type="date" {...register("incrementAnchorDate")} />
          </Field>
          <Field
            label={
              <>
                Last charge on (optional)
                <InfoTip>e.g. your graduation semester. Without this date, the forecast assumes the charges never stop.</InfoTip>
              </>
            }
            error={err(e, "incrementsEndDate")}
            htmlFor="debt-end"
          >
            <Input id="debt-end" type="date" {...register("incrementsEndDate")} />
          </Field>
        </FormGrid>
      </div>
      <FormGrid>
        <Field
          label={
            <>
              Interest (% per year)
              <InfoTip>Leave 0 if the loan has no interest. If set, interest is added at the end of each month.</InfoTip>
            </>
          }
          error={err(e, "interestRate")}
          htmlFor="debt-rate"
        >
          <Input id="debt-rate" inputMode="decimal" {...register("interestRate")} />
        </Field>
        <Field label="Interest starts on (optional)" htmlFor="debt-since">
          <Input id="debt-since" type="date" {...register("interestSince")} />
        </Field>
        <Field label="Planned monthly payment" error={err(e, "plannedMonthlyPayment")} htmlFor="debt-plan">
          <MoneyInput id="debt-plan" currency={cur} {...register("plannedMonthlyPayment")} />
        </Field>
        <Field label="Payment day of the month" error={err(e, "paymentDay")} htmlFor="debt-day">
          <Input id="debt-day" type="number" min={1} max={28} {...register("paymentDay")} />
        </Field>
        <Field label="Pay off by (optional)" htmlFor="debt-target" className="sm:col-span-2">
          <Input id="debt-target" type="date" {...register("targetPayoffDate")} />
        </Field>
      </FormGrid>
      <Field label="Notes (optional)" htmlFor="debt-notes">
        <Textarea id="debt-notes" rows={2} {...register("notes")} />
      </Field>
      <Submit pending={pending}>{initial?.id ? "Save settings" : "Add debt"}</Submit>
    </form>
  );
}

export function DebtPaymentForm({ debts, debtId, onDone }: { debts: Array<{ id: string; name: string; currency: Currency }>; debtId?: string; onDone?: () => void }) {
  const app = useApp();
  const { pending, run } = useServerAction();
  const { register, handleSubmit, watch, formState } = useForm({
    resolver: zodResolver(debtPaymentSchema),
    defaultValues: {
      debtId: debtId ?? debts[0]?.id ?? "",
      amount: "",
      date: app.today,
      accountId: app.accounts.find((a) => !a.archived)?.id ?? "",
      recordOutflow: true,
      note: "",
      fxRate: "",
    },
  });
  const e = formState.errors as Errors;
  const debt = debts.find((d) => d.id === watch("debtId"));
  const record = watch("recordOutflow");
  if (!debts.length) return <p className="text-sm text-muted">Add your debt on the University Debt page first.</p>;
  return (
    <form noValidate className="space-y-4" onSubmit={handleSubmit((v) => run(() => payDebt({ ...v, accountId: nul(v.accountId) }), { onSuccess: () => onDone?.() }))}>
      <FormGrid>
        {debts.length > 1 && (
          <Field label="Debt" htmlFor="dp-debt" className="sm:col-span-2">
            <Select id="dp-debt" {...register("debtId")}>
              {debts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Amount paid" error={err(e, "amount")} htmlFor="dp-amount">
          <MoneyInput id="dp-amount" currency={debt?.currency} {...register("amount")} />
        </Field>
        <Field label="Date" error={err(e, "date")} htmlFor="dp-date">
          <Input id="dp-date" type="date" {...register("date")} />
        </Field>
        {record && (
          <Field label="Paid from" error={err(e, "accountId")} htmlFor="dp-acc" className="sm:col-span-2">
            <AccountSelect id="dp-acc" {...register("accountId")} />
          </Field>
        )}
      </FormGrid>
      {record && debt && <FxField from={debt.currency} accountId={watch("accountId")} amount={watch("amount") as string} register={register("fxRate")} />}
      <CheckboxRow
        label="Take this money out of the account"
        description="The payment lowers the debt and also leaves your account (counted only once)."
        {...register("recordOutflow")}
      />
      <Field label="Note (optional)" htmlFor="dp-note">
        <Input id="dp-note" {...register("note")} />
      </Field>
      <Submit pending={pending}>Record payment</Submit>
    </form>
  );
}

export function DebtEventForm({ debtId, currency, onDone }: { debtId: string; currency: Currency; onDone?: () => void }) {
  const app = useApp();
  const { pending, run } = useServerAction();
  const { register, handleSubmit, formState } = useForm({
    resolver: zodResolver(debtEventSchema),
    defaultValues: { debtId, type: "increment" as const, amount: "", date: app.today, note: "" },
  });
  const e = formState.errors as Errors;
  return (
    <form noValidate className="space-y-4" onSubmit={handleSubmit((v) => run(() => addDebtEvent(v), { onSuccess: () => onDone?.() }))}>
      <FormGrid>
        <Field label="Type" htmlFor="de-type">
          <Select id="de-type" {...register("type")}>
            <option value="increment">Extra charge</option>
            <option value="adjustment">Correction (+ or −)</option>
          </Select>
        </Field>
        <Field label="Amount" error={err(e, "amount")} htmlFor="de-amount" hint="Corrections can be negative (e.g. a discount).">
          <MoneyInput id="de-amount" currency={currency} {...register("amount")} />
        </Field>
        <Field label="Date" error={err(e, "date")} htmlFor="de-date">
          <Input id="de-date" type="date" {...register("date")} />
        </Field>
        <Field label="Note (optional)" htmlFor="de-note">
          <Input id="de-note" {...register("note")} />
        </Field>
      </FormGrid>
      <Submit pending={pending}>Add to history</Submit>
    </form>
  );
}

// ---------------------------------------------------------------------------
export interface GoalInitial {
  id?: string;
  name?: string;
  kind?: string;
  targetAmount?: string;
  currency?: Currency;
  deadline?: string | null;
  priority?: string;
  monthlyContribution?: string;
  notes?: string | null;
}
export function GoalForm({ initial, onDone }: { initial?: GoalInitial; onDone?: () => void }) {
  const app = useApp();
  const { pending, run } = useServerAction();
  const { register, handleSubmit, watch, formState } = useForm({
    resolver: zodResolver(goalSchema),
    defaultValues: {
      name: initial?.name ?? "",
      kind: (initial?.kind as never) ?? "emergency",
      targetAmount: initial?.targetAmount ?? "",
      currency: initial?.currency ?? app.baseCurrency,
      deadline: initial?.deadline ?? "",
      priority: (initial?.priority as never) ?? "medium",
      monthlyContribution: initial?.monthlyContribution ?? "0",
      initialSaved: "",
      notes: initial?.notes ?? "",
    },
  });
  const e = formState.errors as Errors;
  const cur = watch("currency") as Currency;
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={handleSubmit((v) => run(() => (initial?.id ? updateGoal({ ...v, id: initial.id }) : createGoal(v)), { onSuccess: () => onDone?.() }))}
    >
      <Field label="Goal name" error={err(e, "name")} htmlFor="goal-name">
        <Input id="goal-name" placeholder="e.g. Emergency fund" {...register("name")} />
      </Field>
      <FormGrid>
        <Field label="Type" htmlFor="goal-kind">
          <Select id="goal-kind" {...register("kind")}>
            {GOAL_KINDS.map((k) => (
              <option key={k} value={k}>
                {GOAL_KIND_LABELS[k]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Priority" htmlFor="goal-pri">
          <Select id="goal-pri" {...register("priority")}>
            {(["high", "medium", "low"] as const).map((p) => (
              <option key={p} value={p}>
                {GOAL_PRIORITY_LABELS[p]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Target amount" error={err(e, "targetAmount")} htmlFor="goal-target">
          <MoneyInput id="goal-target" currency={cur} {...register("targetAmount")} />
        </Field>
        <Field label="Currency" htmlFor="goal-cur">
          <CurrencySelect id="goal-cur" {...register("currency")} />
        </Field>
        {!initial?.id && (
          <Field label="Already saved" error={err(e, "initialSaved")} htmlFor="goal-saved">
            <MoneyInput id="goal-saved" currency={cur} {...register("initialSaved")} />
          </Field>
        )}
        <Field label="Plan to save per month" error={err(e, "monthlyContribution")} htmlFor="goal-monthly">
          <MoneyInput id="goal-monthly" currency={cur} {...register("monthlyContribution")} />
        </Field>
        <Field label="Target date (optional)" htmlFor="goal-deadline">
          <Input id="goal-deadline" type="date" {...register("deadline")} />
        </Field>
      </FormGrid>
      <Field label="Notes (optional)" htmlFor="goal-notes">
        <Textarea id="goal-notes" rows={2} {...register("notes")} />
      </Field>
      <Submit pending={pending}>{initial?.id ? "Save" : "Create goal"}</Submit>
    </form>
  );
}

export function ContributionForm({ goalId, currency, onDone }: { goalId: string; currency: Currency; onDone?: () => void }) {
  const app = useApp();
  const { pending, run } = useServerAction();
  const { register, handleSubmit, formState } = useForm({
    resolver: zodResolver(contributionSchema),
    defaultValues: { goalId, amount: "", date: app.today, note: "" },
  });
  const e = formState.errors as Errors;
  return (
    <form noValidate className="space-y-4" onSubmit={handleSubmit((v) => run(() => addContribution(v), { onSuccess: () => onDone?.() }))}>
      <FormGrid>
        <Field label="Amount" error={err(e, "amount")} htmlFor="ct-amount" hint="Use a negative number to take money out.">
          <MoneyInput id="ct-amount" currency={currency} {...register("amount")} />
        </Field>
        <Field label="Date" htmlFor="ct-date">
          <Input id="ct-date" type="date" {...register("date")} />
        </Field>
      </FormGrid>
      <Field label="Note (optional)" htmlFor="ct-note">
        <Input id="ct-note" {...register("note")} />
      </Field>
      <Submit pending={pending}>Add to goal</Submit>
    </form>
  );
}

export function BudgetForm({ category, amount, onDone, lockCategory }: { category?: string; amount?: string; onDone?: () => void; lockCategory?: boolean }) {
  const app = useApp();
  const { pending, run } = useServerAction();
  const { register, handleSubmit, formState } = useForm({
    resolver: zodResolver(budgetSchema),
    defaultValues: { category: (category as never) ?? "food", amount: amount ?? "" },
  });
  const e = formState.errors as Errors;
  return (
    <form noValidate className="space-y-4" onSubmit={handleSubmit((v) => run(() => upsertBudget(v), { onSuccess: () => onDone?.() }))}>
      <FormGrid>
        <Field label="Category" htmlFor="bg-cat">
          {lockCategory ? (
            <>
              <input type="hidden" {...register("category")} />
              <Input id="bg-cat" value={CATEGORY_LABELS[category ?? ""] ?? category} readOnly />
            </>
          ) : (
            <CategorySelect id="bg-cat" kind="expense" {...register("category")} />
          )}
        </Field>
        <Field label={`Monthly limit (${app.baseCurrency})`} error={err(e, "amount")} htmlFor="bg-amount">
          <MoneyInput id="bg-amount" currency={app.baseCurrency} {...register("amount")} />
        </Field>
      </FormGrid>
      <Submit pending={pending}>Save limit</Submit>
    </form>
  );
}
