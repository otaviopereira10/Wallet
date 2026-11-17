import type {
  Account,
  Bill,
  BillOccurrence,
  BillPayment,
  Debt,
  DebtEvent,
  Goal,
  Income,
  Profile,
  Snapshot,
  Subscription,
  Transaction,
} from "@/lib/finance/types";

let seq = 0;
export const id = (p = "id") => `${p}-${++seq}`;

export function profile(over: Partial<Profile> = {}): Profile {
  return {
    userId: "user-1",
    displayName: "Isabelle",
    baseCurrency: "USD",
    locale: "pt-BR",
    timezone: "America/New_York",
    theme: "light",
    emergencyBuffer: 0,
    alertDaysAhead: 3,
    aiEnabled: false,
    onboardingCompleted: true,
    ...over,
  };
}

export function account(over: Partial<Account> = {}): Account {
  return {
    id: id("acc"),
    name: "Checking",
    type: "checking",
    currency: "USD",
    openingBalance: 0,
    openingDate: "2026-01-01",
    includeInAvailable: true,
    archived: false,
    ...over,
  };
}

export function tx(over: Partial<Transaction> & Pick<Transaction, "kind" | "amount" | "date">): Transaction {
  return {
    id: id("tx"),
    status: "paid",
    currency: "USD",
    accountId: null,
    accountAmount: over.accountAmount ?? (over.status === "pending" ? null : over.amount),
    fxRate: null,
    toAccountId: null,
    toAmount: null,
    category: null,
    description: "test",
    paymentMethod: null,
    notes: null,
    recurrence: "none",
    seriesId: null,
    incomeId: null,
    incomeOccurrence: null,
    subscriptionId: null,
    debtId: null,
    refundOf: null,
    importHash: null,
    createdAt: "2026-01-01T00:00:00Z",
    ...over,
  };
}

export function income(over: Partial<Income> = {}): Income {
  return {
    id: id("inc"),
    name: "Salário",
    amount: 200000,
    currency: "USD",
    category: "salary",
    startDate: "2026-01-01",
    frequency: "monthly",
    customInterval: null,
    customUnit: null,
    endDate: null,
    accountId: null,
    skippedDates: [],
    notes: null,
    active: true,
    createdOn: "2026-01-01",
    ...over,
  };
}

export function bill(over: Partial<Bill> = {}): Bill {
  return {
    id: id("bill"),
    name: "Aluguel",
    amount: 100000,
    minimumAmount: null,
    currency: "USD",
    category: "housing",
    priority: "essential",
    recurrence: "monthly",
    firstDueDate: "2026-11-20",
    endDate: null,
    lateFee: 0,
    interestRate: "0",
    allowsPartial: false,
    accountId: null,
    notes: null,
    active: true,
    ...over,
  };
}

export function occurrence(b: Bill, dueDate: string, over: Partial<BillOccurrence> = {}): BillOccurrence {
  return { id: id("occ"), billId: b.id, dueDate, amountDue: b.amount, minimumDue: b.minimumAmount, waived: false, notes: null, ...over };
}

export function payment(o: BillOccurrence, amount: number, date: string): BillPayment {
  return { id: id("pay"), occurrenceId: o.id, amount, date, transactionId: null };
}

export function debt(over: Partial<Debt> = {}): Debt {
  return {
    id: id("debt"),
    name: "Empréstimo universitário",
    currency: "USD",
    initialBalance: 1000000,
    startDate: "2026-01-01",
    incrementAmount: 550000,
    incrementIntervalMonths: 6,
    incrementAnchorDate: "2026-08-15",
    incrementsEndDate: null,
    interestRate: "0",
    interestSince: null,
    plannedMonthlyPayment: 0,
    paymentDay: 5,
    targetPayoffDate: null,
    notes: null,
    active: true,
    ...over,
  };
}

export function debtEvent(d: Debt, over: Partial<DebtEvent> & Pick<DebtEvent, "type" | "amount" | "date">): DebtEvent {
  return { id: id("dev"), debtId: d.id, automatic: false, voided: false, transactionId: null, note: null, ...over };
}

export function goal(over: Partial<Goal> = {}): Goal {
  return {
    id: id("goal"),
    name: "Reserva",
    kind: "emergency",
    targetAmount: 300000,
    currency: "USD",
    deadline: null,
    priority: "high",
    monthlyContribution: 0,
    notes: null,
    archived: false,
    ...over,
  };
}

export function subscription(over: Partial<Subscription> = {}): Subscription {
  return {
    id: id("sub"),
    name: "Spotify",
    amount: 1199,
    currency: "USD",
    billingCycle: "monthly",
    nextChargeDate: "2026-11-25",
    category: "subscriptions",
    accountId: null,
    status: "active",
    lastUsedOn: null,
    usageNote: null,
    notes: null,
    ...over,
  };
}

export function snapshot(over: Partial<Snapshot> = {}): Snapshot {
  return {
    today: "2026-11-16",
    profile: profile(),
    accounts: [],
    incomes: [],
    transactions: [],
    bills: [],
    occurrences: [],
    billPayments: [],
    subscriptions: [],
    debts: [],
    debtEvents: [],
    goals: [],
    contributions: [],
    budgets: [],
    fxRates: [],
    ...over,
  };
}
