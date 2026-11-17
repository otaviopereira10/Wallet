import { addMonths, diffMonths, endOfMonth } from "./dates";
import { floorTo } from "./money";
import type { Cents, Goal, GoalContribution, GoalPriority, ISODate } from "./types";

export interface GoalProgress {
  goal: Goal;
  saved: Cents;
  remaining: Cents;
  percent: number;
  completed: boolean;
  /** Months needed at the planned monthly contribution (null if no contribution planned). */
  monthsToTarget: number | null;
  estimatedDate: ISODate | null;
  /** Monthly amount needed to reach the target by the deadline. */
  requiredMonthly: Cents | null;
  monthsToDeadline: number | null;
  onTrack: boolean | null;
  contributedThisMonth: Cents;
}

export function goalProgress(goal: Goal, contributions: GoalContribution[], today: ISODate): GoalProgress {
  const own = contributions.filter((c) => c.goalId === goal.id);
  const saved = own.reduce((s, c) => s + c.amount, 0);
  const remaining = Math.max(0, goal.targetAmount - saved);
  const completed = remaining === 0;
  const monthStart = today.slice(0, 8) + "01";
  const contributedThisMonth = own.filter((c) => c.date >= monthStart && c.date <= endOfMonth(today)).reduce((s, c) => s + c.amount, 0);

  let monthsToTarget: number | null = null;
  let estimatedDate: ISODate | null = null;
  if (completed) {
    monthsToTarget = 0;
    estimatedDate = today;
  } else if (goal.monthlyContribution > 0) {
    monthsToTarget = Math.ceil(remaining / goal.monthlyContribution);
    estimatedDate = endOfMonth(addMonths(today, monthsToTarget - (contributedThisMonth >= goal.monthlyContribution ? 0 : 1)));
  }

  let requiredMonthly: Cents | null = null;
  let monthsToDeadline: number | null = null;
  let onTrack: boolean | null = null;
  if (goal.deadline) {
    monthsToDeadline = Math.max(0, diffMonths(today, goal.deadline) + (goal.deadline >= today ? 1 : 0));
    requiredMonthly = completed ? 0 : monthsToDeadline > 0 ? Math.ceil(remaining / monthsToDeadline) : remaining;
    onTrack = completed ? true : goal.monthlyContribution > 0 ? goal.monthlyContribution >= requiredMonthly : false;
  }

  return {
    goal,
    saved,
    remaining,
    percent: Math.min(100, Math.round((saved / goal.targetAmount) * 1000) / 10),
    completed,
    monthsToTarget,
    estimatedDate,
    requiredMonthly,
    monthsToDeadline,
    onTrack,
    contributedThisMonth,
  };
}

const WEIGHTS: Record<GoalPriority, number> = { high: 3, medium: 2, low: 1 };

/**
 * Splits the monthly money available for saving across open goals,
 * proportionally to priority, never giving a goal more than it still needs
 * per month (deadline-based) or in total. Amounts are rounded down to whole
 * currency units.
 */
export function recommendContributions(
  capacity: Cents,
  progress: Array<GoalProgress & { baseRemaining: Cents; baseRequired: Cents | null }>,
): Map<string, Cents> {
  const result = new Map<string, Cents>();
  let pool = Math.max(0, capacity);
  let open = progress.filter((p) => !p.completed && !p.goal.archived);
  for (let round = 0; round < 5 && pool > 0 && open.length; round++) {
    const totalWeight = open.reduce((s, p) => s + WEIGHTS[p.goal.priority], 0);
    let distributed = 0;
    const next: typeof open = [];
    for (const p of open) {
      const share = floorTo(Math.floor((pool * WEIGHTS[p.goal.priority]) / totalWeight), 100);
      const cap = Math.max(0, (p.baseRequired ?? p.baseRemaining) - (result.get(p.goal.id) ?? 0));
      const give = Math.min(share, cap, p.baseRemaining - (result.get(p.goal.id) ?? 0));
      if (give > 0) {
        result.set(p.goal.id, (result.get(p.goal.id) ?? 0) + give);
        distributed += give;
      }
      if ((result.get(p.goal.id) ?? 0) < Math.min(p.baseRequired ?? p.baseRemaining, p.baseRemaining)) next.push(p);
    }
    pool -= distributed;
    if (distributed === 0) break;
    open = next;
  }
  return result;
}
