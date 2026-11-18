"use server";

import { z } from "zod";
import { toCents } from "@/lib/finance/money";
import type { Currency } from "@/lib/finance/types";
import { debtEventSchema, debtPaymentSchema, debtSchema, uuid } from "@/lib/validation";
import { amountInAccount, dec, getAccount, idSchema, run, UserError } from "./helpers";

const params = (v: z.output<typeof debtSchema>) => [
  v.name,
  v.currency,
  v.initialBalance,
  v.startDate,
  v.incrementAmount,
  v.incrementIntervalMonths,
  v.incrementAnchorDate,
  v.incrementsEndDate,
  v.interestRate,
  v.interestSince,
  v.plannedMonthlyPayment,
  v.paymentDay,
  v.targetPayoffDate,
  v.notes,
];

function check(v: z.output<typeof debtSchema>) {
  if (Number(v.incrementAmount) > 0 && !v.incrementAnchorDate)
    throw new UserError("Add the next semester charge date (or set the charge to zero).");
  if (v.incrementsEndDate && v.incrementAnchorDate && v.incrementsEndDate < v.incrementAnchorDate)
    throw new UserError("The last charge date must be after the next charge date.");
}

export async function createDebt(raw: unknown) {
  return run(
    debtSchema,
    raw,
    async (v, { db }) => {
      check(v);
      const r = await db.query<{ id: string }>(
        `insert into debts (name, currency, initial_balance, start_date, increment_amount, increment_interval_months, increment_anchor_date,
           increments_end_date, interest_rate, interest_since, planned_monthly_payment, payment_day, target_payoff_date, notes)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) returning id`,
        params(v),
      );
      return r[0].id;
    },
    { message: "Debt added" },
  );
}

export async function updateDebt(raw: unknown) {
  return run(
    z.intersection(idSchema, debtSchema),
    raw,
    async (v, { db }) => {
      check(v);
      const r = await db.query(
        `update debts set name = $2, currency = $3, initial_balance = $4, start_date = $5, increment_amount = $6, increment_interval_months = $7,
           increment_anchor_date = $8, increments_end_date = $9, interest_rate = $10, interest_since = $11, planned_monthly_payment = $12,
           payment_day = $13, target_payoff_date = $14, notes = $15 where id = $1 returning id`,
        [v.id, ...params(v)],
      );
      if (!r.length) throw new UserError("Debt not found.");
    },
    { message: "Debt settings updated" },
  );
}

/** Quick update of the planned monthly payment (from the simulator). */
export async function setPlannedPayment(raw: unknown) {
  return run(
    z.object({ id: uuid, amount: z.string().regex(/^\d{1,12}(\.\d{1,2})?$/) }),
    raw,
    async (v, { db }) => {
      await db.query("update debts set planned_monthly_payment = $2 where id = $1", [v.id, v.amount]);
    },
    { message: "Planned monthly payment updated" },
  );
}

export async function deleteDebt(raw: unknown) {
  return run(
    idSchema,
    raw,
    async (v, { db }) => {
      const r = await db.query("delete from debts where id = $1 returning id", [v.id]);
      if (!r.length) throw new UserError("Debt not found.");
    },
    { message: "Debt deleted (payments stay in your money-out history)" },
  );
}

/**
 * A debt payment is a cash outflow (transaction of kind debt_payment) AND a
 * reduction of the debt (debt event linked to it). Counted once in each ledger.
 */
export async function payDebt(raw: unknown) {
  return run(
    debtPaymentSchema,
    raw,
    async (v, { db }) => {
      const d = await db.query<{ name: string; currency: Currency }>("select name, currency from debts where id = $1", [v.debtId]);
      if (!d[0]) throw new UserError("Debt not found.");
      let transactionId: string | null = null;
      if (v.recordOutflow) {
        if (!v.accountId) throw new UserError("Choose the account the payment came from.");
        const acc = await getAccount(db, v.accountId);
        const { accountAmount, fxRate } = await amountInAccount(db, acc.currency, toCents(v.amount), d[0].currency, v.fxRate);
        const tx = await db.query<{ id: string }>(
          `insert into transactions (kind, status, date, amount, currency, account_id, account_amount, fx_rate, category, description, debt_id)
           values ('debt_payment', 'paid', $1, $2, $3, $4, $5, $6, 'debt', $7, $8) returning id`,
          [v.date, v.amount, d[0].currency, v.accountId, dec(accountAmount), fxRate, `Payment: ${d[0].name}`, v.debtId],
        );
        transactionId = tx[0].id;
      }
      await db.query("insert into debt_events (debt_id, date, type, amount, transaction_id, note) values ($1, $2, 'payment', $3, $4, $5)", [
        v.debtId,
        v.date,
        v.amount,
        transactionId,
        v.note,
      ]);
    },
    { message: "Debt payment recorded" },
  );
}

export async function addDebtEvent(raw: unknown) {
  return run(
    debtEventSchema,
    raw,
    async (v, { db }) => {
      if (v.type === "increment" && Number(v.amount) < 0) throw new UserError("A charge must be a positive amount.");
      await db.query("insert into debt_events (debt_id, date, type, amount, note) values ($1, $2, $3, $4, $5)", [
        v.debtId,
        v.date,
        v.type,
        v.amount,
        v.note,
      ]);
    },
    { message: "Added to the history" },
  );
}

/** Automatic entries are voided (kept for idempotency); manual ones are deleted. */
export async function removeDebtEvent(raw: unknown) {
  return run(
    z.object({ id: uuid, restore: z.boolean().optional() }),
    raw,
    async (v, { db }) => {
      const e = await db.query<{ automatic: boolean; transaction_id: string | null }>(
        "select automatic, transaction_id from debt_events where id = $1",
        [v.id],
      );
      if (!e[0]) throw new UserError("Entry not found.");
      if (e[0].automatic) await db.query("update debt_events set voided = $2 where id = $1", [v.id, !v.restore]);
      else if (e[0].transaction_id) await db.query("delete from transactions where id = $1", [e[0].transaction_id]);
      else await db.query("delete from debt_events where id = $1", [v.id]);
    },
    { message: "History updated" },
  );
}
