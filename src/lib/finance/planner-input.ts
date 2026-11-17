import { CATEGORY_PRIORITY, type ExpenseCategory } from "../constants";
import type { Analysis } from "./analysis";
import { isOpen } from "./bills";
import { addDays } from "./dates";
import type { PlannerItem } from "./planner";
import type { Snapshot } from "./types";

/** Open bills and pending expenses due up to `horizonDays` from today (overdue included). */
export function plannerItemsFrom(s: Snapshot, a: Analysis, horizonDays = 30): PlannerItem[] {
  const until = addDays(s.today, horizonDays);
  const items: PlannerItem[] = [];
  for (const v of a.views) {
    if (!isOpen(v) || v.occurrence.dueDate > until) continue;
    const amount = a.ctx.toBase(v.remaining, v.bill.currency);
    const minimum = v.bill.allowsPartial
      ? a.ctx.toBase(v.occurrence.minimumDue !== null ? v.minimumRemaining : v.remaining, v.bill.currency)
      : amount;
    items.push({
      id: v.occurrence.id,
      source: "bill",
      name: v.bill.name,
      category: v.bill.category,
      priority: v.bill.priority,
      dueDate: v.occurrence.dueDate,
      amount,
      minimum,
      allowsPartial: v.bill.allowsPartial,
      lateFee: a.ctx.toBase(v.bill.lateFee, v.bill.currency),
      interestRate: v.bill.interestRate,
    });
  }
  for (const t of s.transactions) {
    if (t.kind !== "expense" || t.status !== "pending" || t.date > until) continue;
    const amount = a.ctx.toBase(t.amount, t.currency);
    items.push({
      id: `expense:${t.id}`,
      source: "expense",
      name: t.description,
      category: t.category ?? "other",
      priority: CATEGORY_PRIORITY[(t.category ?? "other") as ExpenseCategory] ?? "important",
      dueDate: t.date,
      amount,
      minimum: amount,
      allowsPartial: false,
      lateFee: 0,
      interestRate: "0",
    });
  }
  return items;
}
