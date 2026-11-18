import {
  ArrowDownLeft,
  CalendarClock,
  CalendarDays,
  FileBarChart2,
  GraduationCap,
  HelpCircle,
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
  /** One-line plain-English explanation shown in search and on the Help page. */
  hint: string;
  icon: LucideIcon;
  group: "Overview" | "Your money" | "Planning" | "Insights" | "App";
  keywords?: string;
}

export const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", hint: "Everything at a glance", icon: LayoutDashboard, group: "Overview", keywords: "home summary" },
  { href: "/intelligence", label: "Ask Isabelle", hint: "Ask questions about your money", icon: Sparkles, group: "Overview", keywords: "assistant ai questions intelligence" },
  { href: "/accounts", label: "Accounts", hint: "Where your money is", icon: Landmark, group: "Your money", keywords: "bank balance transfer" },
  { href: "/income", label: "Income", hint: "Money coming in", icon: ArrowDownLeft, group: "Your money", keywords: "salary scholarship paycheck" },
  { href: "/expenses", label: "Expenses", hint: "Money going out", icon: Receipt, group: "Your money", keywords: "spending purchases" },
  { href: "/bills", label: "Bills & Payments", hint: "What you need to pay and when", icon: CalendarClock, group: "Your money", keywords: "bills due planner" },
  { href: "/subscriptions", label: "Subscriptions", hint: "Netflix, Spotify, gym…", icon: Repeat, group: "Your money", keywords: "netflix spotify recurring" },
  { href: "/debt", label: "University Debt", hint: "Your student loan and payoff plan", icon: GraduationCap, group: "Planning", keywords: "loan college tuition student" },
  { href: "/budget", label: "Monthly Budget", hint: "Spending limits per category", icon: PieChart, group: "Planning", keywords: "budget limits" },
  { href: "/cash-flow", label: "Cash Flow", hint: "Your balance in the coming weeks", icon: LineChart, group: "Planning", keywords: "forecast projection future" },
  { href: "/goals", label: "Savings Goals", hint: "Emergency fund, trips, purchases", icon: PiggyBank, group: "Planning", keywords: "goals savings emergency" },
  { href: "/calendar", label: "Calendar", hint: "Money events by day", icon: CalendarDays, group: "Insights", keywords: "dates events" },
  { href: "/reports", label: "Reports", hint: "Monthly and yearly reports, CSV and PDF", icon: FileBarChart2, group: "Insights", keywords: "reports pdf csv" },
  { href: "/data", label: "Import & Backup", hint: "CSV import, export and backups", icon: UploadCloud, group: "App", keywords: "csv import export restore backup" },
  { href: "/settings", label: "Settings", hint: "Profile, currency, exchange rate, password", icon: Settings, group: "App", keywords: "profile preferences exchange password" },
  { href: "/help", label: "Help", hint: "How Isabelle Wallet works", icon: HelpCircle, group: "App", keywords: "help guide how it works glossary" },
];

export const MOBILE_PRIMARY = ["/dashboard", "/expenses", "/bills"];
