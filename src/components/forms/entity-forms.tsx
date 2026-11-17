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
      <Field label="Nome da conta" error={err(e, "name")} htmlFor="acc-name">
        <Input id="acc-name" placeholder="Ex.: Chase Checking, Nubank" {...register("name")} />
      </Field>
      <FormGrid>
        <Field label="Tipo" htmlFor="acc-type">
          <Select id="acc-type" {...register("type")}>
            {ACCOUNT_TYPES.map((t) => (
              <option key={t} value={t}>
                {ACCOUNT_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Moeda" htmlFor="acc-cur">
          <CurrencySelect id="acc-cur" {...register("currency")} />
        </Field>
        <Field
          label={
            <>
              Saldo inicial
              <InfoTip>Quanto havia na conta na data abaixo. Movimentações anteriores a essa data não alteram o saldo de novo.</InfoTip>
            </>
          }
          error={err(e, "openingBalance")}
          htmlFor="acc-bal"
          hint="Cartão de crédito com fatura? Use valor negativo."
        >
          <MoneyInput id="acc-bal" currency={watch("currency") as Currency} {...register("openingBalance")} />
        </Field>
        <Field label="Saldo em" error={err(e, "openingDate")} htmlFor="acc-date">
          <Input id="acc-date" type="date" {...register("openingDate")} />
        </Field>
      </FormGrid>
      <CheckboxRow
        label="Conta no dinheiro disponível"
        description="Desmarque para poupança/investimentos que você não usa no dia a dia."
        {...register("includeInAvailable")}
      />
      <Submit pending={pending}>{initial?.id ? "Salvar" : "Criar conta"}</Submit>
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
      <Field label="Nome" error={err(e, "name")} htmlFor="src-name">
        <Input id="src-name" placeholder="Ex.: Bolsa de estudos" {...register("name")} />
      </Field>
      <FormGrid>
        <Field label="Valor" error={err(e, "amount")} htmlFor="src-amount">
          <MoneyInput id="src-amount" currency={watch("currency") as Currency} {...register("amount")} />
        </Field>
        <Field label="Moeda" htmlFor="src-cur">
          <CurrencySelect id="src-cur" {...register("currency")} />
        </Field>
        <Field label="Categoria" htmlFor="src-cat">
          <CategorySelect id="src-cat" kind="income" {...register("category")} />
        </Field>
        <Field label="Frequência" htmlFor="src-freq">
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
            <Field label="A cada" error={err(e, "customInterval")} htmlFor="src-int">
              <Input id="src-int" type="number" min={1} max={365} {...register("customInterval")} />
            </Field>
            <Field label="Unidade" htmlFor="src-unit">
              <Select id="src-unit" {...register("customUnit")}>
                <option value="">Escolha</option>
                <option value="day">dias</option>
                <option value="week">semanas</option>
                <option value="month">meses</option>
              </Select>
            </Field>
          </>
        )}
        <Field label={freq === "once" ? "Data de recebimento" : "Primeiro / próximo recebimento"} error={err(e, "startDate")} htmlFor="src-start">
          <Input id="src-start" type="date" {...register("startDate")} />
        </Field>
        {freq !== "once" && (
          <Field label="Termina em (opcional)" error={err(e, "endDate")} htmlFor="src-end">
            <Input id="src-end" type="date" {...register("endDate")} />
          </Field>
        )}
        <Field label="Conta de destino" htmlFor="src-acc" className="sm:col-span-2">
          <AccountSelect id="src-acc" allowEmpty="Definir ao receber" {...register("accountId")} />
        </Field>
      </FormGrid>
      <Field label="Observações" htmlFor="src-notes">
        <Textarea id="src-notes" rows={2} {...register("notes")} />
      </Field>
      {!initial?.id && (
        <CheckboxRow
          label="Já recebi o primeiro valor"
          description="Registra o recebimento na conta de destino na data informada."
          {...register("receivedNow")}
        />
      )}
      <p className="text-xs text-muted">Receitas futuras aparecem nas projeções, mas só entram no saldo real quando você confirma o recebimento.</p>
      <Submit pending={pending}>{initial?.id ? "Salvar" : "Cadastrar receita"}</Submit>
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
        <Field label="Valor recebido" error={err(e, "amount")} htmlFor="rcv-amount" hint="Ajuste se caiu um valor diferente do previsto.">
          <MoneyInput id="rcv-amount" currency={currency} {...register("amount")} />
        </Field>
        <Field label="Data em que caiu" error={err(e, "date")} htmlFor="rcv-date">
          <Input id="rcv-date" type="date" {...register("date")} />
        </Field>
        <Field label="Conta de destino" error={err(e, "accountId")} htmlFor="rcv-acc" className="sm:col-span-2">
          <AccountSelect id="rcv-acc" {...register("accountId")} />
        </Field>
      </FormGrid>
      <FxField from={currency} accountId={watch("accountId")} amount={watch("amount") as string} register={register("fxRate")} />
      <Submit pending={pending}>Confirmar recebimento</Submit>
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
      <Field label="Nome da conta" error={err(e, "name")} htmlFor="bill-name">
        <Input id="bill-name" placeholder="Ex.: Aluguel, Internet, Telefone" {...register("name")} />
      </Field>
      <FormGrid>
        <Field label="Valor total" error={err(e, "amount")} htmlFor="bill-amount">
          <MoneyInput id="bill-amount" currency={cur} {...register("amount")} />
        </Field>
        <Field label="Moeda" htmlFor="bill-cur">
          <CurrencySelect id="bill-cur" {...register("currency")} />
        </Field>
        <Field label={initial?.id ? "Data de vencimento (referência)" : "Próximo vencimento"} error={err(e, "firstDueDate")} htmlFor="bill-due">
          <Input id="bill-due" type="date" {...register("firstDueDate")} />
        </Field>
        <Field label="Recorrência" htmlFor="bill-rec">
          <Select id="bill-rec" {...register("recurrence")}>
            {BILL_RECURRENCES.map((r) => (
              <option key={r} value={r}>
                {FREQUENCY_LABELS[r]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Categoria" htmlFor="bill-cat">
          <CategorySelect id="bill-cat" kind="expense" {...register("category")} />
        </Field>
        <Field
          label={
            <>
              Prioridade
              <InfoTip>
                Essencial: moradia, alimentação, saúde, transporte, educação. Importante: telefone, internet, obrigações. Opcional: pode ser adiada.
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
        <Field label="Multa por atraso (fixa)" error={err(e, "lateFee")} htmlFor="bill-fee">
          <MoneyInput id="bill-fee" currency={cur} {...register("lateFee")} />
        </Field>
        <Field
          label={
            <>
              Juros por atraso (% a.a.)
              <InfoTip>Taxa anual cobrada sobre o valor em atraso, se a empresa informar. Usada para estimar o custo de atrasar.</InfoTip>
            </>
          }
          error={err(e, "interestRate")}
          htmlFor="bill-int"
        >
          <Input id="bill-int" inputMode="decimal" {...register("interestRate")} />
        </Field>
        <Field label="Valor mínimo permitido (opcional)" error={err(e, "minimumAmount")} htmlFor="bill-min">
          <MoneyInput id="bill-min" currency={cur} {...register("minimumAmount")} />
        </Field>
        <Field label="Termina em (opcional)" error={err(e, "endDate")} htmlFor="bill-end">
          <Input id="bill-end" type="date" {...register("endDate")} />
        </Field>
        <Field label="Pagar normalmente com" htmlFor="bill-acc" className="sm:col-span-2">
          <AccountSelect id="bill-acc" allowEmpty="Escolher no pagamento" {...register("accountId")} />
        </Field>
      </FormGrid>
      <CheckboxRow label="Aceita pagamento parcial" description="Permite pagar parte do valor (ex.: cartão, faculdade parcelada)." {...register("allowsPartial")} />
      <Field label="Observações" htmlFor="bill-notes">
        <Textarea id="bill-notes" rows={2} {...register("notes")} />
      </Field>
      {initial?.id && <p className="text-xs text-muted">Vencimentos futuros ainda sem pagamento serão recalculados com os novos dados.</p>}
      <Submit pending={pending}>{initial?.id ? "Salvar" : "Cadastrar conta"}</Submit>
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
        <Field label="Valor pago" error={err(e, "amount")} htmlFor="bp-amount" hint={allowsPartial ? "Pagamento parcial permitido." : "Esta conta exige o valor integral."}>
          <MoneyInput id="bp-amount" currency={currency} readOnly={!allowsPartial} {...register("amount")} />
        </Field>
        <Field label="Data do pagamento" error={err(e, "date")} htmlFor="bp-date">
          <Input id="bp-date" type="date" {...register("date")} />
        </Field>
        {record && (
          <>
            <Field label="Conta usada" error={err(e, "accountId")} htmlFor="bp-acc">
              <AccountSelect id="bp-acc" {...register("accountId")} />
            </Field>
            <Field label="Forma de pagamento" htmlFor="bp-pm">
              <PaymentMethodSelect id="bp-pm" {...register("paymentMethod")} />
            </Field>
          </>
        )}
      </FormGrid>
      {record && <FxField from={currency} accountId={watch("accountId")} amount={watch("amount") as string} register={register("fxRate")} />}
      <CheckboxRow
        label="Registrar a saída de dinheiro da conta"
        description="Desmarque apenas para pagamentos antigos, já refletidos no saldo inicial."
        {...register("recordOutflow")}
      />
      <p className="text-xs text-muted">A Isabelle Wallet apenas registra o pagamento. Nenhum dinheiro é movimentado de verdade.</p>
      <Submit pending={pending}>Registrar pagamento</Submit>
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
        <Field label="Valor deste vencimento" error={err(e, "amountDue")} htmlFor="oc-amount" hint="Útil para contas com valor variável ou multa aplicada.">
          <MoneyInput id="oc-amount" currency={currency} {...register("amountDue")} />
        </Field>
        <Field label="Mínimo (opcional)" error={err(e, "minimumDue")} htmlFor="oc-min">
          <MoneyInput id="oc-min" currency={currency} {...register("minimumDue")} />
        </Field>
      </FormGrid>
      <CheckboxRow label="Dispensar este vencimento" description="Ex.: mês isento. Não entra mais nos totais." {...register("waived")} />
      <Field label="Observações" htmlFor="oc-notes">
        <Textarea id="oc-notes" rows={2} {...register("notes")} />
      </Field>
      <Submit pending={pending}>Salvar vencimento</Submit>
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
      <Field label="Nome" error={err(e, "name")} htmlFor="sub-name">
        <Input id="sub-name" placeholder="Ex.: Netflix, Spotify, iCloud" {...register("name")} />
      </Field>
      <FormGrid>
        <Field label="Valor por cobrança" error={err(e, "amount")} htmlFor="sub-amount">
          <MoneyInput id="sub-amount" currency={watch("currency") as Currency} {...register("amount")} />
        </Field>
        <Field label="Moeda" htmlFor="sub-cur">
          <CurrencySelect id="sub-cur" {...register("currency")} />
        </Field>
        <Field label="Ciclo" htmlFor="sub-cycle">
          <Select id="sub-cycle" {...register("billingCycle")}>
            {SUBSCRIPTION_CYCLES.map((c) => (
              <option key={c} value={c}>
                {FREQUENCY_LABELS[c]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Próxima cobrança" error={err(e, "nextChargeDate")} htmlFor="sub-next">
          <Input id="sub-next" type="date" {...register("nextChargeDate")} />
        </Field>
        <Field label="Categoria" htmlFor="sub-cat">
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
        <Field label="Cobrada na conta" htmlFor="sub-acc">
          <AccountSelect id="sub-acc" allowEmpty="Não definida" {...register("accountId")} />
        </Field>
        <Field
          label={
            <>
              Último uso (opcional)
              <InfoTip>Só sinalizamos “pouco uso” quando você informa a data de uso. Nada é presumido.</InfoTip>
            </>
          }
          htmlFor="sub-used"
        >
          <Input id="sub-used" type="date" {...register("lastUsedOn")} />
        </Field>
      </FormGrid>
      <Field label="Observações" htmlFor="sub-notes">
        <Textarea id="sub-notes" rows={2} {...register("notes")} />
      </Field>
      <Submit pending={pending}>{initial?.id ? "Salvar" : "Cadastrar assinatura"}</Submit>
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
        <Field label="Valor cobrado" error={err(e, "amount")} htmlFor="sc-amount">
          <MoneyInput id="sc-amount" currency={currency} {...register("amount")} />
        </Field>
        <Field label="Data" error={err(e, "date")} htmlFor="sc-date">
          <Input id="sc-date" type="date" {...register("date")} />
        </Field>
        <Field label="Conta" error={err(e, "accountId")} htmlFor="sc-acc" className="sm:col-span-2">
          <AccountSelect id="sc-acc" {...register("accountId")} />
        </Field>
      </FormGrid>
      <FxField from={currency} accountId={watch("accountId")} amount={watch("amount") as string} register={register("fxRate")} />
      <Submit pending={pending}>Registrar cobrança</Submit>
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
      name: initial?.name ?? "Empréstimo universitário",
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
        <Field label="Nome" error={err(e, "name")} htmlFor="debt-name" className="sm:col-span-2">
          <Input id="debt-name" {...register("name")} />
        </Field>
        <Field label="Saldo atual da dívida" error={err(e, "initialBalance")} htmlFor="debt-bal" hint="Quanto você deve hoje (ou na data inicial).">
          <MoneyInput id="debt-bal" currency={cur} {...register("initialBalance")} />
        </Field>
        <Field label="Moeda da dívida" htmlFor="debt-cur">
          <CurrencySelect id="debt-cur" {...register("currency")} />
        </Field>
        <Field label="Data desse saldo (data inicial)" error={err(e, "startDate")} htmlFor="debt-start">
          <Input id="debt-start" type="date" {...register("startDate")} />
        </Field>
      </FormGrid>
      <div className="rounded-2xl border border-pink-100 bg-pink-50/60 p-4">
        <p className="mb-3 text-sm font-semibold text-ink">Acréscimo semestral da faculdade</p>
        <FormGrid>
          <Field
            label={
              <>
                Valor do acréscimo
                <InfoTip>Valor adicionado à dívida a cada período (ex.: 5.500 por semestre). É tratado como novo acréscimo, separado de juros.</InfoTip>
              </>
            }
            error={err(e, "incrementAmount")}
            htmlFor="debt-inc"
          >
            <MoneyInput id="debt-inc" currency={cur} {...register("incrementAmount")} />
          </Field>
          <Field label="A cada (meses)" error={err(e, "incrementIntervalMonths")} htmlFor="debt-int" hint="6 = semestral">
            <Input id="debt-int" type="number" min={1} max={24} {...register("incrementIntervalMonths")} />
          </Field>
          <Field label="Próxima data de acréscimo" error={err(e, "incrementAnchorDate")} htmlFor="debt-anchor">
            <Input id="debt-anchor" type="date" {...register("incrementAnchorDate")} />
          </Field>
          <Field
            label={
              <>
                Último acréscimo em (opcional)
                <InfoTip>Ex.: o semestre da formatura. Sem essa data, a projeção considera acréscimos para sempre.</InfoTip>
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
              Juros (% ao ano)
              <InfoTip>Deixe 0 se o empréstimo não cobra juros. Quando informado, os juros são lançados no fim de cada mês.</InfoTip>
            </>
          }
          error={err(e, "interestRate")}
          htmlFor="debt-rate"
        >
          <Input id="debt-rate" inputMode="decimal" {...register("interestRate")} />
        </Field>
        <Field label="Juros contam a partir de (opcional)" htmlFor="debt-since">
          <Input id="debt-since" type="date" {...register("interestSince")} />
        </Field>
        <Field label="Pagamento mensal planejado" error={err(e, "plannedMonthlyPayment")} htmlFor="debt-plan">
          <MoneyInput id="debt-plan" currency={cur} {...register("plannedMonthlyPayment")} />
        </Field>
        <Field label="Dia do pagamento" error={err(e, "paymentDay")} htmlFor="debt-day">
          <Input id="debt-day" type="number" min={1} max={28} {...register("paymentDay")} />
        </Field>
        <Field label="Prazo desejado para quitar (opcional)" htmlFor="debt-target" className="sm:col-span-2">
          <Input id="debt-target" type="date" {...register("targetPayoffDate")} />
        </Field>
      </FormGrid>
      <Field label="Observações" htmlFor="debt-notes">
        <Textarea id="debt-notes" rows={2} {...register("notes")} />
      </Field>
      <Submit pending={pending}>{initial?.id ? "Salvar configuração" : "Cadastrar dívida"}</Submit>
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
  if (!debts.length) return <p className="text-sm text-muted">Cadastre sua dívida em University Debt Manager primeiro.</p>;
  return (
    <form noValidate className="space-y-4" onSubmit={handleSubmit((v) => run(() => payDebt({ ...v, accountId: nul(v.accountId) }), { onSuccess: () => onDone?.() }))}>
      <FormGrid>
        {debts.length > 1 && (
          <Field label="Dívida" htmlFor="dp-debt" className="sm:col-span-2">
            <Select id="dp-debt" {...register("debtId")}>
              {debts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Valor pago" error={err(e, "amount")} htmlFor="dp-amount">
          <MoneyInput id="dp-amount" currency={debt?.currency} {...register("amount")} />
        </Field>
        <Field label="Data" error={err(e, "date")} htmlFor="dp-date">
          <Input id="dp-date" type="date" {...register("date")} />
        </Field>
        {record && (
          <Field label="Conta de onde saiu" error={err(e, "accountId")} htmlFor="dp-acc" className="sm:col-span-2">
            <AccountSelect id="dp-acc" {...register("accountId")} />
          </Field>
        )}
      </FormGrid>
      {record && debt && <FxField from={debt.currency} accountId={watch("accountId")} amount={watch("amount") as string} register={register("fxRate")} />}
      <CheckboxRow
        label="Registrar como saída de dinheiro"
        description="O pagamento reduz a dívida e também sai da sua conta (contado uma única vez)."
        {...register("recordOutflow")}
      />
      <Field label="Observação" htmlFor="dp-note">
        <Input id="dp-note" {...register("note")} />
      </Field>
      <Submit pending={pending}>Registrar pagamento</Submit>
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
        <Field label="Tipo" htmlFor="de-type">
          <Select id="de-type" {...register("type")}>
            <option value="increment">Acréscimo manual</option>
            <option value="adjustment">Ajuste (+ ou −)</option>
          </Select>
        </Field>
        <Field label="Valor" error={err(e, "amount")} htmlFor="de-amount" hint="Ajustes podem ser negativos (ex.: desconto).">
          <MoneyInput id="de-amount" currency={currency} {...register("amount")} />
        </Field>
        <Field label="Data" error={err(e, "date")} htmlFor="de-date">
          <Input id="de-date" type="date" {...register("date")} />
        </Field>
        <Field label="Observação" htmlFor="de-note">
          <Input id="de-note" {...register("note")} />
        </Field>
      </FormGrid>
      <Submit pending={pending}>Adicionar ao histórico</Submit>
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
      <Field label="Nome da meta" error={err(e, "name")} htmlFor="goal-name">
        <Input id="goal-name" placeholder="Ex.: Reserva de emergência" {...register("name")} />
      </Field>
      <FormGrid>
        <Field label="Tipo" htmlFor="goal-kind">
          <Select id="goal-kind" {...register("kind")}>
            {GOAL_KINDS.map((k) => (
              <option key={k} value={k}>
                {GOAL_KIND_LABELS[k]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Prioridade" htmlFor="goal-pri">
          <Select id="goal-pri" {...register("priority")}>
            {(["high", "medium", "low"] as const).map((p) => (
              <option key={p} value={p}>
                {GOAL_PRIORITY_LABELS[p]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Valor desejado" error={err(e, "targetAmount")} htmlFor="goal-target">
          <MoneyInput id="goal-target" currency={cur} {...register("targetAmount")} />
        </Field>
        <Field label="Moeda" htmlFor="goal-cur">
          <CurrencySelect id="goal-cur" {...register("currency")} />
        </Field>
        {!initial?.id && (
          <Field label="Valor já acumulado" error={err(e, "initialSaved")} htmlFor="goal-saved">
            <MoneyInput id="goal-saved" currency={cur} {...register("initialSaved")} />
          </Field>
        )}
        <Field label="Contribuição mensal planejada" error={err(e, "monthlyContribution")} htmlFor="goal-monthly">
          <MoneyInput id="goal-monthly" currency={cur} {...register("monthlyContribution")} />
        </Field>
        <Field label="Data limite (opcional)" htmlFor="goal-deadline">
          <Input id="goal-deadline" type="date" {...register("deadline")} />
        </Field>
      </FormGrid>
      <Field label="Observações" htmlFor="goal-notes">
        <Textarea id="goal-notes" rows={2} {...register("notes")} />
      </Field>
      <Submit pending={pending}>{initial?.id ? "Salvar" : "Criar meta"}</Submit>
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
        <Field label="Valor" error={err(e, "amount")} htmlFor="ct-amount" hint="Use valor negativo para registrar uma retirada.">
          <MoneyInput id="ct-amount" currency={currency} {...register("amount")} />
        </Field>
        <Field label="Data" htmlFor="ct-date">
          <Input id="ct-date" type="date" {...register("date")} />
        </Field>
      </FormGrid>
      <Field label="Observação" htmlFor="ct-note">
        <Input id="ct-note" {...register("note")} />
      </Field>
      <Submit pending={pending}>Registrar contribuição</Submit>
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
        <Field label="Categoria" htmlFor="bg-cat">
          {lockCategory ? (
            <>
              <input type="hidden" {...register("category")} />
              <Input id="bg-cat" value={CATEGORY_LABELS[category ?? ""] ?? category} readOnly />
            </>
          ) : (
            <CategorySelect id="bg-cat" kind="expense" {...register("category")} />
          )}
        </Field>
        <Field label={`Limite mensal (${app.baseCurrency})`} error={err(e, "amount")} htmlFor="bg-amount">
          <MoneyInput id="bg-amount" currency={app.baseCurrency} {...register("amount")} />
        </Field>
      </FormGrid>
      <Submit pending={pending}>Salvar limite</Submit>
    </form>
  );
}
