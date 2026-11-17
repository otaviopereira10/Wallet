/**
 * Domain types used by the pure financial engine.
 * - Money is always an integer number of minor units (cents) — `Cents`.
 * - Calendar dates are ISO strings "YYYY-MM-DD" — `ISODate` — with no time zone.
 */
export type Currency = "USD" | "BRL";
export type ISODate = string;
export type Cents = number;

export type AccountType = "checking" | "savings" | "cash" | "credit_card" | "investment" | "other";
export type TxKind = "income" | "expense" | "refund" | "transfer" | "debt_payment";
export type TxStatus = "paid" | "pending";
export type Priority = "essential" | "important" | "optional";
export type BillRecurrence = "once" | "weekly" | "biweekly" | "monthly" | "quarterly" | "semiannual" | "yearly";
export type ExpenseRecurrence = "none" | "weekly" | "biweekly" | "monthly" | "quarterly" | "semiannual" | "yearly";
export type IncomeFrequency = "once" | "weekly" | "biweekly" | "monthly" | "semiannual" | "yearly" | "custom";
export type CustomUnit = "day" | "week" | "month";
export type SubscriptionCycle = "weekly" | "monthly" | "quarterly" | "semiannual" | "yearly";
export type SubscriptionStatus = "active" | "cancel_planned" | "cancelled";
export type GoalPriority = "high" | "medium" | "low";
export type GoalKind = "emergency" | "travel" | "electronics" | "purchase" | "college" | "debt_payoff" | "other";
export type DebtEventType = "increment" | "interest" | "payment" | "adjustment";

export interface Profile {
  userId: string;
  displayName: string | null;
  baseCurrency: Currency;
  locale: "pt-BR" | "en-US";
  timezone: string;
  theme: "light" | "dark" | "system";
  emergencyBuffer: Cents;
  alertDaysAhead: number;
  aiEnabled: boolean;
  onboardingCompleted: boolean;
}

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  currency: Currency;
  openingBalance: Cents;
  openingDate: ISODate;
  includeInAvailable: boolean;
  archived: boolean;
}

export interface Income {
  id: string;
  name: string;
  amount: Cents;
  currency: Currency;
  category: string;
  startDate: ISODate;
  frequency: IncomeFrequency;
  customInterval: number | null;
  customUnit: CustomUnit | null;
  endDate: ISODate | null;
  accountId: string | null;
  skippedDates: ISODate[];
  notes: string | null;
  active: boolean;
  createdOn: ISODate;
}

export interface Transaction {
  id: string;
  kind: TxKind;
  status: TxStatus;
  date: ISODate;
  amount: Cents;
  currency: Currency;
  accountId: string | null;
  accountAmount: Cents | null;
  fxRate: string | null;
  toAccountId: string | null;
  toAmount: Cents | null;
  category: string | null;
  description: string;
  paymentMethod: string | null;
  notes: string | null;
  recurrence: ExpenseRecurrence;
  seriesId: string | null;
  incomeId: string | null;
  incomeOccurrence: ISODate | null;
  subscriptionId: string | null;
  debtId: string | null;
  refundOf: string | null;
  importHash: string | null;
  createdAt: string;
}

export interface Bill {
  id: string;
  name: string;
  amount: Cents;
  minimumAmount: Cents | null;
  currency: Currency;
  category: string;
  priority: Priority;
  recurrence: BillRecurrence;
  firstDueDate: ISODate;
  endDate: ISODate | null;
  lateFee: Cents;
  /** Annual late interest rate in percent (e.g. 24 = 24% a.a.). */
  interestRate: string;
  allowsPartial: boolean;
  accountId: string | null;
  notes: string | null;
  active: boolean;
}

export interface BillOccurrence {
  id: string;
  billId: string;
  dueDate: ISODate;
  amountDue: Cents;
  minimumDue: Cents | null;
  waived: boolean;
  notes: string | null;
}

export interface BillPayment {
  id: string;
  occurrenceId: string;
  date: ISODate;
  amount: Cents;
  transactionId: string | null;
}

export interface Subscription {
  id: string;
  name: string;
  amount: Cents;
  currency: Currency;
  billingCycle: SubscriptionCycle;
  nextChargeDate: ISODate;
  category: string;
  accountId: string | null;
  status: SubscriptionStatus;
  lastUsedOn: ISODate | null;
  usageNote: string | null;
  notes: string | null;
}

export interface Debt {
  id: string;
  name: string;
  currency: Currency;
  initialBalance: Cents;
  startDate: ISODate;
  incrementAmount: Cents;
  incrementIntervalMonths: number;
  incrementAnchorDate: ISODate | null;
  incrementsEndDate: ISODate | null;
  /** Annual interest rate in percent. "0" means no interest. */
  interestRate: string;
  interestSince: ISODate | null;
  plannedMonthlyPayment: Cents;
  paymentDay: number;
  targetPayoffDate: ISODate | null;
  notes: string | null;
  active: boolean;
}

export interface DebtEvent {
  id: string;
  debtId: string;
  date: ISODate;
  type: DebtEventType;
  /** Positive for increment/interest/payment, signed for adjustment. */
  amount: Cents;
  automatic: boolean;
  voided: boolean;
  transactionId: string | null;
  note: string | null;
}

export interface Goal {
  id: string;
  name: string;
  kind: GoalKind;
  targetAmount: Cents;
  currency: Currency;
  deadline: ISODate | null;
  priority: GoalPriority;
  monthlyContribution: Cents;
  notes: string | null;
  archived: boolean;
}

export interface GoalContribution {
  id: string;
  goalId: string;
  date: ISODate;
  amount: Cents;
  note: string | null;
}

export interface Budget {
  id: string;
  category: string;
  amount: Cents;
  currency: Currency;
}

export interface FxRate {
  base: Currency;
  quote: Currency;
  /** Decimal string, e.g. "5.43210000" = 1 base costs 5.4321 quote. */
  rate: string;
  rateDate: ISODate;
  source: string;
  isManual: boolean;
  fetchedAt: string;
}

/** Everything the engine needs to analyse one user's finances. */
export interface Snapshot {
  today: ISODate;
  profile: Profile;
  accounts: Account[];
  incomes: Income[];
  transactions: Transaction[];
  bills: Bill[];
  occurrences: BillOccurrence[];
  billPayments: BillPayment[];
  subscriptions: Subscription[];
  debts: Debt[];
  debtEvents: DebtEvent[];
  goals: Goal[];
  contributions: GoalContribution[];
  budgets: Budget[];
  fxRates: FxRate[];
}
