"use server";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { advanceOnce } from "@/lib/finance/recurrence";
import { toCents } from "@/lib/finance/money";
import type { Currency, ExpenseRecurrence } from "@/lib/finance/types";
import { expenseSchema, incomeTxSchema, isoDate, optionalRate, refundSchema, transferSchema, uuid } from "@/lib/validation";
import { amountInAccount, dec, getAccount, idSchema, run, UserError } from "./helpers";

export async function createExpense(raw: unknown) {
  return run(
    expenseSchema,
    raw,
    async (v, { db }) => {
      const amount = toCents(v.amount);
      let accountAmount: number | null = null;
      let fxRate: string | null = null;
      if (v.accountId) {
        const acc = await getAccount(db, v.accountId);
        if (v.status === "paid") ({ accountAmount, fxRate } = await amountInAccount(db, acc.currency, amount, v.currency, v.fxRate));
      }
      const seriesId = v.recurrence !== "none" ? randomUUID() : null;
      const rows = await db.query<{ id: string }>(
        `insert into transactions (kind, status, date, amount, currency, account_id, account_amount, fx_rate, category, description,
           payment_method, notes, recurrence, series_id)
         values ('expense', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) returning id`,
        [v.status, v.date, v.amount, v.currency, v.accountId, accountAmount === null ? null : dec(accountAmount), fxRate, v.category,
          v.description, v.paymentMethod ?? null, v.notes, v.recurrence, seriesId],
      );
      return rows[0].id;
    },
    { message: "Expense added" },
  );
}

export async function updateExpense(raw: unknown) {
  return run(
    z.intersection(idSchema, expenseSchema),
    raw,
    async (v, { db }) => {
      const current = await db.query<{ kind: string; series_id: string | null }>(
        "select kind, series_id from transactions where id = $1",
        [v.id],
      );
      if (!current[0] || current[0].kind !== "expense") throw new UserError("Expense not found.");
      const amount = toCents(v.amount);
      let accountAmount: number | null = null;
      let fxRate: string | null = null;
      if (v.accountId) {
        const acc = await getAccount(db, v.accountId);
        if (v.status === "paid") ({ accountAmount, fxRate } = await amountInAccount(db, acc.currency, amount, v.currency, v.fxRate));
      }
      const seriesId = v.recurrence === "none" ? current[0].series_id : (current[0].series_id ?? randomUUID());
      await db.query(
        `update transactions set status = $2, date = $3, amount = $4, currency = $5, account_id = $6, account_amount = $7, fx_rate = $8,
           category = $9, description = $10, payment_method = $11, notes = $12, recurrence = $13, series_id = $14
         where id = $1`,
        [v.id, v.status, v.date, v.amount, v.currency, v.accountId, accountAmount === null ? null : dec(accountAmount), fxRate, v.category,
          v.description, v.paymentMethod ?? null, v.notes, v.recurrence, seriesId],
      );
    },
    { message: "Expense updated" },
  );
}

export async function markExpensePaid(raw: unknown) {
  return run(
    z.object({ id: uuid, accountId: uuid, date: isoDate, fxRate: optionalRate }),
    raw,
    async (v, { db }) => {
      const rows = await db.query<{ amount: string; currency: Currency; status: string; kind: string }>(
        "select amount, currency, status, kind from transactions where id = $1",
        [v.id],
      );
      const t = rows[0];
      if (!t || t.kind !== "expense") throw new UserError("Expense not found.");
      if (t.status === "paid") throw new UserError("This expense is already paid.");
      const acc = await getAccount(db, v.accountId);
      const { accountAmount, fxRate } = await amountInAccount(db, acc.currency, toCents(t.amount), t.currency, v.fxRate);
      await db.query(
        "update transactions set status = 'paid', account_id = $2, account_amount = $3, fx_rate = $4, date = $5 where id = $1",
        [v.id, v.accountId, dec(accountAmount), fxRate, v.date],
      );
    },
    { message: "Expense marked as paid" },
  );
}

/** Creates the next occurrence of a recurring expense as a pending item. */
export async function addNextOccurrence(raw: unknown) {
  return run(
    idSchema,
    raw,
    async (v, { db }) => {
      const rows = await db.query<Record<string, string | null>>("select * from transactions where id = $1 and kind = 'expense'", [v.id]);
      const t = rows[0];
      if (!t || t.recurrence === "none") throw new UserError("This expense does not repeat.");
      const latest = await db.query<{ date: string }>(
        "select max(date)::text as date from transactions where coalesce(series_id, id) = coalesce($1::uuid, $2::uuid)",
        [t.series_id, t.id],
      );
      const from = latest[0]?.date ?? String(t.date);
      const next = advanceOnce({ start: from, frequency: t.recurrence as ExpenseRecurrence }, from);
      await db.query(
        `insert into transactions (kind, status, date, amount, currency, account_id, category, description, payment_method, notes, recurrence, series_id)
         values ('expense', 'pending', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [next, t.amount, t.currency, t.account_id, t.category, t.description, t.payment_method, t.notes, t.recurrence, t.series_id ?? t.id],
      );
      if (!t.series_id) await db.query("update transactions set series_id = id where id = $1", [t.id]);
      return next;
    },
    { message: "Next one added as pending" },
  );
}

export async function createIncomeTransaction(raw: unknown) {
  return run(
    incomeTxSchema,
    raw,
    async (v, { db }) => {
      const acc = await getAccount(db, v.accountId);
      const { accountAmount, fxRate } = await amountInAccount(db, acc.currency, toCents(v.amount), v.currency, v.fxRate);
      await db.query(
        `insert into transactions (kind, status, date, amount, currency, account_id, account_amount, fx_rate, category, description, notes)
         values ('income', 'paid', $1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [v.date, v.amount, v.currency, v.accountId, dec(accountAmount), fxRate, v.category, v.description, v.notes],
      );
    },
    { message: "Income recorded" },
  );
}

export async function updateIncomeTransaction(raw: unknown) {
  return run(
    z.intersection(idSchema, incomeTxSchema),
    raw,
    async (v, { db }) => {
      const acc = await getAccount(db, v.accountId);
      const { accountAmount, fxRate } = await amountInAccount(db, acc.currency, toCents(v.amount), v.currency, v.fxRate);
      const r = await db.query(
        `update transactions set date = $2, amount = $3, currency = $4, account_id = $5, account_amount = $6, fx_rate = $7,
           category = $8, description = $9, notes = $10 where id = $1 and kind = 'income' returning id`,
        [v.id, v.date, v.amount, v.currency, v.accountId, dec(accountAmount), fxRate, v.category, v.description, v.notes],
      );
      if (!r.length) throw new UserError("Income not found.");
    },
    { message: "Income updated" },
  );
}

export async function createTransfer(raw: unknown) {
  return run(
    transferSchema,
    raw,
    async (v, { db }) => {
      const from = await getAccount(db, v.fromAccountId);
      const to = await getAccount(db, v.toAccountId);
      const amount = toCents(v.amount);
      let toAmount: number;
      let fxRate: string | null = null;
      if (from.currency === to.currency) toAmount = amount;
      else if (v.toAmount) toAmount = toCents(v.toAmount);
      else ({ accountAmount: toAmount, fxRate } = await amountInAccount(db, to.currency, amount, from.currency));
      if (toAmount <= 0) throw new UserError("Enter the amount received in the destination account.");
      await db.query(
        `insert into transactions (kind, status, date, amount, currency, account_id, account_amount, to_account_id, to_amount, fx_rate, category, description)
         values ('transfer', 'paid', $1, $2, $3, $4, $2, $5, $6, $7, 'transfer', $8)`,
        [v.date, v.amount, from.currency, v.fromAccountId, v.toAccountId, dec(toAmount), fxRate, v.description ?? "Transfer between accounts"],
      );
    },
    { message: "Transfer recorded (not counted as income or expense)" },
  );
}

export async function createRefund(raw: unknown) {
  return run(
    refundSchema,
    raw,
    async (v, { db }) => {
      const acc = await getAccount(db, v.accountId);
      const { accountAmount, fxRate } = await amountInAccount(db, acc.currency, toCents(v.amount), v.currency, v.fxRate);
      if (v.refundOf) {
        const orig = await db.query<{ amount: string; kind: string }>("select amount, kind from transactions where id = $1", [v.refundOf]);
        if (!orig[0] || orig[0].kind !== "expense") throw new UserError("Original expense not found.");
        const already = await db.query<{ total: string | null }>(
          "select sum(amount)::text as total from transactions where refund_of = $1 and kind = 'refund'",
          [v.refundOf],
        );
        if (toCents(already[0]?.total ?? "0") + toCents(v.amount) > toCents(orig[0].amount))
          throw new UserError("Total refunds cannot be more than the original expense.");
      }
      await db.query(
        `insert into transactions (kind, status, date, amount, currency, account_id, account_amount, fx_rate, category, description, refund_of)
         values ('refund', 'paid', $1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [v.date, v.amount, v.currency, v.accountId, dec(accountAmount), fxRate, v.category, v.description, v.refundOf],
      );
    },
    { message: "Refund recorded" },
  );
}

export async function deleteTransaction(raw: unknown) {
  return run(
    idSchema,
    raw,
    async (v, { db }) => {
      const r = await db.query("delete from transactions where id = $1 returning id", [v.id]);
      if (!r.length) throw new UserError("Entry not found.");
    },
    { message: "Entry deleted" },
  );
}
