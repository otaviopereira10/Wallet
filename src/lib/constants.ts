import type { Priority } from "./finance/types";

export const CURRENCIES = ["USD", "BRL"] as const;

export const EXPENSE_CATEGORIES = [
  "housing",
  "food",
  "groceries",
  "transport",
  "education",
  "health",
  "fitness",
  "entertainment",
  "personal",
  "subscriptions",
  "travel",
  "emergency",
  "other",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const INCOME_CATEGORIES = ["scholarship", "salary", "side_work", "family", "transfer", "other_income"] as const;
export type IncomeCategory = (typeof INCOME_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<string, string> = {
  housing: "Housing",
  food: "Food & dining",
  groceries: "Groceries",
  transport: "Transportation",
  education: "Education",
  health: "Health",
  fitness: "Gym & fitness",
  entertainment: "Entertainment",
  personal: "Personal shopping",
  subscriptions: "Subscriptions",
  travel: "Travel",
  emergency: "Emergencies",
  other: "Other",
  scholarship: "Scholarship",
  salary: "Salary",
  side_work: "Side work",
  family: "Family support",
  transfer: "Transfers in",
  other_income: "Other income",
  debt: "University debt",
};

/** Default priority class for each expense category (used by the planner and insights). */
export const CATEGORY_PRIORITY: Record<ExpenseCategory, Priority> = {
  housing: "essential",
  food: "essential",
  groceries: "essential",
  transport: "essential",
  education: "essential",
  health: "essential",
  fitness: "important",
  subscriptions: "important",
  emergency: "essential",
  other: "important",
  entertainment: "optional",
  personal: "optional",
  travel: "optional",
};

export const NON_ESSENTIAL_CATEGORIES: ExpenseCategory[] = ["entertainment", "personal", "travel", "subscriptions"];

export const PRIORITY_LABELS: Record<Priority, string> = {
  essential: "Essential",
  important: "Important",
  optional: "Optional",
};

export const PAYMENT_METHODS = ["cash", "debit_card", "credit_card", "pix", "bank_transfer", "zelle", "check", "other"] as const;
export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  debit_card: "Debit card",
  credit_card: "Credit card",
  pix: "Pix",
  bank_transfer: "Bank transfer",
  zelle: "Zelle",
  check: "Check",
  other: "Other",
};

export const ACCOUNT_TYPES = ["checking", "savings", "cash", "credit_card", "investment", "other"] as const;
export const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  checking: "Checking",
  savings: "Savings",
  cash: "Cash",
  credit_card: "Credit card",
  investment: "Investments",
  other: "Other",
};

export const INCOME_FREQUENCIES = ["once", "weekly", "biweekly", "monthly", "semiannual", "yearly", "custom"] as const;
export const FREQUENCY_LABELS: Record<string, string> = {
  once: "One time",
  none: "Does not repeat",
  weekly: "Weekly",
  biweekly: "Every 2 weeks",
  monthly: "Monthly",
  quarterly: "Quarterly",
  semiannual: "Every 6 months",
  yearly: "Yearly",
  custom: "Custom",
};

export const BILL_RECURRENCES = ["once", "weekly", "biweekly", "monthly", "quarterly", "semiannual", "yearly"] as const;
export const EXPENSE_RECURRENCES = ["none", "weekly", "biweekly", "monthly", "quarterly", "semiannual", "yearly"] as const;
export const SUBSCRIPTION_CYCLES = ["weekly", "monthly", "quarterly", "semiannual", "yearly"] as const;
export const SUBSCRIPTION_STATUS_LABELS: Record<string, string> = {
  active: "Active",
  cancel_planned: "Want to cancel",
  cancelled: "Cancelled",
};

export const GOAL_KINDS = ["emergency", "travel", "electronics", "purchase", "college", "debt_payoff", "other"] as const;
export const GOAL_KIND_LABELS: Record<string, string> = {
  emergency: "Emergency fund",
  travel: "Trip",
  electronics: "Electronics",
  purchase: "Big purchase",
  college: "College fund",
  debt_payoff: "Debt payoff",
  other: "Other goal",
};
export const GOAL_PRIORITY_LABELS: Record<string, string> = { high: "High", medium: "Medium", low: "Low" };

export const TX_KIND_LABELS: Record<string, string> = {
  income: "Income",
  expense: "Expense",
  refund: "Refund",
  transfer: "Transfer",
  debt_payment: "Debt payment",
};

export function categoryLabel(key: string | null | undefined): string {
  if (!key) return "No category";
  return CATEGORY_LABELS[key] ?? key;
}
