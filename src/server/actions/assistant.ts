"use server";

import { z } from "zod";
import { categoryLabel } from "@/lib/constants";
import { analyze } from "@/lib/finance/analysis";
import { answerQuestion, type AssistantAnswer } from "@/lib/finance/assistant";
import { formatMoney } from "@/lib/format";
import { sanitize } from "@/lib/validation";
import { requireUserForAction } from "../auth/session";
import { aiAvailable, explainWithAI } from "../services/ai";
import { loadSnapshot } from "../services/snapshot";
import { toActionError, type ActionResult } from "./helpers";

export interface AskResult {
  answer: AssistantAnswer;
  ai: { ok: true; text: string; model: string } | { ok: false; error: string } | null;
}

const schema = z.object({
  question: z.string().transform(sanitize).pipe(z.string().min(3, "Type a question").max(500, "Question is too long")),
  useAI: z.boolean().default(false),
});

export async function askIsabelle(raw: unknown): Promise<ActionResult<AskResult>> {
  try {
    const user = await requireUserForAction();
    const parsed = schema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
    const s = await loadSnapshot(user.id);
    const a = analyze(s);
    const answer = answerQuestion(parsed.data.question, s, a);
    let ai: AskResult["ai"] = null;
    if (parsed.data.useAI) {
      if (!s.profile.aiEnabled) ai = { ok: false, error: "Turn on AI in Settings to get AI-written explanations." };
      else if (!aiAvailable()) ai = { ok: false, error: "AI is not set up on the server (AI_API_KEY)." };
      else {
        const fmt = a.fmt;
        const data = {
          today: s.today,
          base_currency: s.profile.baseCurrency,
          total_balance: fmt(a.totalBalance),
          available_balance: fmt(a.spendableBalance),
          free_this_month: fmt(a.safeMonth.amount),
          safety_cushion: fmt(s.profile.emergencyBuffer),
          income_this_month: fmt(a.month.income),
          expenses_this_month: fmt(a.month.netExpenses),
          open_bills_next_30_days: a.views
            .filter((v) => v.remaining > 0 && v.daysUntilDue <= 30)
            .slice(0, 12)
            .map((v) => ({ name: v.bill.name, amount: formatMoney(v.remaining, v.bill.currency), due_date: v.occurrence.dueDate, priority: v.bill.priority })),
          debts: a.debts.map((d) => ({
            name: d.debt.name,
            balance: formatMoney(d.balance, d.debt.currency),
            semester_charge: formatMoney(d.debt.incrementAmount, d.debt.currency),
            next_charge_date: d.nextIncrement,
            planned_monthly_payment: formatMoney(d.debt.plannedMonthlyPayment, d.debt.currency),
            minimum_to_stop_growth: formatMoney(d.breakEven, d.debt.currency),
          })),
          goals: a.goals.map((g) => ({ name: g.goal.name, target: formatMoney(g.goal.targetAmount, g.goal.currency), saved: formatMoney(g.saved, g.goal.currency) })),
          budget: a.budget.lines.map((l) => ({ category: categoryLabel(l.category), limit: fmt(l.limit), spent: fmt(l.spent), projected: fmt(l.projected) })),
          monthly_left_over: a.capacity.surplus === null ? "unknown" : fmt(a.capacity.surplus),
          assumptions: a.capacity.assumptions,
          missing_data: a.capacity.missing,
        };
        ai = await explainWithAI(parsed.data.question, answer, data);
      }
    }
    return { ok: true, data: { answer, ai } };
  } catch (err) {
    return toActionError(err);
  }
}
