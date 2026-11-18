import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/primitives";
import { GOAL_KIND_LABELS, GOAL_PRIORITY_LABELS } from "@/lib/constants";
import { recommendContributions } from "@/lib/finance/goals";
import { centsToInput } from "@/lib/format";
import { getAppData } from "@/server/context";
import { GoalsClient, type GoalView } from "./goals-client";

export const metadata: Metadata = { title: "Savings Goals" };

export default async function GoalsPage() {
  const { snapshot: s, analysis: a } = await getAppData();
  // Money that can go to goals: monthly surplus minus the planned debt payment.
  const capacity = a.capacity.surplus === null ? null : Math.max(0, a.capacity.surplus - a.capacity.plannedDebt);
  const rec =
    capacity === null
      ? new Map<string, number>()
      : recommendContributions(
          capacity,
          a.goals.map((g) => ({
            ...g,
            baseRemaining: a.ctx.toBase(g.remaining, g.goal.currency),
            baseRequired: g.requiredMonthly === null ? null : a.ctx.toBase(g.requiredMonthly, g.goal.currency),
          })),
        );
  const archived = s.goals.filter((g) => g.archived);
  const views: GoalView[] = [
    ...a.goals,
    ...archived.map((g) => ({
      goal: g,
      saved: s.contributions.filter((c) => c.goalId === g.id).reduce((x, c) => x + c.amount, 0),
      remaining: 0,
      percent: 0,
      completed: false,
      monthsToTarget: null,
      estimatedDate: null,
      requiredMonthly: null,
      monthsToDeadline: null,
      onTrack: null,
      contributedThisMonth: 0,
    })),
  ].map((p) => ({
    id: p.goal.id,
    name: p.goal.name,
    kindLabel: GOAL_KIND_LABELS[p.goal.kind],
    priority: p.goal.priority,
    priorityLabel: GOAL_PRIORITY_LABELS[p.goal.priority],
    currency: p.goal.currency,
    target: p.goal.targetAmount,
    saved: p.saved,
    remaining: p.remaining,
    percent: p.goal.archived ? Math.min(100, Math.round((p.saved / p.goal.targetAmount) * 1000) / 10) : p.percent,
    completed: p.completed,
    monthly: p.goal.monthlyContribution,
    monthsToTarget: p.monthsToTarget,
    estimatedDate: p.estimatedDate,
    requiredMonthly: p.requiredMonthly,
    deadline: p.goal.deadline,
    onTrack: p.onTrack,
    contributedThisMonth: p.contributedThisMonth,
    archived: p.goal.archived,
    recommended: rec.get(p.goal.id) ?? null,
    contributions: s.contributions
      .filter((c) => c.goalId === p.goal.id)
      .slice(-12)
      .reverse()
      .map((c) => ({ id: c.id, date: c.date, amount: c.amount, note: c.note })),
    initial: {
      id: p.goal.id,
      name: p.goal.name,
      kind: p.goal.kind,
      targetAmount: centsToInput(p.goal.targetAmount),
      currency: p.goal.currency,
      deadline: p.goal.deadline,
      priority: p.goal.priority,
      monthlyContribution: centsToInput(p.goal.monthlyContribution),
      notes: p.goal.notes,
    },
  }));

  return (
    <>
      <PageHeader
        eyebrow="Planning"
        title="Savings Goals"
        description="Your emergency fund and other goals. Progress grows with the contributions you record."
      />
      <GoalsClient
        goals={views}
        totalSaved={a.savingsTotal}
        capacity={capacity}
        plannedGoals={a.capacity.plannedGoals}
        assumptions={a.capacity.assumptions}
        missing={a.capacity.missing}
        emergencyMonths={a.capacity.emergencyMonths}
      />
    </>
  );
}
