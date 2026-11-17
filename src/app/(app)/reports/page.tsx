import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/primitives";
import { categoryLabel } from "@/lib/constants";
import { isISODate } from "@/lib/finance/dates";
import { buildReport, periodRange, type ReportPeriod } from "@/lib/finance/reports";
import { formatMonth } from "@/lib/format";
import { getAppData } from "@/server/context";
import { ReportsClient } from "./reports-client";

export const metadata: Metadata = { title: "Financial Reports" };

const KINDS: ReportPeriod[] = ["month", "quarter", "semester", "year", "custom"];

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ period?: string; ref?: string; from?: string; to?: string }> }) {
  const p = await searchParams;
  const { snapshot: s, analysis: a } = await getAppData();
  const kind = (KINDS.includes(p.period as ReportPeriod) ? p.period : "month") as ReportPeriod;
  const ref = p.ref && isISODate(p.ref) ? p.ref : s.today;
  const custom = p.from && p.to && isISODate(p.from) && isISODate(p.to) && p.from <= p.to ? { from: p.from, to: p.to } : undefined;
  const range = periodRange(kind === "custom" && !custom ? "month" : kind, ref, custom);
  const r = buildReport(s, a.ctx, range.from, range.to);
  const loc = s.profile.locale;
  return (
    <>
      <PageHeader eyebrow="Análise" title="Financial Reports" description="Relatórios por período, categoria, dívida e metas — exportáveis em CSV e PDF." />
      <ReportsClient
        period={kind}
        refDate={ref}
        from={range.from}
        to={range.to}
        report={{
          flows: r.flows,
          savingsRate: r.savingsRate,
          transactionCount: r.transactionCount,
          byCategory: r.byCategory.map((c) => ({ ...c, label: categoryLabel(c.category) })),
          incomeByCategory: r.incomeByCategory.map((c) => ({ ...c, label: categoryLabel(c.category) })),
          monthly: r.monthly.map((m) => ({ month: m.month, label: formatMonth(m.month, loc), income: m.income, expenses: m.expenses, debtPayments: m.debtPayments, net: m.net })),
          netWorth: r.netWorth.map((m) => ({ label: formatMonth(m.month, loc), assets: m.assets, debts: m.debts, netWorth: m.netWorth })),
          debt: r.debt.map((d) => ({ label: formatMonth(d.month, loc), balance: d.balance })),
          budgetVsActual: r.budgetVsActual.map((b) => ({ ...b, label: categoryLabel(b.category) })),
          goals: r.goals,
        }}
        displayName={s.profile.displayName}
      />
    </>
  );
}
