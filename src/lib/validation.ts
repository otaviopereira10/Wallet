import { z } from "zod";
import {
  ACCOUNT_TYPES,
  BILL_RECURRENCES,
  CURRENCIES,
  EXPENSE_CATEGORIES,
  EXPENSE_RECURRENCES,
  GOAL_KINDS,
  INCOME_CATEGORIES,
  INCOME_FREQUENCIES,
  PAYMENT_METHODS,
  SUBSCRIPTION_CYCLES,
} from "./constants";
import { isISODate } from "./finance/dates";

/**
 * Shared validation schemas — used by the forms (React Hook Form) and again by
 * every Server Action. Text is trimmed and stripped of control characters.
 */
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
export const sanitize = (v: string) => v.replace(CONTROL, "").replace(/\s+/g, " ").trim();

export const text = (max: number, label = "Campo") =>
  z
    .string({ message: `${label} é obrigatório` })
    .transform(sanitize)
    .pipe(z.string().min(1, `${label} é obrigatório`).max(max, `${label}: máximo de ${max} caracteres`));

export const optionalText = (max: number) =>
  z
    .string()
    .optional()
    .nullable()
    .transform((v) => (v ? v.replace(CONTROL, "").trim() : ""))
    .pipe(z.string().max(max, `Máximo de ${max} caracteres`))
    .transform((v) => (v === "" ? null : v));

const MONEY_RE = /^-?\d{1,12}(\.\d{1,2})?$/;
const normalizeMoney = (v: string | number) => {
  let s = String(v).trim().replace(/\s/g, "");
  if (s.includes(",") && s.includes(".")) {
    s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else s = s.replace(",", ".");
  return s;
};

/** Positive money amount as a "1234.56" string. */
export const money = z
  .union([z.string(), z.number()], { message: "Informe um valor" })
  .transform(normalizeMoney)
  .refine((v) => v !== "", "Informe um valor")
  .refine((v) => MONEY_RE.test(v), "Valor inválido (use até 2 casas decimais)")
  .refine((v) => Number(v) > 0, "O valor deve ser maior que zero");

/** Money that may be zero (fees, buffers). */
export const moneyZero = z
  .union([z.string(), z.number()])
  .transform(normalizeMoney)
  .transform((v) => (v === "" ? "0" : v))
  .refine((v) => MONEY_RE.test(v), "Valor inválido (use até 2 casas decimais)")
  .refine((v) => Number(v) >= 0, "O valor não pode ser negativo");

/** Signed money (balances, adjustments). */
export const moneySigned = z
  .union([z.string(), z.number()])
  .transform(normalizeMoney)
  .transform((v) => (v === "" ? "0" : v))
  .refine((v) => MONEY_RE.test(v), "Valor inválido (use até 2 casas decimais)");

export const optionalMoney = z
  .union([z.string(), z.number()])
  .optional()
  .nullable()
  .transform((v) => (v === null || v === undefined || String(v).trim() === "" ? null : normalizeMoney(v)))
  .refine((v) => v === null || MONEY_RE.test(v), "Valor inválido")
  .refine((v) => v === null || Number(v) >= 0, "O valor não pode ser negativo");

export const rate = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).trim().replace(",", "."))
  .refine((v) => /^\d{1,8}(\.\d{1,8})?$/.test(v) && Number(v) > 0, "Taxa inválida");

const emptyToNull = (v: unknown) => (v === "" || v === undefined ? null : v);
/** Optional exchange rate: empty → null (use the latest stored rate). */
export const optionalRate = z.preprocess(emptyToNull, rate.nullable());
const optionalEnum = <T extends readonly [string, ...string[]]>(values: T) => z.preprocess(emptyToNull, z.enum(values).nullable());

export const percent = z
  .union([z.string(), z.number()])
  .optional()
  .transform((v) => (v === undefined || String(v).trim() === "" ? "0" : String(v).trim().replace(",", ".")))
  .refine((v) => /^\d{1,3}(\.\d{1,4})?$/.test(v), "Percentual inválido");

export const isoDate = z
  .string({ message: "Informe a data" })
  .trim()
  .refine((v) => isISODate(v), "Data inválida");

export const optionalDate = z
  .string()
  .optional()
  .nullable()
  .transform((v) => (v && v.trim() ? v.trim() : null))
  .refine((v) => v === null || isISODate(v), "Data inválida");

export const uuid = z.string().uuid("Identificador inválido");
export const optionalUuid = z
  .string()
  .optional()
  .nullable()
  .transform((v) => (v && v.trim() ? v.trim() : null))
  .refine((v) => v === null || z.string().uuid().safeParse(v).success, "Identificador inválido");

export const currency = z.enum(CURRENCIES, { message: "Moeda inválida" });
export const expenseCategory = z.enum(EXPENSE_CATEGORIES, { message: "Categoria inválida" });
export const incomeCategory = z.enum(INCOME_CATEGORIES, { message: "Categoria inválida" });
const bool = z.union([z.boolean(), z.literal("on"), z.literal("true"), z.literal("false")]).transform((v) => v === true || v === "on" || v === "true");

// ---------------------------------------------------------------------------
export const accountSchema = z.object({
  name: text(80, "Nome"),
  type: z.enum(ACCOUNT_TYPES),
  currency,
  openingBalance: moneySigned,
  openingDate: isoDate,
  includeInAvailable: bool.default(true),
});

export const incomeSchema = z
  .object({
    name: text(120, "Nome"),
    amount: money,
    currency,
    category: incomeCategory,
    startDate: isoDate,
    frequency: z.enum(INCOME_FREQUENCIES),
    customInterval: z.preprocess(emptyToNull, z.coerce.number().int().min(1, "Mínimo 1").max(365).nullable()),
    customUnit: optionalEnum(["day", "week", "month"] as const),
    endDate: optionalDate,
    accountId: optionalUuid,
    notes: optionalText(1000),
    receivedNow: bool.default(false),
  })
  .refine((v) => v.frequency !== "custom" || (v.customInterval && v.customUnit), {
    message: "Defina o intervalo da recorrência personalizada",
    path: ["customInterval"],
  })
  .refine((v) => !v.endDate || v.endDate >= v.startDate, { message: "A data final deve ser depois do início", path: ["endDate"] });

export const receiveIncomeSchema = z.object({
  incomeId: uuid,
  occurrence: isoDate,
  date: isoDate,
  amount: money,
  accountId: uuid,
  fxRate: optionalRate,
});

export const skipIncomeSchema = z.object({ incomeId: uuid, occurrence: isoDate });

export const expenseSchema = z
  .object({
    description: text(200, "Nome da compra"),
    amount: money,
    currency,
    category: expenseCategory,
    date: isoDate,
    paymentMethod: optionalEnum(PAYMENT_METHODS),
    accountId: optionalUuid,
    status: z.enum(["paid", "pending"]),
    recurrence: z.enum(EXPENSE_RECURRENCES).default("none"),
    notes: optionalText(1000),
    fxRate: optionalRate,
  })
  .refine((v) => v.status === "pending" || v.accountId, { message: "Escolha a conta utilizada", path: ["accountId"] });

export const incomeTxSchema = z.object({
  description: text(200, "Descrição"),
  amount: money,
  currency,
  category: incomeCategory,
  date: isoDate,
  accountId: uuid,
  notes: optionalText(1000),
  fxRate: optionalRate,
});

export const transferSchema = z
  .object({
    fromAccountId: uuid,
    toAccountId: uuid,
    amount: money,
    toAmount: optionalMoney,
    date: isoDate,
    description: optionalText(200),
  })
  .refine((v) => v.fromAccountId !== v.toAccountId, { message: "Escolha contas diferentes", path: ["toAccountId"] });

export const refundSchema = z.object({
  refundOf: optionalUuid,
  description: text(200, "Descrição"),
  amount: money,
  currency,
  category: expenseCategory,
  date: isoDate,
  accountId: uuid,
  fxRate: optionalRate,
});

export const billSchema = z
  .object({
    name: text(120, "Nome da conta"),
    amount: money,
    minimumAmount: optionalMoney,
    currency,
    category: expenseCategory,
    priority: z.enum(["essential", "important", "optional"]),
    recurrence: z.enum(BILL_RECURRENCES),
    firstDueDate: isoDate,
    endDate: optionalDate,
    lateFee: moneyZero.default("0"),
    interestRate: percent,
    allowsPartial: bool.default(false),
    accountId: optionalUuid,
    notes: optionalText(1000),
  })
  .refine((v) => v.minimumAmount === null || Number(v.minimumAmount) <= Number(v.amount), {
    message: "O mínimo não pode ser maior que o valor total",
    path: ["minimumAmount"],
  });

export const billPaymentSchema = z.object({
  occurrenceId: uuid,
  amount: money,
  date: isoDate,
  accountId: optionalUuid,
  paymentMethod: optionalEnum(PAYMENT_METHODS),
  recordOutflow: bool.default(true),
  fxRate: optionalRate,
});

export const occurrenceUpdateSchema = z.object({
  occurrenceId: uuid,
  amountDue: money,
  minimumDue: optionalMoney,
  waived: bool.default(false),
  notes: optionalText(500),
});

export const subscriptionSchema = z.object({
  name: text(120, "Nome"),
  amount: money,
  currency,
  billingCycle: z.enum(SUBSCRIPTION_CYCLES),
  nextChargeDate: isoDate,
  category: expenseCategory.default("subscriptions"),
  accountId: optionalUuid,
  status: z.enum(["active", "cancel_planned", "cancelled"]).default("active"),
  lastUsedOn: optionalDate,
  usageNote: optionalText(300),
  notes: optionalText(1000),
});

export const subscriptionChargeSchema = z.object({
  subscriptionId: uuid,
  date: isoDate,
  amount: money,
  accountId: uuid,
  fxRate: optionalRate,
});

export const debtSchema = z.object({
  name: text(120, "Nome"),
  currency,
  initialBalance: moneyZero,
  startDate: isoDate,
  incrementAmount: moneyZero,
  incrementIntervalMonths: z.coerce.number().int().min(1).max(24),
  incrementAnchorDate: optionalDate,
  incrementsEndDate: optionalDate,
  interestRate: percent,
  interestSince: optionalDate,
  plannedMonthlyPayment: moneyZero,
  paymentDay: z.coerce.number().int().min(1).max(28),
  targetPayoffDate: optionalDate,
  notes: optionalText(1000),
});

export const debtPaymentSchema = z.object({
  debtId: uuid,
  amount: money,
  date: isoDate,
  accountId: optionalUuid,
  recordOutflow: bool.default(true),
  note: optionalText(300),
  fxRate: optionalRate,
});

export const debtEventSchema = z.object({
  debtId: uuid,
  type: z.enum(["increment", "adjustment"]),
  amount: moneySigned.refine((v) => Number(v) !== 0, "O valor não pode ser zero"),
  date: isoDate,
  note: optionalText(300),
});

export const goalSchema = z.object({
  name: text(120, "Nome"),
  kind: z.enum(GOAL_KINDS),
  targetAmount: money,
  currency,
  deadline: optionalDate,
  priority: z.enum(["high", "medium", "low"]),
  monthlyContribution: moneyZero,
  initialSaved: optionalMoney,
  notes: optionalText(1000),
});

export const contributionSchema = z.object({
  goalId: uuid,
  amount: moneySigned.refine((v) => Number(v) !== 0, "O valor não pode ser zero"),
  date: isoDate,
  note: optionalText(300),
});

export const budgetSchema = z.object({
  category: expenseCategory,
  amount: moneyZero,
});

export const profileSchema = z.object({
  displayName: optionalText(80),
  baseCurrency: currency,
  locale: z.enum(["pt-BR", "en-US"]),
  timezone: z.string().trim().min(1).max(64),
  theme: z.enum(["light", "dark", "system"]),
  emergencyBuffer: moneyZero,
  alertDaysAhead: z.coerce.number().int().min(0).max(30),
  aiEnabled: bool.default(false),
});

export const manualRateSchema = z.object({
  base: currency,
  quote: currency,
  rate,
  date: isoDate,
});

export const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email("E-mail inválido").max(254),
  password: z.string().min(8, "A senha precisa de pelo menos 8 caracteres").max(200),
});

export const passwordChangeSchema = z
  .object({
    current: z.string().min(1, "Informe a senha atual"),
    next: z.string().min(8, "A nova senha precisa de pelo menos 8 caracteres").max(200),
    confirm: z.string(),
  })
  .refine((v) => v.next === v.confirm, { message: "As senhas não conferem", path: ["confirm"] });

export type AccountInput = z.input<typeof accountSchema>;
export type ExpenseInput = z.input<typeof expenseSchema>;
