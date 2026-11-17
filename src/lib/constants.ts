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
  housing: "Moradia",
  food: "Alimentação",
  groceries: "Mercado",
  transport: "Transporte",
  education: "Educação",
  health: "Saúde",
  fitness: "Academia",
  entertainment: "Entretenimento",
  personal: "Compras pessoais",
  subscriptions: "Assinaturas",
  travel: "Viagens",
  emergency: "Emergências",
  other: "Outros",
  scholarship: "Bolsa de estudos",
  salary: "Salário",
  side_work: "Trabalho extra",
  family: "Ajuda familiar",
  transfer: "Transferências",
  other_income: "Outras receitas",
  debt: "Dívida universitária",
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
  essential: "Essencial",
  important: "Importante",
  optional: "Opcional",
};

export const PAYMENT_METHODS = ["cash", "debit_card", "credit_card", "pix", "bank_transfer", "zelle", "check", "other"] as const;
export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Dinheiro",
  debit_card: "Cartão de débito",
  credit_card: "Cartão de crédito",
  pix: "Pix",
  bank_transfer: "Transferência bancária",
  zelle: "Zelle",
  check: "Cheque",
  other: "Outro",
};

export const ACCOUNT_TYPES = ["checking", "savings", "cash", "credit_card", "investment", "other"] as const;
export const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  checking: "Conta corrente",
  savings: "Poupança",
  cash: "Dinheiro em espécie",
  credit_card: "Cartão de crédito",
  investment: "Investimentos",
  other: "Outra",
};

export const INCOME_FREQUENCIES = ["once", "weekly", "biweekly", "monthly", "semiannual", "yearly", "custom"] as const;
export const FREQUENCY_LABELS: Record<string, string> = {
  once: "Única",
  none: "Não se repete",
  weekly: "Semanal",
  biweekly: "Quinzenal",
  monthly: "Mensal",
  quarterly: "Trimestral",
  semiannual: "Semestral",
  yearly: "Anual",
  custom: "Personalizada",
};

export const BILL_RECURRENCES = ["once", "weekly", "biweekly", "monthly", "quarterly", "semiannual", "yearly"] as const;
export const EXPENSE_RECURRENCES = ["none", "weekly", "biweekly", "monthly", "quarterly", "semiannual", "yearly"] as const;
export const SUBSCRIPTION_CYCLES = ["weekly", "monthly", "quarterly", "semiannual", "yearly"] as const;
export const SUBSCRIPTION_STATUS_LABELS: Record<string, string> = {
  active: "Ativa",
  cancel_planned: "Quero cancelar",
  cancelled: "Cancelada",
};

export const GOAL_KINDS = ["emergency", "travel", "electronics", "purchase", "college", "debt_payoff", "other"] as const;
export const GOAL_KIND_LABELS: Record<string, string> = {
  emergency: "Reserva de emergência",
  travel: "Viagem",
  electronics: "Eletrônicos",
  purchase: "Compra importante",
  college: "Reserva para a faculdade",
  debt_payoff: "Quitação da dívida",
  other: "Outro objetivo",
};
export const GOAL_PRIORITY_LABELS: Record<string, string> = { high: "Alta", medium: "Média", low: "Baixa" };

export const TX_KIND_LABELS: Record<string, string> = {
  income: "Receita",
  expense: "Despesa",
  refund: "Reembolso",
  transfer: "Transferência",
  debt_payment: "Pagamento de dívida",
};

export function categoryLabel(key: string | null | undefined): string {
  if (!key) return "Sem categoria";
  return CATEGORY_LABELS[key] ?? key;
}
