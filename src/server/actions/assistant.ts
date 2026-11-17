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
  question: z.string().transform(sanitize).pipe(z.string().min(3, "Escreva uma pergunta").max(500, "Pergunta muito longa")),
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
      if (!s.profile.aiEnabled) ai = { ok: false, error: "Ative a IA em Configurações para usar respostas geradas por IA." };
      else if (!aiAvailable()) ai = { ok: false, error: "A IA não está configurada no servidor (AI_API_KEY)." };
      else {
        const fmt = a.fmt;
        const data = {
          hoje: s.today,
          moeda_principal: s.profile.baseCurrency,
          saldo_total: fmt(a.totalBalance),
          saldo_disponivel: fmt(a.spendableBalance),
          livre_no_mes: fmt(a.safeMonth.amount),
          reserva_minima: fmt(s.profile.emergencyBuffer),
          receitas_mes: fmt(a.month.income),
          despesas_mes: fmt(a.month.netExpenses),
          contas_abertas_30_dias: a.views
            .filter((v) => v.remaining > 0 && v.daysUntilDue <= 30)
            .slice(0, 12)
            .map((v) => ({ nome: v.bill.name, valor: formatMoney(v.remaining, v.bill.currency), vencimento: v.occurrence.dueDate, prioridade: v.bill.priority })),
          dividas: a.debts.map((d) => ({
            nome: d.debt.name,
            saldo: formatMoney(d.balance, d.debt.currency),
            acrescimo: formatMoney(d.debt.incrementAmount, d.debt.currency),
            proximo_acrescimo: d.nextIncrement,
            pagamento_planejado: formatMoney(d.debt.plannedMonthlyPayment, d.debt.currency),
            minimo_para_nao_crescer: formatMoney(d.breakEven, d.debt.currency),
          })),
          metas: a.goals.map((g) => ({ nome: g.goal.name, alvo: formatMoney(g.goal.targetAmount, g.goal.currency), acumulado: formatMoney(g.saved, g.goal.currency) })),
          orcamento: a.budget.lines.map((l) => ({ categoria: categoryLabel(l.category), limite: fmt(l.limit), gasto: fmt(l.spent), projecao: fmt(l.projected) })),
          capacidade_mensal: a.capacity.surplus === null ? "desconhecida" : fmt(a.capacity.surplus),
          premissas: a.capacity.assumptions,
          dados_faltando: a.capacity.missing,
        };
        ai = await explainWithAI(parsed.data.question, answer, data);
      }
    }
    return { ok: true, data: { answer, ai } };
  } catch (err) {
    return toActionError(err);
  }
}
