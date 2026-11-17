import "server-only";
import { toCents, toCentsOrNull } from "@/lib/finance/money";
import type {
  Account,
  Bill,
  BillOccurrence,
  BillPayment,
  Budget,
  Debt,
  DebtEvent,
  FxRate,
  Goal,
  GoalContribution,
  Income,
  Profile,
  Subscription,
  Transaction,
} from "@/lib/finance/types";

type Row = Record<string, unknown>;
const s = (v: unknown) => (v === null || v === undefined ? null : String(v));
const str = (v: unknown) => String(v);
const date = (v: unknown) => (v === null || v === undefined ? null : String(v).slice(0, 10));
const ts = (v: unknown) => (v === null || v === undefined ? "" : v instanceof Date ? v.toISOString() : String(v));
const num = (v: unknown) => (v === null || v === undefined ? null : String(v));

export const mapProfile = (r: Row): Profile => ({
  userId: str(r.user_id),
  displayName: s(r.display_name),
  baseCurrency: r.base_currency as Profile["baseCurrency"],
  locale: r.locale as Profile["locale"],
  timezone: str(r.timezone),
  theme: r.theme as Profile["theme"],
  emergencyBuffer: toCents(num(r.emergency_buffer)),
  alertDaysAhead: Number(r.alert_days_ahead),
  aiEnabled: !!r.ai_enabled,
  onboardingCompleted: !!r.onboarding_completed,
});

export const mapAccount = (r: Row): Account => ({
  id: str(r.id),
  name: str(r.name),
  type: r.type as Account["type"],
  currency: r.currency as Account["currency"],
  openingBalance: toCents(num(r.opening_balance)),
  openingDate: date(r.opening_date)!,
  includeInAvailable: !!r.include_in_available,
  archived: !!r.archived,
});

export const mapIncome = (r: Row): Income => ({
  id: str(r.id),
  name: str(r.name),
  amount: toCents(num(r.amount)),
  currency: r.currency as Income["currency"],
  category: str(r.category),
  startDate: date(r.start_date)!,
  frequency: r.frequency as Income["frequency"],
  customInterval: r.custom_interval === null ? null : Number(r.custom_interval),
  customUnit: (r.custom_unit as Income["customUnit"]) ?? null,
  endDate: date(r.end_date),
  accountId: s(r.account_id),
  skippedDates: Array.isArray(r.skipped_dates) ? (r.skipped_dates as unknown[]).map((d) => String(d).slice(0, 10)) : [],
  notes: s(r.notes),
  active: !!r.active,
  createdOn: ts(r.created_at).slice(0, 10),
});

export const mapTransaction = (r: Row): Transaction => ({
  id: str(r.id),
  kind: r.kind as Transaction["kind"],
  status: r.status as Transaction["status"],
  date: date(r.date)!,
  amount: toCents(num(r.amount)),
  currency: r.currency as Transaction["currency"],
  accountId: s(r.account_id),
  accountAmount: toCentsOrNull(num(r.account_amount)),
  fxRate: num(r.fx_rate),
  toAccountId: s(r.to_account_id),
  toAmount: toCentsOrNull(num(r.to_amount)),
  category: s(r.category),
  description: str(r.description),
  paymentMethod: s(r.payment_method),
  notes: s(r.notes),
  recurrence: r.recurrence as Transaction["recurrence"],
  seriesId: s(r.series_id),
  incomeId: s(r.income_id),
  incomeOccurrence: date(r.income_occurrence),
  subscriptionId: s(r.subscription_id),
  debtId: s(r.debt_id),
  refundOf: s(r.refund_of),
  importHash: s(r.import_hash),
  createdAt: ts(r.created_at),
});

export const mapBill = (r: Row): Bill => ({
  id: str(r.id),
  name: str(r.name),
  amount: toCents(num(r.amount)),
  minimumAmount: toCentsOrNull(num(r.minimum_amount)),
  currency: r.currency as Bill["currency"],
  category: str(r.category),
  priority: r.priority as Bill["priority"],
  recurrence: r.recurrence as Bill["recurrence"],
  firstDueDate: date(r.first_due_date)!,
  endDate: date(r.end_date),
  lateFee: toCents(num(r.late_fee)),
  interestRate: num(r.interest_rate) ?? "0",
  allowsPartial: !!r.allows_partial,
  accountId: s(r.account_id),
  notes: s(r.notes),
  active: !!r.active,
});

export const mapOccurrence = (r: Row): BillOccurrence => ({
  id: str(r.id),
  billId: str(r.bill_id),
  dueDate: date(r.due_date)!,
  amountDue: toCents(num(r.amount_due)),
  minimumDue: toCentsOrNull(num(r.minimum_due)),
  waived: !!r.waived,
  notes: s(r.notes),
});

export const mapBillPayment = (r: Row): BillPayment => ({
  id: str(r.id),
  occurrenceId: str(r.occurrence_id),
  date: date(r.date)!,
  amount: toCents(num(r.amount)),
  transactionId: s(r.transaction_id),
});

export const mapSubscription = (r: Row): Subscription => ({
  id: str(r.id),
  name: str(r.name),
  amount: toCents(num(r.amount)),
  currency: r.currency as Subscription["currency"],
  billingCycle: r.billing_cycle as Subscription["billingCycle"],
  nextChargeDate: date(r.next_charge_date)!,
  category: str(r.category),
  accountId: s(r.account_id),
  status: r.status as Subscription["status"],
  lastUsedOn: date(r.last_used_on),
  usageNote: s(r.usage_note),
  notes: s(r.notes),
});

export const mapDebt = (r: Row): Debt => ({
  id: str(r.id),
  name: str(r.name),
  currency: r.currency as Debt["currency"],
  initialBalance: toCents(num(r.initial_balance)),
  startDate: date(r.start_date)!,
  incrementAmount: toCents(num(r.increment_amount)),
  incrementIntervalMonths: Number(r.increment_interval_months),
  incrementAnchorDate: date(r.increment_anchor_date),
  incrementsEndDate: date(r.increments_end_date),
  interestRate: num(r.interest_rate) ?? "0",
  interestSince: date(r.interest_since),
  plannedMonthlyPayment: toCents(num(r.planned_monthly_payment)),
  paymentDay: Number(r.payment_day),
  targetPayoffDate: date(r.target_payoff_date),
  notes: s(r.notes),
  active: !!r.active,
});

export const mapDebtEvent = (r: Row): DebtEvent => ({
  id: str(r.id),
  debtId: str(r.debt_id),
  date: date(r.date)!,
  type: r.type as DebtEvent["type"],
  amount: toCents(num(r.amount)),
  automatic: !!r.automatic,
  voided: !!r.voided,
  transactionId: s(r.transaction_id),
  note: s(r.note),
});

export const mapGoal = (r: Row): Goal => ({
  id: str(r.id),
  name: str(r.name),
  kind: r.kind as Goal["kind"],
  targetAmount: toCents(num(r.target_amount)),
  currency: r.currency as Goal["currency"],
  deadline: date(r.deadline),
  priority: r.priority as Goal["priority"],
  monthlyContribution: toCents(num(r.monthly_contribution)),
  notes: s(r.notes),
  archived: !!r.archived,
});

export const mapContribution = (r: Row): GoalContribution => ({
  id: str(r.id),
  goalId: str(r.goal_id),
  date: date(r.date)!,
  amount: toCents(num(r.amount)),
  note: s(r.note),
});

export const mapBudget = (r: Row): Budget => ({
  id: str(r.id),
  category: str(r.category),
  amount: toCents(num(r.amount)),
  currency: r.currency as Budget["currency"],
});

export const mapFxRate = (r: Row): FxRate => ({
  base: r.base as FxRate["base"],
  quote: r.quote as FxRate["quote"],
  rate: str(r.rate),
  rateDate: date(r.rate_date)!,
  source: str(r.source),
  isManual: !!r.is_manual,
  fetchedAt: ts(r.fetched_at),
});
