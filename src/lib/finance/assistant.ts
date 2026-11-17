import { categoryLabel, NON_ESSENTIAL_CATEGORIES, PRIORITY_LABELS } from "../constants";
import { formatDate, formatMoney, monthsToText } from "../format";
import type { Analysis } from "./analysis";
import { buildTimeline, collectFlowEvents, lowestPoint, maxSpendKeepingFloor } from "./cashflow";
import { parseMoney } from "./csv";
import { addDays, addMonths, diffDays, endOfMonth, startOfMonth } from "./dates";
import { balanceAfterMonths, requiredPaymentForTarget, simulateDebt } from "./debt";
import { goalProgress } from "./goals";
import { spendingByCategory } from "./ledger";
import { planPayments } from "./planner";
import { plannerItemsFrom } from "./planner-input";
import type { Cents, Snapshot } from "./types";

/**
 * Isabelle Intelligence — deterministic layer. Every number comes from the
 * user's data through the financial engine. When data is missing the answer
 * says what is missing instead of guessing. An optional LLM (server-side) may
 * rephrase these facts but never replaces them.
 */
export type Intent =
  | "can_afford"
  | "spend_until_income"
  | "which_bill_first"
  | "category_spending"
  | "college_reserve"
  | "debt_monthly"
  | "save_amount"
  | "outlook"
  | "balance"
  | "help";

export interface AssistantAnswer {
  intent: Intent;
  title: string;
  summary: string;
  problem: string;
  action: string;
  impact: string;
  risks: string;
  assumptions: string[];
  missing: string[];
  facts: Record<string, string>;
}

const NUMBER_WORDS: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2, "três": 3, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12,
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12,
};

const CATEGORY_KEYWORDS: Array<[RegExp, string]> = [
  [/aliment|comida|restaurante|lanche|delivery|ifood|food|eating/, "food"],
  [/mercado|supermercado|grocer/, "groceries"],
  [/transporte|uber|gasolina|ônibus|onibus|metr[oô]|transport|gas\b/, "transport"],
  [/moradia|aluguel|rent|housing|casa\b/, "housing"],
  [/educa[cç][aã]o|curso|livro|education/, "education"],
  [/sa[uú]de|m[eé]dico|farm[aá]cia|health/, "health"],
  [/academia|gym|fitness/, "fitness"],
  [/entretenimento|lazer|cinema|festa|entertainment/, "entertainment"],
  [/compras|roupa|shopping|pessoais/, "personal"],
  [/assinatura|streaming|subscription/, "subscriptions"],
  [/viage|travel|trip/, "travel"],
];

export function detectIntent(question: string): Intent {
  const q = question.toLowerCase();
  if (/(at[eé]|until).*(pr[oó]xim[oa]|next).*(pagamento|sal[aá]rio|recebimento|bolsa|paycheck|income)|gastar at[eé]/.test(q))
    return "spend_until_income";
  if (/(posso|consigo|can i|da pra|dá pra).*(comprar|gastar|buy|afford|pagar algo)/.test(q)) return "can_afford";
  if (/(qual|which).*(conta|bill).*(primeiro|first|prioridade)|pagar primeiro/.test(q)) return "which_bill_first";
  if (/(quitar|pagar|payoff|pay off).*(empr[eé]stimo|d[ií]vida|loan|debt)|(empr[eé]stimo|d[ií]vida).*(por m[eê]s|mensal)/.test(q))
    return "debt_monthly";
  if (/(reserv|guardar).*(faculdade|college|universidade|semestre)/.test(q)) return "college_reserve";
  if (/(economizar|poupar|save|cortar).*(por m[eê]s|mensal|month|\d)/.test(q) || /como (posso )?economizar/.test(q)) return "save_amount";
  if (/(daqui a|em \d+|pr[oó]ximos?|situa[cç][aã]o|future|outlook).*(m[eê]s|meses|ano|anos|months|year)/.test(q)) return "outlook";
  if (/(gastando|gasto|gastei|spending).*(demais|muito|too much|com|on)/.test(q)) return "category_spending";
  if (/saldo|balance|quanto (eu )?tenho/.test(q)) return "balance";
  return "help";
}

export function extractAmount(question: string): Cents | null {
  const m = /(?:us\$|r\$|\$)\s?([\d.,]+)|([\d][\d.,]*)\s?(?:d[oó]lares|reais|dollars|usd|brl)?/i.exec(question);
  if (!m) return null;
  const raw = m[1] ?? m[2];
  const v = parseMoney(raw);
  return v !== null && v > 0 ? v : null;
}

export function extractMonths(question: string): number | null {
  const q = question.toLowerCase();
  const m = /(\d+|[a-zçêé]+)\s+(m[eê]s|meses|months?|anos?|years?)/.exec(q);
  if (!m) return null;
  const n = /^\d+$/.test(m[1]) ? Number(m[1]) : NUMBER_WORDS[m[1]];
  if (!n) return null;
  return /ano|year/.test(m[2]) ? n * 12 : n;
}

export function extractCategory(question: string): string | null {
  const q = question.toLowerCase();
  for (const [re, cat] of CATEGORY_KEYWORDS) if (re.test(q)) return cat;
  return null;
}

export function answerQuestion(question: string, s: Snapshot, a: Analysis): AssistantAnswer {
  const intent = detectIntent(question);
  const base = s.profile.baseCurrency;
  const locale = s.profile.locale;
  const fmt = (c: Cents) => formatMoney(c, base, locale);
  const missing: string[] = [];
  const noAccounts = a.accountRows.length === 0;
  if (noAccounts && intent !== "help") missing.push("contas com saldo inicial (Configurações → Contas)");

  switch (intent) {
    case "can_afford": {
      const amount = extractAmount(question);
      if (amount === null) {
        return simple(intent, "Qual é o valor da compra?", "Diga o valor, por exemplo: “Posso comprar algo de $150 este mês?”", missing);
      }
      const monthEnd = endOfMonth(s.today);
      const safe = a.safeMonth.amount;
      const days = buildTimeline(a.spendableBalance, a.events.filter((e) => e.date <= addDays(s.today, 60)), s.today, addDays(s.today, 60));
      const floorSpend = maxSpendKeepingFloor(days, s.profile.emergencyBuffer);
      const low = lowestPoint(days);
      const lowAfter = low ? low.balance - amount : null;
      const yes = amount <= safe;
      const maybe = !yes && amount <= floorSpend;
      const futureWarning =
        yes && low && lowAfter !== null && lowAfter < s.profile.emergencyBuffer
          ? ` Atenção: considerando as contas dos próximos 60 dias${a.nextIncome ? "" : " e sem receitas futuras cadastradas"}, o saldo projetado chega a ${fmt(lowAfter)} em ${formatDate(low.date, locale)}.`
          : "";
      return {
        intent,
        title: `Compra de ${fmt(amount)}`,
        summary: yes
          ? `Sim para este mês: depois da compra ainda sobrariam ${fmt(safe - amount)} livres até ${formatDate(monthEnd, locale)}, sem contar receitas futuras.${futureWarning}`
          : maybe
            ? `Só se as receitas previstas caírem na data. Sem elas, o valor livre hoje é ${fmt(safe)}.`
            : `Não é recomendável agora: o valor livre este mês é ${fmt(safe)} e, mesmo contando as receitas previstas, a folga mínima nos próximos 60 dias é ${fmt(floorSpend)}.`,
        problem: `Você quer gastar ${fmt(amount)} e tem ${fmt(a.spendableBalance)} disponíveis, com ${fmt(a.safeMonth.obligations)} em obrigações até o fim do mês.`,
        action: yes
          ? "Pode seguir com a compra; registre-a como despesa para manter o saldo real atualizado."
          : maybe
            ? "Espere a próxima receita confirmar antes de comprar, ou divida o valor."
            : `Adie a compra ou reduza o valor para até ${fmt(Math.max(safe, 0))}.`,
        impact: `Saldo livre do mês após a compra: ${fmt(safe - amount)}.${
          low && lowAfter !== null ? ` Ponto mais baixo projetado nos próximos 60 dias, já com a compra: ${fmt(lowAfter)} em ${formatDate(low.date, locale)}.` : ""
        }`,
        risks: "Projeção baseada nas contas, assinaturas e receitas cadastradas; gastos variáveis do dia a dia que não estão registrados não entram.",
        assumptions: [
          `Reserva mínima mantida: ${fmt(s.profile.emergencyBuffer)}.`,
          "Valor livre do mês não conta receitas futuras.",
        ],
        missing,
        facts: { valor: fmt(amount), livre_mes: fmt(safe), folga_60_dias: fmt(floorSpend) },
      };
    }

    case "spend_until_income": {
      const next = a.nextIncome;
      if (!next) missing.push("receitas futuras cadastradas (para saber a data do próximo pagamento)");
      const r = a.safeUntilIncome;
      return {
        intent,
        title: "Até o próximo pagamento",
        summary: next
          ? `Você pode gastar até ${fmt(r.amount)} até ${formatDate(next.date, locale)} (${next.label}).`
          : `Sem próxima receita cadastrada, considerei o fim do mês: ${fmt(r.amount)}.`,
        problem: `Saldo disponível ${fmt(r.spendable)}; obrigações até ${formatDate(r.until, locale)}: ${fmt(r.obligations)}.`,
        action: `Mantenha os gastos variáveis abaixo de ${fmt(r.amount)}${next ? `, cerca de ${fmt(Math.floor(r.amount / Math.max(1, diffDays(s.today, next.date))))} por dia` : ""}.`,
        impact: "Ficando nesse limite, todas as contas cadastradas até a próxima receita continuam cobertas e a reserva mínima fica intacta.",
        risks: "Contas não cadastradas ou atrasos na receita reduzem essa margem.",
        assumptions: [`Reserva mínima: ${fmt(r.buffer)}.`],
        missing,
        facts: { pode_gastar: fmt(r.amount), ate: r.until },
      };
    }

    case "which_bill_first": {
      const items = plannerItemsFrom(s, a, 30);
      if (!items.length) {
        return simple(intent, "Nenhuma conta em aberto", "Não há contas ou despesas pendentes nos próximos 30 dias.", [
          ...missing,
          ...(s.bills.length ? [] : ["contas cadastradas em Bills & Payments"]),
        ]);
      }
      const plan = planPayments({ cash: a.spendableBalance, buffer: s.profile.emergencyBuffer, items, today: s.today });
      const first = plan.order[0];
      return {
        intent,
        title: "Ordem de pagamento",
        summary: `Pague primeiro “${first.item.name}” (${PRIORITY_LABELS[first.item.priority]}, vence em ${formatDate(first.item.dueDate, locale)}, ${fmt(first.item.amount)}).`,
        problem: `${items.length} obrigação(ões) somando ${fmt(plan.totalRequired)}; disponível ${fmt(plan.cash)}.`,
        action: plan.order
          .slice(0, 4)
          .map((o) => `${o.rank}. ${o.item.name} — reservar ${fmt(o.allocated)}`)
          .join("; "),
        impact:
          plan.shortfall > 0
            ? `Faltam ${fmt(plan.shortfall)} para cobrir tudo. Maior risco: “${plan.highestRisk?.item.name}”.`
            : `Tudo coberto; sobram ${fmt(plan.safeToSpend)} livres após a reserva mínima.`,
        risks: plan.tieExplanations[0] ?? "Critérios: prioridade, atraso, vencimento, custo do atraso e valor.",
        assumptions: ["Considera contas e despesas pendentes que vencem em até 30 dias."],
        missing,
        facts: { primeira: first.item.name, falta: fmt(plan.shortfall) },
      };
    }

    case "category_spending": {
      const cat = extractCategory(question);
      if (!cat) return simple(intent, "Qual categoria?", "Diga a categoria, por exemplo: “Estou gastando demais com alimentação?”", missing);
      const mStart = startOfMonth(s.today);
      const now = spendingByCategory(s.transactions, s.accounts, a.ctx, mStart, s.today, { includePending: true })[cat] ?? 0;
      const prevMonths: Cents[] = [];
      for (let i = 1; i <= 3; i++) {
        const st = startOfMonth(addMonths(mStart, -i));
        if (!s.transactions.some((t) => t.date <= endOfMonth(st))) continue;
        prevMonths.push(spendingByCategory(s.transactions, s.accounts, a.ctx, st, endOfMonth(st), { includePending: true })[cat] ?? 0);
      }
      const avg = prevMonths.length ? Math.round(prevMonths.reduce((x, y) => x + y, 0) / prevMonths.length) : null;
      const line = a.budget.lines.find((l) => l.category === cat);
      if (!line) missing.push(`limite de orçamento para ${categoryLabel(cat)}`);
      if (avg === null) missing.push("histórico de meses anteriores");
      const over = line ? line.projected > line.limit : avg !== null ? now > avg : null;
      return {
        intent,
        title: categoryLabel(cat),
        summary:
          over === null
            ? `Você gastou ${fmt(now)} com ${categoryLabel(cat)} este mês. Ainda não há base de comparação.`
            : over
              ? `Sim, está acima do planejado: ${fmt(now)} até agora${line ? `, projeção de ${fmt(line.projected)} para limite de ${fmt(line.limit)}` : `, acima da média de ${fmt(avg!)}`}.`
              : `Não, está dentro do esperado: ${fmt(now)} até agora${line ? ` (limite ${fmt(line.limit)})` : ` (média ${fmt(avg!)})`}.`,
        problem: `Gasto do mês: ${fmt(now)}${avg !== null ? `; média dos últimos ${prevMonths.length} mês(es): ${fmt(avg)}` : ""}.`,
        action: line
          ? `Para fechar dentro do limite, gaste no máximo ${fmt(line.dailyAllowance)} por dia até o fim do mês.`
          : `Defina um limite mensal para ${categoryLabel(cat)} em Monthly Budget para acompanhar automaticamente.`,
        impact: line ? `Margem restante: ${fmt(line.remaining)}.` : "Com um limite, você recebe alertas ao chegar a 80%.",
        risks: "Projeção linear do ritmo de gastos variáveis do mês; compras pontuais podem distorcer.",
        assumptions: ["Inclui despesas pagas e pendentes, descontando reembolsos."],
        missing,
        facts: { gasto_mes: fmt(now), media: avg !== null ? fmt(avg) : "sem dados" },
      };
    }

    case "college_reserve": {
      const d = a.debts[0];
      const collegeGoals = a.goals.filter((g) => g.goal.kind === "college");
      if (!d && !collegeGoals.length)
        return simple(intent, "Sem dados da faculdade", "Cadastre a dívida universitária ou uma meta de reserva para a faculdade.", [
          ...missing,
          "dívida universitária ou meta ‘Reserva para a faculdade’",
        ]);
      const lines: string[] = [];
      let monthly = 0;
      if (d && d.nextIncrement) {
        const months = Math.max(1, Math.ceil(diffDays(s.today, d.nextIncrement) / 30.44));
        const per = Math.ceil(d.debt.incrementAmount / months);
        monthly += a.ctx.toBase(per, d.debt.currency);
        lines.push(
          `Próximo acréscimo de ${formatMoney(d.debt.incrementAmount, d.debt.currency, locale)} em ${formatDate(d.nextIncrement, locale)}: para cobri-lo integralmente, reserve ${formatMoney(per, d.debt.currency, locale)}/mês por ${months} mês(es).`,
        );
      }
      for (const g of collegeGoals) {
        if (g.requiredMonthly !== null) {
          monthly += a.ctx.toBase(g.requiredMonthly, g.goal.currency);
          lines.push(`Meta “${g.goal.name}”: ${formatMoney(g.requiredMonthly, g.goal.currency, locale)}/mês até ${formatDate(g.goal.deadline, locale)}.`);
        }
      }
      return {
        intent,
        title: "Reserva para a faculdade",
        summary: monthly > 0 ? `Reserve cerca de ${fmt(monthly)} por mês.` : "Não há valor mensal calculável com os dados atuais.",
        problem: lines.join(" ") || "Sem acréscimos futuros ou metas com prazo.",
        action: "Crie (ou atualize) a meta ‘Reserva para a faculdade’ com essa contribuição mensal.",
        impact: d ? `Pagando ao menos ${formatMoney(d.breakEven, d.debt.currency, locale)}/mês, a dívida para de crescer.` : "Mantém a meta no prazo.",
        risks: "Considera o valor de acréscimo configurado; se a faculdade mudar o valor, atualize em University Debt Manager.",
        assumptions: ["Meses calculados com média de 30,44 dias."],
        missing,
        facts: { reserva_mensal: fmt(monthly) },
      };
    }

    case "debt_monthly": {
      const d = a.debts[0];
      if (!d) return simple(intent, "Sem dívida cadastrada", "Cadastre seu empréstimo em University Debt Manager.", [...missing, "dívida universitária"]);
      const months = extractMonths(question);
      const target = months ? addMonths(s.today, months) : d.debt.targetPayoffDate;
      const dfmt = (c: Cents) => formatMoney(c, d.debt.currency, locale);
      const options = [24, 36, 60].map((m) => ({ m, pay: requiredPaymentForTarget(d.baseParams, addMonths(s.today, m)) }));
      const required = target ? requiredPaymentForTarget(d.baseParams, target) : null;
      if (d.planned?.incrementsOngoing && !d.debt.incrementsEndDate)
        missing.push("data em que os acréscimos semestrais terminam (ex.: formatura)");
      return {
        intent,
        title: "Pagamento mensal para quitar",
        summary:
          required !== null
            ? `Para quitar até ${formatDate(target!, locale)}, pague cerca de ${dfmt(required)} por mês.`
            : target
              ? `Não é possível quitar até ${formatDate(target, locale)} com os acréscimos configurados.`
              : `Para a dívida parar de crescer, pague ao menos ${dfmt(d.breakEven)} por mês.`,
        problem: `Saldo atual ${dfmt(d.balance)}; acréscimo de ${dfmt(d.debt.incrementAmount)} a cada ${d.debt.incrementIntervalMonths} meses${d.nextIncrement ? ` (próximo em ${formatDate(d.nextIncrement, locale)})` : ""}.`,
        action: options
          .map((o) => `${monthsToText(o.m)}: ${o.pay !== null ? `${dfmt(o.pay)}/mês` : "inviável"}`)
          .join("; "),
        impact: `Mínimo para compensar os acréscimos: ${dfmt(d.breakEven)}/mês.`,
        risks: "Simulação considera as datas reais de cada acréscimo e os juros configurados; mudanças nas regras da faculdade alteram o resultado.",
        assumptions: [`Pagamentos no dia ${d.debt.paymentDay} de cada mês.`, `Juros: ${d.debt.interestRate}% a.a.`],
        missing,
        facts: { saldo: dfmt(d.balance), minimo: dfmt(d.breakEven) },
      };
    }

    case "save_amount": {
      const target = extractAmount(question) ?? 0;
      const ideas: Array<{ text: string; value: Cents }> = [];
      for (const sv of a.subscriptions) {
        if (sv.sub.status === "cancelled") continue;
        if (sv.sub.status === "cancel_planned")
          ideas.push({ text: `Cancelar ${sv.sub.name} (marcada para cancelar)`, value: a.ctx.toBase(sv.monthly, sv.sub.currency) });
        else if (sv.usage === "low")
          ideas.push({ text: `Rever ${sv.sub.name} (sem uso há ${sv.daysSinceUse} dias)`, value: a.ctx.toBase(sv.monthly, sv.sub.currency) });
      }
      const mStart = startOfMonth(s.today);
      const prev: Record<string, Cents> = {};
      let count = 0;
      for (let i = 1; i <= 3; i++) {
        const st = startOfMonth(addMonths(mStart, -i));
        if (!s.transactions.some((t) => t.date <= endOfMonth(st))) continue;
        count++;
        const sp = spendingByCategory(s.transactions, s.accounts, a.ctx, st, endOfMonth(st));
        for (const [k, v] of Object.entries(sp)) prev[k] = (prev[k] ?? 0) + v;
      }
      if (count) {
        for (const cat of NON_ESSENTIAL_CATEGORIES) {
          if (cat === "subscriptions") continue;
          const avg = Math.round((prev[cat] ?? 0) / count);
          if (avg >= 1000) ideas.push({ text: `Reduzir ${categoryLabel(cat)} em 25% (média ${fmt(avg)}/mês)`, value: Math.round(avg * 0.25) });
        }
      } else missing.push("histórico de despesas de meses anteriores");
      ideas.sort((x, y) => y.value - x.value);
      let acc = 0;
      const chosen: typeof ideas = [];
      for (const idea of ideas) {
        if (target && acc >= target) break;
        chosen.push(idea);
        acc += idea.value;
      }
      return {
        intent,
        title: target ? `Economizar ${fmt(target)} por mês` : "Como economizar",
        summary: chosen.length
          ? `Com base nos seus dados, estas ações somam ${fmt(acc)}/mês${target ? (acc >= target ? " — suficiente para a meta" : `, ${fmt(target - acc)} abaixo da meta`) : ""}.`
          : "Ainda não há dados suficientes para sugerir cortes específicos.",
        problem: "Gastos não essenciais e assinaturas são os pontos mais fáceis de ajustar sem afetar necessidades básicas.",
        action: chosen.map((c) => `${c.text}: ${fmt(c.value)}/mês`).join("; ") || "Registre suas despesas por algumas semanas.",
        impact: `Economia anual estimada: ${fmt(acc * 12)}.`,
        risks: "A redução de 25% é uma sugestão de partida; assinaturas só são sinalizadas como pouco usadas quando você informou a data de último uso.",
        assumptions: count ? [`Médias dos últimos ${count} mês(es) completos.`] : [],
        missing,
        facts: { economia_mensal: fmt(acc) },
      };
    }

    case "outlook": {
      const months = extractMonths(question) ?? 6;
      const until = addMonths(s.today, months);
      const events = collectFlowEvents(s, a.ctx, { to: until, includeGoals: false });
      const scheduled = events.reduce((sum, e) => sum + e.amount, 0);
      const variable = a.capacity.variableSpending;
      if (variable === null) missing.push("histórico de gastos variáveis (ou orçamento mensal)");
      const projected = a.spendableBalance + scheduled - (variable ?? 0) * months;
      const debtLines = a.debts.map((d) => {
        const sim = simulateDebt({ ...d.baseParams, monthlyPayment: d.debt.plannedMonthlyPayment });
        return `${d.debt.name}: ${formatMoney(balanceAfterMonths(sim, months), d.debt.currency, locale)}`;
      });
      const goalLines = a.goals
        .filter((g) => g.goal.monthlyContribution > 0)
        .map((g) => {
          const future = Math.min(g.goal.targetAmount, g.saved + g.goal.monthlyContribution * months);
          return `${g.goal.name}: ${formatMoney(future, g.goal.currency, locale)}`;
        });
      void goalProgress;
      return {
        intent,
        title: `Daqui a ${monthsToText(months)}`,
        summary: `Saldo disponível projetado em ${formatDate(until, locale)}: ${fmt(projected)}${projected < 0 ? " (negativo — atenção)" : ""}.`,
        problem: `Hoje: ${fmt(a.spendableBalance)} disponíveis. Entradas e saídas programadas no período: ${fmt(scheduled)}; gastos variáveis estimados: ${fmt((variable ?? 0) * months)}.`,
        action: projected < 0 ? "Reduza gastos variáveis ou ajuste pagamentos planejados para evitar saldo negativo." : "Mantenha o plano; considere direcionar a sobra para metas ou para a dívida.",
        impact: [debtLines.length ? `Dívida: ${debtLines.join("; ")}` : "", goalLines.length ? `Metas: ${goalLines.join("; ")}` : ""]
          .filter(Boolean)
          .join(" · ") || "Sem dívidas ou metas com contribuição mensal.",
        risks: "Projeção, não garantia: depende de as receitas caírem nas datas previstas e de os gastos seguirem a média.",
        assumptions: [
          "Inclui receitas recorrentes, contas, assinaturas, despesas recorrentes e pagamentos planejados da dívida.",
          `Gastos variáveis: ${variable !== null ? `${fmt(variable)}/mês` : "não estimados"}.`,
          ...a.capacity.assumptions,
        ],
        missing,
        facts: { saldo_projetado: fmt(projected), meses: String(months) },
      };
    }

    case "balance":
      return {
        intent,
        title: "Seu saldo",
        summary: `Saldo total: ${fmt(a.totalBalance)}; disponível para uso: ${fmt(a.spendableBalance)}.`,
        problem: a.accountRows.map((r) => `${r.account.name}: ${formatMoney(r.balance, r.account.currency, locale)}`).join("; ") || "Nenhuma conta cadastrada.",
        action: "Confira se os recebimentos e pagamentos recentes estão registrados.",
        impact: `Livre para gastar este mês: ${fmt(a.safeMonth.amount)}.`,
        risks: "O saldo real só inclui movimentações marcadas como pagas/recebidas.",
        assumptions: [],
        missing,
        facts: { saldo_total: fmt(a.totalBalance) },
      };

    case "help":
    default:
      return simple(
        "help",
        "Como posso ajudar",
        "Posso responder, com base nos seus dados: se você pode fazer uma compra, quanto pode gastar até o próximo pagamento, qual conta pagar primeiro, se está gastando demais em uma categoria, quanto reservar para a faculdade, quanto pagar por mês para quitar o empréstimo, como economizar um valor por mês e como estará sua situação daqui a alguns meses.",
        missing,
      );
  }
}

function simple(intent: Intent, title: string, summary: string, missing: string[]): AssistantAnswer {
  return { intent, title, summary, problem: "", action: "", impact: "", risks: "", assumptions: [], missing, facts: {} };
}
