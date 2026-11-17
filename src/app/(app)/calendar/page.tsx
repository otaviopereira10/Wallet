import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/primitives";
import { collectFlowEvents, expectedIncomeOccurrences } from "@/lib/finance/cashflow";
import { addMonthKey, endOfMonth, isISODate, maxDate, monthKey } from "@/lib/finance/dates";
import { incrementDates } from "@/lib/finance/debt";
import { formatMoney, formatMonth } from "@/lib/format";
import { getAppData } from "@/server/context";
import { CalendarClient, type CalEvent } from "./calendar-client";

export const metadata: Metadata = { title: "Calendário" };

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { month } = await searchParams;
  const { snapshot: s, analysis: a } = await getAppData();
  const loc = s.profile.locale;
  const key = month && /^\d{4}-\d{2}$/.test(month) && isISODate(`${month}-01`) ? month : monthKey(s.today);
  const from = `${key}-01`;
  const to = endOfMonth(from);
  const inMonth = (d: string) => d >= from && d <= to;
  const money = (c: number, cur: "USD" | "BRL") => formatMoney(c, cur, loc);
  const events: CalEvent[] = [];
  const billTx = new Set(s.billPayments.map((p) => p.transactionId).filter(Boolean) as string[]);

  // Real movements already registered.
  for (const t of s.transactions) {
    if (!inMonth(t.date)) continue;
    if (t.kind === "income") events.push({ id: t.id, date: t.date, kind: "income_received", title: t.description, amount: money(t.amount, t.currency) });
    else if (t.kind === "expense" && t.status === "pending")
      events.push({ id: t.id, date: t.date, kind: "expense_pending", title: t.description, amount: money(t.amount, t.currency) });
    else if (t.kind === "expense" && !billTx.has(t.id) && !t.subscriptionId)
      events.push({ id: t.id, date: t.date, kind: "expense_paid", title: t.description, amount: money(t.amount, t.currency) });
    else if (t.kind === "expense" && t.subscriptionId)
      events.push({ id: t.id, date: t.date, kind: "subscription", title: `${t.description} (cobrada)`, amount: money(t.amount, t.currency) });
    else if (t.kind === "debt_payment") events.push({ id: t.id, date: t.date, kind: "debt_payment", title: t.description, amount: money(t.amount, t.currency) });
    else if (t.kind === "refund") events.push({ id: t.id, date: t.date, kind: "income_received", title: `Reembolso: ${t.description}`, amount: money(t.amount, t.currency) });
  }
  // Bills: due dates and payments made.
  for (const v of a.views) {
    if (inMonth(v.occurrence.dueDate))
      events.push({
        id: `due-${v.occurrence.id}`,
        date: v.occurrence.dueDate,
        kind: v.status === "paid" || v.status === "waived" ? "bill_paid" : v.status === "overdue" ? "bill_overdue" : "bill_due",
        title: `Vence: ${v.bill.name}`,
        amount: money(v.status === "paid" ? v.occurrence.amountDue : v.remaining, v.bill.currency),
      });
    for (const p of v.payments)
      if (inMonth(p.date)) events.push({ id: `pay-${p.id}`, date: p.date, kind: "bill_paid", title: `Pago: ${v.bill.name}`, amount: money(p.amount, v.bill.currency) });
  }
  // Expected incomes (not yet received).
  for (const { income, date } of expectedIncomeOccurrences(s.incomes, s.transactions, from, to)) {
    if (date < income.createdOn && date < s.today) continue;
    events.push({ id: `exp-${income.id}-${date}`, date, kind: "income_expected", title: `Previsto: ${income.name}`, amount: money(income.amount, income.currency) });
  }
  // Debt: posted increments + scheduled ones.
  for (const d of s.debts) {
    for (const e of s.debtEvents)
      if (e.debtId === d.id && e.type === "increment" && !e.voided && inMonth(e.date))
        events.push({ id: `inc-${e.id}`, date: e.date, kind: "debt_increment", title: `Acréscimo: ${d.name}`, amount: `+${money(e.amount, d.currency)}` });
    for (const date of incrementDates(d, maxDate(from, s.today > from ? s.today : from), to))
      if (date > s.today) events.push({ id: `incf-${d.id}-${date}`, date, kind: "debt_increment", title: `Acréscimo previsto: ${d.name}`, amount: `+${money(d.incrementAmount, d.currency)}` });
  }
  // Goals: contributions made + deadlines.
  for (const c of s.contributions) {
    const g = s.goals.find((x) => x.id === c.goalId);
    if (g && inMonth(c.date)) events.push({ id: `ct-${c.id}`, date: c.date, kind: "goal", title: `Contribuição: ${g.name}`, amount: money(c.amount, g.currency) });
  }
  for (const g of s.goals)
    if (g.deadline && inMonth(g.deadline) && !g.archived) events.push({ id: `dl-${g.id}`, date: g.deadline, kind: "goal", title: `Data limite: ${g.name}`, amount: money(g.targetAmount, g.currency) });
  // Future scheduled items (planned debt payments, subscriptions, planned goal contributions, recurring expenses).
  if (to >= s.today) {
    for (const e of collectFlowEvents(s, a.ctx, { to, includeGoals: true, views: a.views })) {
      if (!inMonth(e.date) || e.originalDate) continue;
      const kind = e.type === "debt" ? "debt_planned" : e.type === "subscription" ? "subscription" : e.type === "goal" ? "goal" : e.type === "recurring" ? "expense_pending" : null;
      if (!kind) continue;
      events.push({ id: `fl-${e.id}`, date: e.date, kind, title: e.type === "recurring" ? `Recorrente: ${e.label}` : e.label, amount: formatMoney(-e.amount, s.profile.baseCurrency, loc) });
    }
  }

  return (
    <>
      <PageHeader eyebrow="Análise" title="Calendário financeiro" description="Recebimentos, vencimentos, pagamentos, acréscimos da faculdade e metas — dia a dia." />
      <CalendarClient
        monthKey={key}
        monthLabel={formatMonth(key, loc, "long")}
        prevKey={addMonthKey(key, -1)}
        nextKey={addMonthKey(key, 1)}
        today={s.today}
        events={events.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0))}
      />
    </>
  );
}
