import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/primitives";
import { budgetSummary } from "@/lib/finance/budget";
import { addMonthKey, isISODate, monthKey } from "@/lib/finance/dates";
import { centsToInput, formatMonth } from "@/lib/format";
import { getAppData } from "@/server/context";
import { BudgetClient } from "./budget-client";

export const metadata: Metadata = { title: "Monthly Budget" };

export default async function BudgetPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { month } = await searchParams;
  const { snapshot: s, analysis: a } = await getAppData();
  const current = monthKey(s.today);
  const key = month && /^\d{4}-\d{2}$/.test(month) && isISODate(`${month}-01`) && month <= current ? month : current;
  const summary = key === current ? a.budget : budgetSummary(s, a.ctx, `${key}-01`, a.fmt);
  return (
    <>
      <PageHeader
        eyebrow="Planejamento"
        title="Monthly Budget"
        description="Limites mensais por categoria. Despesas pendentes contam como gasto comprometido; reembolsos são descontados."
      />
      <BudgetClient
        monthKey={key}
        monthLabel={formatMonth(key, s.profile.locale, "long")}
        prevKey={addMonthKey(key, -1)}
        nextKey={key < current ? addMonthKey(key, 1) : null}
        isCurrent={key === current}
        summary={{
          lines: summary.lines.map((l) => ({
            category: l.category,
            limit: l.limit,
            limitInput: centsToInput(l.budget.amount),
            spent: l.spent,
            remaining: l.remaining,
            percent: l.percent,
            state: l.state,
            projected: l.projected,
            projectedState: l.projectedState,
            dailyAllowance: l.dailyAllowance,
            topExpenses: l.topExpenses,
          })),
          totalLimit: summary.totalLimit,
          totalSpent: summary.totalSpent,
          totalRemaining: summary.totalRemaining,
          percent: summary.percent,
          totalProjected: summary.totalProjected,
          daysElapsed: summary.daysElapsed,
          daysInMonth: summary.daysInMonth,
          unbudgeted: summary.unbudgeted,
          recommendations: summary.recommendations,
        }}
      />
    </>
  );
}
