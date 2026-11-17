"use server";

import { z } from "zod";
import { occurrencesBetween } from "@/lib/finance/recurrence";
import { toCents } from "@/lib/finance/money";
import { incomeSchema, receiveIncomeSchema, skipIncomeSchema } from "@/lib/validation";
import { amountInAccount, dec, getAccount, idSchema, run, UserError } from "./helpers";
import type { Db } from "../db";
import type { Currency } from "@/lib/finance/types";

async function receive(
  db: Db,
  v: { incomeId: string; occurrence: string; date: string; amount: string; accountId: string; fxRate?: string | null },
) {
  const inc = await db.query<{ name: string; currency: Currency; category: string; start_date: string; frequency: string; custom_interval: number | null; custom_unit: string | null; end_date: string | null }>(
    "select name, currency, category, start_date::text, frequency, custom_interval, custom_unit, end_date::text from incomes where id = $1",
    [v.incomeId],
  );
  const i = inc[0];
  if (!i) throw new UserError("Receita não encontrada.");
  const valid = occurrencesBetween(
    { start: i.start_date, frequency: i.frequency as never, interval: i.custom_interval, unit: i.custom_unit as never, end: i.end_date },
    v.occurrence,
    v.occurrence,
  );
  if (!valid.length) throw new UserError("Esta data não corresponde a um recebimento previsto.");
  const acc = await getAccount(db, v.accountId);
  const { accountAmount, fxRate } = await amountInAccount(db, acc.currency, toCents(v.amount), i.currency, v.fxRate);
  await db.query(
    `insert into transactions (kind, status, date, amount, currency, account_id, account_amount, fx_rate, category, description, income_id, income_occurrence)
     values ('income', 'paid', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [v.date, v.amount, i.currency, v.accountId, dec(accountAmount), fxRate, i.category, i.name, v.incomeId, v.occurrence],
  );
}

export async function createIncome(raw: unknown) {
  return run(
    incomeSchema,
    raw,
    async (v, { db }) => {
      if (v.receivedNow && !v.accountId) throw new UserError("Escolha a conta de destino para registrar o recebimento.");
      const rows = await db.query<{ id: string }>(
        `insert into incomes (name, amount, currency, category, start_date, frequency, custom_interval, custom_unit, end_date, account_id, notes)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) returning id`,
        [v.name, v.amount, v.currency, v.category, v.startDate, v.frequency, v.frequency === "custom" ? v.customInterval : null,
          v.frequency === "custom" ? v.customUnit : null, v.endDate, v.accountId, v.notes],
      );
      if (v.receivedNow && v.accountId) {
        await receive(db, { incomeId: rows[0].id, occurrence: v.startDate, date: v.startDate, amount: v.amount, accountId: v.accountId });
      }
      return rows[0].id;
    },
    { message: "Receita cadastrada" },
  );
}

export async function updateIncome(raw: unknown) {
  return run(
    z.intersection(idSchema, incomeSchema),
    raw,
    async (v, { db }) => {
      const r = await db.query(
        `update incomes set name = $2, amount = $3, currency = $4, category = $5, start_date = $6, frequency = $7, custom_interval = $8,
           custom_unit = $9, end_date = $10, account_id = $11, notes = $12 where id = $1 returning id`,
        [v.id, v.name, v.amount, v.currency, v.category, v.startDate, v.frequency, v.frequency === "custom" ? v.customInterval : null,
          v.frequency === "custom" ? v.customUnit : null, v.endDate, v.accountId, v.notes],
      );
      if (!r.length) throw new UserError("Receita não encontrada.");
    },
    { message: "Receita atualizada" },
  );
}

export async function setIncomeActive(raw: unknown) {
  return run(z.object({ id: z.string().uuid(), active: z.boolean() }), raw, async (v, { db }) => {
    await db.query("update incomes set active = $2 where id = $1", [v.id, v.active]);
  });
}

/** Deletes the income rule; receipts already registered stay in the ledger. */
export async function deleteIncome(raw: unknown) {
  return run(
    idSchema,
    raw,
    async (v, { db }) => {
      await db.query("update transactions set income_id = null, income_occurrence = null where income_id = $1", [v.id]);
      const r = await db.query("delete from incomes where id = $1 returning id", [v.id]);
      if (!r.length) throw new UserError("Receita não encontrada.");
    },
    { message: "Fonte de renda excluída (recebimentos anteriores foram mantidos)" },
  );
}

export async function receiveIncome(raw: unknown) {
  return run(receiveIncomeSchema, raw, async (v, { db }) => receive(db, v), { message: "Recebimento confirmado" });
}

export async function skipIncomeOccurrence(raw: unknown) {
  return run(
    skipIncomeSchema,
    raw,
    async (v, { db }) => {
      await db.query(
        "update incomes set skipped_dates = array(select distinct unnest(skipped_dates || $2::date)) where id = $1",
        [v.incomeId, v.occurrence],
      );
    },
    { message: "Recebimento marcado como não recebido" },
  );
}

export async function unskipIncomeOccurrence(raw: unknown) {
  return run(skipIncomeSchema, raw, async (v, { db }) => {
    await db.query("update incomes set skipped_dates = array_remove(skipped_dates, $2::date) where id = $1", [v.incomeId, v.occurrence]);
  });
}
