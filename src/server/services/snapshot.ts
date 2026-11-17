import "server-only";
import { missingOccurrences } from "@/lib/finance/bills";
import { todayInTimeZone } from "@/lib/finance/dates";
import { pendingAutoEvents } from "@/lib/finance/debt";
import { centsToDecimalString } from "@/lib/finance/money";
import type { Snapshot } from "@/lib/finance/types";
import type { Db } from "../db";
import { withUser } from "../db";
import * as m from "../repo/mappers";

export async function ensureProfile(db: Db) {
  await db.query("insert into profiles default values on conflict (user_id) do nothing");
  const rows = await db.query("select * from profiles where user_id = auth.uid()");
  return m.mapProfile(rows[0]);
}

/**
 * Brings scheduled data up to date (idempotent): materialises upcoming bill
 * occurrences and posts due semester increments / interest on debts.
 */
export async function syncScheduled(db: Db, today: string): Promise<void> {
  const bills = (await db.query("select * from bills where active")).map(m.mapBill);
  if (bills.length) {
    const occs = (await db.query("select * from bill_occurrences")).map(m.mapOccurrence);
    for (const bill of bills) {
      for (const o of missingOccurrences(bill, occs, today)) {
        await db.query(
          `insert into bill_occurrences (bill_id, due_date, amount_due, minimum_due)
           values ($1, $2, $3, $4) on conflict (bill_id, due_date) do nothing`,
          [bill.id, o.dueDate, centsToDecimalString(o.amountDue), o.minimumDue === null ? null : centsToDecimalString(o.minimumDue)],
        );
      }
    }
  }
  const debts = (await db.query("select * from debts where active")).map(m.mapDebt);
  if (debts.length) {
    const events = (await db.query("select * from debt_events")).map(m.mapDebtEvent);
    for (const debt of debts) {
      for (const e of pendingAutoEvents(debt, events.filter((x) => x.debtId === debt.id), today)) {
        await db.query(
          `insert into debt_events (debt_id, date, type, amount, automatic, note)
           values ($1, $2, $3, $4, true, $5) on conflict do nothing`,
          [debt.id, e.date, e.type, centsToDecimalString(e.amount), e.type === "increment" ? "Acréscimo semestral automático" : "Juros do mês"],
        );
      }
    }
  }
}

export async function loadSnapshotWith(db: Db): Promise<Snapshot> {
  const profile = await ensureProfile(db);
  const today = todayInTimeZone(profile.timezone);
  await syncScheduled(db, today);
  const [accounts, incomes, transactions, bills, occurrences, billPayments, subscriptions, debts, debtEvents, goals, contributions, budgets, fxRates] =
    [
      await db.query("select * from accounts order by archived, created_at"),
      await db.query("select *, skipped_dates::text[] as skipped_dates from incomes order by created_at"),
      await db.query("select * from transactions order by date desc, created_at desc"),
      await db.query("select * from bills order by created_at"),
      await db.query("select * from bill_occurrences order by due_date"),
      await db.query("select * from bill_payments order by date"),
      await db.query("select * from subscriptions order by next_charge_date"),
      await db.query("select * from debts order by created_at"),
      await db.query("select * from debt_events order by date, created_at"),
      await db.query("select * from goals order by archived, created_at"),
      await db.query("select * from goal_contributions order by date"),
      await db.query("select * from budgets order by category"),
      await db.query("select * from fx_rates order by fetched_at desc limit 500"),
    ];
  return {
    today,
    profile,
    accounts: accounts.map(m.mapAccount),
    incomes: incomes.map(m.mapIncome),
    transactions: transactions.map(m.mapTransaction),
    bills: bills.map(m.mapBill),
    occurrences: occurrences.map(m.mapOccurrence),
    billPayments: billPayments.map(m.mapBillPayment),
    subscriptions: subscriptions.map(m.mapSubscription),
    debts: debts.map(m.mapDebt),
    debtEvents: debtEvents.map(m.mapDebtEvent),
    goals: goals.map(m.mapGoal),
    contributions: contributions.map(m.mapContribution),
    budgets: budgets.map(m.mapBudget),
    fxRates: fxRates.map(m.mapFxRate),
  };
}

export async function loadSnapshot(userId: string): Promise<Snapshot> {
  return withUser(userId, loadSnapshotWith);
}
