import {
  ArrowDownLeft,
  CalendarClock,
  CalendarDays,
  FileBarChart2,
  GraduationCap,
  Landmark,
  LayoutDashboard,
  LineChart,
  PieChart,
  PiggyBank,
  Receipt,
  Repeat,
  Settings,
  Sparkles,
  UploadCloud,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  group: "Visão geral" | "Dinheiro" | "Planejamento" | "Análise" | "Sistema";
  keywords?: string;
}

export const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, group: "Visão geral", keywords: "inicio resumo" },
  { href: "/intelligence", label: "Isabelle Intelligence", icon: Sparkles, group: "Visão geral", keywords: "assistente ia perguntas" },
  { href: "/accounts", label: "Contas & saldos", icon: Landmark, group: "Dinheiro", keywords: "banco saldo transferencia" },
  { href: "/income", label: "Receitas", icon: ArrowDownLeft, group: "Dinheiro", keywords: "renda bolsa salario" },
  { href: "/expenses", label: "Despesas", icon: Receipt, group: "Dinheiro", keywords: "gastos compras" },
  { href: "/bills", label: "Bills & Payments", icon: CalendarClock, group: "Dinheiro", keywords: "contas pagar vencimento planner" },
  { href: "/subscriptions", label: "Assinaturas", icon: Repeat, group: "Dinheiro", keywords: "netflix spotify recorrentes" },
  { href: "/debt", label: "University Debt", icon: GraduationCap, group: "Planejamento", keywords: "divida faculdade emprestimo" },
  { href: "/budget", label: "Monthly Budget", icon: PieChart, group: "Planejamento", keywords: "orcamento limites" },
  { href: "/cash-flow", label: "Cash Flow Forecast", icon: LineChart, group: "Planejamento", keywords: "fluxo de caixa projecao" },
  { href: "/goals", label: "Savings Goals", icon: PiggyBank, group: "Planejamento", keywords: "metas reserva emergencia" },
  { href: "/calendar", label: "Calendário", icon: CalendarDays, group: "Análise", keywords: "datas eventos" },
  { href: "/reports", label: "Financial Reports", icon: FileBarChart2, group: "Análise", keywords: "relatorios pdf csv" },
  { href: "/data", label: "Importar & backup", icon: UploadCloud, group: "Sistema", keywords: "csv importacao exportacao restaurar" },
  { href: "/settings", label: "Configurações", icon: Settings, group: "Sistema", keywords: "perfil preferencias cambio senha" },
];

export const MOBILE_PRIMARY = ["/dashboard", "/expenses", "/bills"];
