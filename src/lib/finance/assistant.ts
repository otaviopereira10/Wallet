import { categoryLabel, NON_ESSENTIAL_CATEGORIES, PRIORITY_LABELS } from "../constants";
import { formatDate, formatMoney, monthsToText } from "../format";
import type { Analysis } from "./analysis";
import { buildTimeline, collectFlowEvents, lowestPoint, maxSpendKeepingFloor } from "./cashflow";
import { parseMoney } from "./csv";
import { addDays, addMonths, diffDays, endOfMonth, startOfMonth } from "./dates";
import { balanceAfterMonths, requiredPaymentForTarget, simulateDebt } from "./debt";
import { spendingByCategory } from "./ledger";
import { planPayments } from "./planner";
import { plannerItemsFrom } from "./planner-input";
import type { Cents, Snapshot } from "./types";

/**
 * Isabelle Intelligence — deterministic layer. Every number comes from the
 * user's data through the financial engine. When data is missing the answer
 * says what is missing instead of guessing. An optional LLM (server-side) may
 * rephrase these facts but never replaces them.
 * Questions are understood in English and Portuguese; answers are in English.
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
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  um: 1, uma: 1, dois: 2, duas: 2, "três": 3, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12,
};

const CATEGORY_KEYWORDS: Array<[RegExp, string]> = [
  [/food|eating|dining|restaurant|takeout|delivery|aliment|comida|restaurante|lanche|ifood/, "food"],
  [/grocer|supermarket|mercado|supermercado/, "groceries"],
  [/transport|uber|lyft|gas\b|fuel|bus|subway|transporte|gasolina|ônibus|onibus|metr[oô]/, "transport"],
  [/housing|rent|home\b|moradia|aluguel|casa\b/, "housing"],
  [/education|course|book|educa[cç][aã]o|curso|livro/, "education"],
  [/health|doctor|pharmacy|sa[uú]de|m[eé]dico|farm[aá]cia/, "health"],
  [/gym|fitness|academia/, "fitness"],
  [/entertainment|fun|movies?|party|entretenimento|lazer|cinema|festa/, "entertainment"],
  [/shopping|clothes|personal|compras|roupa|pessoais/, "personal"],
  [/subscription|streaming|assinatura/, "subscriptions"],
  [/travel|trip|vacation|viage/, "travel"],
];

export function detectIntent(question: string): Intent {
  const q = question.toLowerCase();
  if (
    /(until|till|before).*(next).*(pay|payday|paycheck|income|scholarship|salary|deposit)|spend (until|till|before)/.test(q) ||
    /(at[eé]).*(pr[oó]xim[oa]).*(pagamento|sal[aá]rio|recebimento|bolsa)|gastar at[eé]/.test(q)
  )
    return "spend_until_income";
  if (/(can i|could i|am i able to|should i).*(buy|afford|spend|purchase|get)|(posso|consigo|da pra|dá pra).*(comprar|gastar|pagar algo)/.test(q))
    return "can_afford";
  if (/(which|what).*(bill|payment).*(first|priority)|pay first|(qual).*(conta).*(primeiro|prioridade)|pagar primeiro/.test(q)) return "which_bill_first";
  if (
    /(pay off|payoff|pay|clear).*(loan|debt)|(loan|debt).*(per month|a month|monthly)/.test(q) ||
    /(quitar|pagar).*(empr[eé]stimo|d[ií]vida)|(empr[eé]stimo|d[ií]vida).*(por m[eê]s|mensal)/.test(q)
  )
    return "debt_monthly";
  if (/(save|set aside|reserve|put aside).*(college|university|semester|tuition)|(reserv|guardar).*(faculdade|universidade|semestre)/.test(q))
    return "college_reserve";
  if (/(save|cut|economizar|poupar|cortar).*(per month|a month|monthly|por m[eê]s|mensal|\d)/.test(q) || /how (can|do) i save|como (posso )?economizar/.test(q))
    return "save_amount";
  if (/(in (\d+|a|one|two|three|four|five|six|nine|twelve) |next|future|outlook|situation|finances|where will|look like|daqui a|em \d+|pr[oó]ximos?|situa[cç][aã]o).*(months?|years?|m[eê]s|meses|anos?)/.test(q)) return "outlook";
  if (/(spending|spend|spent|gastando|gasto|gastei).*(too much|a lot|on|demais|muito|com)/.test(q)) return "category_spending";
  if (/balance|how much (money )?(do )?i have|saldo|quanto (eu )?tenho/.test(q)) return "balance";
  return "help";
}

export function extractAmount(question: string): Cents | null {
  const m = /(?:us\$|r\$|\$)\s?([\d.,]+)|([\d][\d.,]*)\s?(?:dollars|bucks|usd|brl|reais|d[oó]lares)?/i.exec(question);
  if (!m) return null;
  const raw = (m[1] ?? m[2]).replace(/[.,]$/, "");
  const v = parseMoney(raw);
  return v !== null && v > 0 ? v : null;
}

export function extractMonths(question: string): number | null {
  const q = question.toLowerCase();
  const m = /(\d+|[a-zçêé]+)\s+(months?|years?|m[eê]s|meses|anos?)/.exec(q);
  if (!m) return null;
  const n = /^\d+$/.test(m[1]) ? Number(m[1]) : NUMBER_WORDS[m[1]];
  if (!n) return null;
  return /year|ano/.test(m[2]) ? n * 12 : n;
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
  if (noAccounts && intent !== "help") missing.push("your accounts with their current balance (Accounts page)");

  switch (intent) {
    case "can_afford": {
      const amount = extractAmount(question);
      if (amount === null) {
        return simple(intent, "How much is the purchase?", "Include the amount, for example: “Can I buy something for $150 this month?”", missing);
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
          ? ` Heads up: counting the bills of the next 60 days${a.nextIncome ? "" : " and with no future income added"}, your balance is expected to reach ${fmt(lowAfter)} on ${formatDate(low.date, locale)}.`
          : "";
      return {
        intent,
        title: `Buying something for ${fmt(amount)}`,
        summary: yes
          ? `Yes, for this month: after the purchase you would still have ${fmt(safe - amount)} free until ${formatDate(monthEnd, locale)}, without counting money you have not received yet.${futureWarning}`
          : maybe
            ? `Only if your expected income arrives on time. Without it, what is free today is ${fmt(safe)}.`
            : `Not right now: you have ${fmt(safe)} free this month, and even counting expected income, the lowest point in the next 60 days leaves ${fmt(floorSpend)} of room.`,
        problem: `You want to spend ${fmt(amount)}. You have ${fmt(a.spendableBalance)} available and ${fmt(a.safeMonth.obligations)} in bills and payments due by the end of the month.`,
        action: yes
          ? "Go ahead, and record it as an expense so your balance stays accurate."
          : maybe
            ? "Wait until your next income arrives before buying, or split the cost."
            : `Postpone the purchase or lower it to at most ${fmt(Math.max(safe, 0))}.`,
        impact: `Free money left this month after the purchase: ${fmt(safe - amount)}.${
          low && lowAfter !== null ? ` Lowest expected balance in the next 60 days, including the purchase: ${fmt(lowAfter)} on ${formatDate(low.date, locale)}.` : ""
        }`,
        risks: "Based on the bills, subscriptions and income you entered; everyday spending you have not recorded is not included.",
        assumptions: [`Safety cushion kept: ${fmt(s.profile.emergencyBuffer)}.`, "“Free this month” does not count money you have not received yet."],
        missing,
        facts: { amount: fmt(amount), free_this_month: fmt(safe), room_next_60_days: fmt(floorSpend) },
      };
    }

    case "spend_until_income": {
      const next = a.nextIncome;
      if (!next) missing.push("your upcoming income (so the app knows when the next payment arrives)");
      const r = a.safeUntilIncome;
      return {
        intent,
        title: "Until your next payment",
        summary: next
          ? `You can spend up to ${fmt(r.amount)} until ${formatDate(next.date, locale)} (${next.label}).`
          : `With no upcoming income added, I used the end of the month: ${fmt(r.amount)}.`,
        problem: `Available ${fmt(r.spendable)}; bills and payments due by ${formatDate(r.until, locale)}: ${fmt(r.obligations)}.`,
        action: `Keep everyday spending under ${fmt(r.amount)}${next ? `, about ${fmt(Math.floor(r.amount / Math.max(1, diffDays(s.today, next.date))))} per day` : ""}.`,
        impact: "Staying under this amount keeps every bill until your next income covered and your safety cushion untouched.",
        risks: "Bills you have not added, or income arriving late, would reduce this amount.",
        assumptions: [`Safety cushion: ${fmt(r.buffer)}.`],
        missing,
        facts: { can_spend: fmt(r.amount), until: r.until },
      };
    }

    case "which_bill_first": {
      const items = plannerItemsFrom(s, a, 30);
      if (!items.length) {
        return simple(intent, "No open bills", "There are no bills or pending expenses in the next 30 days.", [
          ...missing,
          ...(s.bills.length ? [] : ["your bills (Bills page)"]),
        ]);
      }
      const plan = planPayments({ cash: a.spendableBalance, buffer: s.profile.emergencyBuffer, items, today: s.today });
      const first = plan.order[0];
      return {
        intent,
        title: "Which bill to pay first",
        summary: `Pay “${first.item.name}” first (${PRIORITY_LABELS[first.item.priority]}, due ${formatDate(first.item.dueDate, locale)}, ${fmt(first.item.amount)}).`,
        problem: `${items.length} bill(s) and payment(s) totaling ${fmt(plan.totalRequired)}; you have ${fmt(plan.cash)} available.`,
        action: plan.order
          .slice(0, 4)
          .map((o) => `${o.rank}. ${o.item.name} — set aside ${fmt(o.allocated)}`)
          .join("; "),
        impact:
          plan.shortfall > 0
            ? `You are ${fmt(plan.shortfall)} short of covering everything. Highest risk: “${plan.highestRisk?.item.name}”.`
            : `Everything is covered; ${fmt(plan.safeToSpend)} stays free after your safety cushion.`,
        risks: plan.tieExplanations[0] ?? "Order: priority, overdue first, due date, cost of paying late, then amount.",
        assumptions: ["Looks at bills and pending expenses due in the next 30 days."],
        missing,
        facts: { first: first.item.name, short_by: fmt(plan.shortfall) },
      };
    }

    case "category_spending": {
      const cat = extractCategory(question);
      if (!cat) return simple(intent, "Which category?", "Name the category, for example: “Am I spending too much on food?”", missing);
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
      if (!line) missing.push(`a monthly budget limit for ${categoryLabel(cat)}`);
      if (avg === null) missing.push("history from previous months");
      const over = line ? line.projected > line.limit : avg !== null ? now > avg : null;
      return {
        intent,
        title: categoryLabel(cat),
        summary:
          over === null
            ? `You spent ${fmt(now)} on ${categoryLabel(cat)} this month. There is nothing to compare it with yet.`
            : over
              ? `Yes, it is above plan: ${fmt(now)} so far${line ? `, heading to ${fmt(line.projected)} against a limit of ${fmt(line.limit)}` : `, above your average of ${fmt(avg!)}`}.`
              : `No, it is on track: ${fmt(now)} so far${line ? ` (limit ${fmt(line.limit)})` : ` (average ${fmt(avg!)})`}.`,
        problem: `Spent this month: ${fmt(now)}${avg !== null ? `; average of the last ${prevMonths.length} month(s): ${fmt(avg)}` : ""}.`,
        action: line
          ? `To finish the month within the limit, spend at most ${fmt(line.dailyAllowance)} per day.`
          : `Set a monthly limit for ${categoryLabel(cat)} on the Budget page to track it automatically.`,
        impact: line ? `Room left: ${fmt(line.remaining)}.` : "With a limit, you get a warning when you reach 80%.",
        risks: "The projection follows this month's everyday spending pace; one-off purchases can skew it.",
        assumptions: ["Includes paid and pending expenses, minus refunds."],
        missing,
        facts: { spent_this_month: fmt(now), average: avg !== null ? fmt(avg) : "no data" },
      };
    }

    case "college_reserve": {
      const d = a.debts[0];
      const collegeGoals = a.goals.filter((g) => g.goal.kind === "college");
      if (!d && !collegeGoals.length)
        return simple(intent, "No college information yet", "Add your university debt or a “College fund” goal.", [
          ...missing,
          "university debt or a “College fund” goal",
        ]);
      const lines: string[] = [];
      let monthly = 0;
      if (d && d.nextIncrement) {
        const months = Math.max(1, Math.ceil(diffDays(s.today, d.nextIncrement) / 30.44));
        const per = Math.ceil(d.debt.incrementAmount / months);
        monthly += a.ctx.toBase(per, d.debt.currency);
        lines.push(
          `Next semester charge of ${formatMoney(d.debt.incrementAmount, d.debt.currency, locale)} on ${formatDate(d.nextIncrement, locale)}: to cover it in full, set aside ${formatMoney(per, d.debt.currency, locale)}/month for ${months} month(s).`,
        );
      }
      for (const g of collegeGoals) {
        if (g.requiredMonthly !== null) {
          monthly += a.ctx.toBase(g.requiredMonthly, g.goal.currency);
          lines.push(`Goal “${g.goal.name}”: ${formatMoney(g.requiredMonthly, g.goal.currency, locale)}/month until ${formatDate(g.goal.deadline, locale)}.`);
        }
      }
      return {
        intent,
        title: "Saving for college",
        summary: monthly > 0 ? `Set aside about ${fmt(monthly)} per month.` : "There is no monthly amount to calculate with the current information.",
        problem: lines.join(" ") || "No upcoming charges or goals with a deadline.",
        action: "Create (or update) a “College fund” goal with this monthly contribution.",
        impact: d ? `Paying at least ${formatMoney(d.breakEven, d.debt.currency, locale)}/month stops the debt from growing.` : "Keeps the goal on schedule.",
        risks: "Uses the semester charge you set up; if the school changes the amount, update it on the University Debt page.",
        assumptions: ["Months calculated as 30.44 days on average."],
        missing,
        facts: { monthly_set_aside: fmt(monthly) },
      };
    }

    case "debt_monthly": {
      const d = a.debts[0];
      if (!d) return simple(intent, "No debt added yet", "Add your loan on the University Debt page.", [...missing, "university debt"]);
      const months = extractMonths(question);
      const target = months ? addMonths(s.today, months) : d.debt.targetPayoffDate;
      const dfmt = (c: Cents) => formatMoney(c, d.debt.currency, locale);
      const options = [24, 36, 60].map((m) => ({ m, pay: requiredPaymentForTarget(d.baseParams, addMonths(s.today, m)) }));
      const required = target ? requiredPaymentForTarget(d.baseParams, target) : null;
      if (d.planned?.incrementsOngoing && !d.debt.incrementsEndDate) missing.push("the date the semester charges end (e.g. graduation)");
      return {
        intent,
        title: "Monthly payment to pay it off",
        summary:
          required !== null
            ? `To pay it off by ${formatDate(target!, locale)}, pay about ${dfmt(required)} per month.`
            : target
              ? `It cannot be paid off by ${formatDate(target, locale)} with the semester charges you set up.`
              : `To stop the debt from growing, pay at least ${dfmt(d.breakEven)} per month.`,
        problem: `Current balance ${dfmt(d.balance)}; ${dfmt(d.debt.incrementAmount)} added every ${d.debt.incrementIntervalMonths} months${d.nextIncrement ? ` (next on ${formatDate(d.nextIncrement, locale)})` : ""}.`,
        action: options.map((o) => `${monthsToText(o.m)}: ${o.pay !== null ? `${dfmt(o.pay)}/month` : "not possible"}`).join("; "),
        impact: `Minimum to keep up with the semester charges: ${dfmt(d.breakEven)}/month.`,
        risks: "The simulation uses the real date of every semester charge and any interest you set up; changes in the school's rules change the result.",
        assumptions: [`Payments on day ${d.debt.paymentDay} of each month.`, `Interest: ${d.debt.interestRate}% per year.`],
        missing,
        facts: { balance: dfmt(d.balance), minimum: dfmt(d.breakEven) },
      };
    }

    case "save_amount": {
      const target = extractAmount(question) ?? 0;
      const ideas: Array<{ text: string; value: Cents }> = [];
      for (const sv of a.subscriptions) {
        if (sv.sub.status === "cancelled") continue;
        if (sv.sub.status === "cancel_planned")
          ideas.push({ text: `Cancel ${sv.sub.name} (flagged to cancel)`, value: a.ctx.toBase(sv.monthly, sv.sub.currency) });
        else if (sv.usage === "low") ideas.push({ text: `Review ${sv.sub.name} (not used for ${sv.daysSinceUse} days)`, value: a.ctx.toBase(sv.monthly, sv.sub.currency) });
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
          if (avg >= 1000) ideas.push({ text: `Cut ${categoryLabel(cat)} by 25% (average ${fmt(avg)}/month)`, value: Math.round(avg * 0.25) });
        }
      } else missing.push("expenses from previous months");
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
        title: target ? `Saving ${fmt(target)} per month` : "How to save",
        summary: chosen.length
          ? `Based on your data, these changes add up to ${fmt(acc)}/month${target ? (acc >= target ? " — enough for your target" : `, ${fmt(target - acc)} short of your target`) : ""}.`
          : "There is not enough data yet to suggest specific cuts.",
        problem: "Non-essential spending and subscriptions are the easiest places to adjust without touching basic needs.",
        action: chosen.map((c) => `${c.text}: ${fmt(c.value)}/month`).join("; ") || "Record your expenses for a few weeks first.",
        impact: `Estimated yearly savings: ${fmt(acc * 12)}.`,
        risks: "The 25% cut is a starting point; subscriptions are only flagged as unused when you told the app when you last used them.",
        assumptions: count ? [`Averages of the last ${count} full month(s).`] : [],
        missing,
        facts: { monthly_savings: fmt(acc) },
      };
    }

    case "outlook": {
      const months = extractMonths(question) ?? 6;
      const until = addMonths(s.today, months);
      const events = collectFlowEvents(s, a.ctx, { to: until, includeGoals: false });
      const scheduled = events.reduce((sum, e) => sum + e.amount, 0);
      const variable = a.capacity.variableSpending;
      if (variable === null) missing.push("your everyday spending history (or a monthly budget)");
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
      return {
        intent,
        title: `In ${monthsToText(months)}`,
        summary: `Expected available balance on ${formatDate(until, locale)}: ${fmt(projected)}${projected < 0 ? " (below zero — take care)" : ""}.`,
        problem: `Today: ${fmt(a.spendableBalance)} available. Scheduled money in and out in this period: ${fmt(scheduled)}; estimated everyday spending: ${fmt((variable ?? 0) * months)}.`,
        action:
          projected < 0
            ? "Reduce everyday spending or adjust planned payments to avoid going below zero."
            : "Keep the plan; consider sending what is left to your goals or to the debt.",
        impact:
          [debtLines.length ? `Debt: ${debtLines.join("; ")}` : "", goalLines.length ? `Goals: ${goalLines.join("; ")}` : ""].filter(Boolean).join(" · ") ||
          "No debts or goals with a monthly contribution.",
        risks: "An estimate, not a guarantee: it depends on income arriving on time and spending staying close to your average.",
        assumptions: [
          "Includes recurring income, bills, subscriptions, recurring expenses and planned debt payments.",
          `Everyday spending: ${variable !== null ? `${fmt(variable)}/month` : "not estimated"}.`,
          ...a.capacity.assumptions,
        ],
        missing,
        facts: { expected_balance: fmt(projected), months: String(months) },
      };
    }

    case "balance":
      return {
        intent,
        title: "Your balance",
        summary: `Total balance: ${fmt(a.totalBalance)}; available to use: ${fmt(a.spendableBalance)}.`,
        problem: a.accountRows.map((r) => `${r.account.name}: ${formatMoney(r.balance, r.account.currency, locale)}`).join("; ") || "No accounts added yet.",
        action: "Check that your recent income and payments are recorded.",
        impact: `Free to spend this month: ${fmt(a.safeMonth.amount)}.`,
        risks: "Your real balance only includes money marked as paid or received.",
        assumptions: [],
        missing,
        facts: { total_balance: fmt(a.totalBalance) },
      };

    case "help":
    default:
      return simple(
        "help",
        "What I can help with",
        "Using your own data, I can tell you whether you can afford a purchase, how much you can spend until your next payment, which bill to pay first, whether you are overspending in a category, how much to set aside for college, how much to pay each month to clear your loan, how to save a certain amount per month, and where your money will be in a few months.",
        missing,
      );
  }
}

function simple(intent: Intent, title: string, summary: string, missing: string[]): AssistantAnswer {
  return { intent, title, summary, problem: "", action: "", impact: "", risks: "", assumptions: [], missing, facts: {} };
}
