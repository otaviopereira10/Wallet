"use server";

import { z } from "zod";
import { missingOccurrences } from "@/lib/finance/bills";
import { toCents } from "@/lib/finance/money";
import type { Currency } from "@/lib/finance/types";
import { billPaymentSchema, billSchema, isoDate, occurrenceUpdateSchema, optionalUuid, uuid } from "@/lib/validation";
import type { Db } from "../db";
import { mapBill, mapOccurrence } from "../repo/mappers";
import { amountInAccount, dec, getAccount, idSchema, run, userToday, UserError } from "./helpers";

async function syncBill(db: Db, billId: string) {
  const today = await userToday(db);
  const bill = (await db.query("select * from bills where id = $1", [billId])).map(mapBill)[0];
  if (!bill) return;
  const occs = (await db.query("select * from bill_occurrences where bill_id = $1", [billId])).map(mapOccurrence);
  for (const o of missingOccurrences(bill, occs, today)) {
    await db.query(
      "insert into bill_occurrences (bill_id, due_date, amount_due, minimum_due) values ($1, $2, $3, $4) on conflict (bill_id, due_date) do nothing",
      [billId, o.dueDate, dec(o.amountDue), o.minimumDue === null ? null : dec(o.minimumDue)],
    );
  }
}

export async function createBill(raw: unknown) {
  return run(
    billSchema,
    raw,
    async (v, { db }) => {
      const rows = await db.query<{ id: string }>(
        `insert into bills (name, amount, minimum_amount, currency, category, priority, recurrence, first_due_date, end_date, late_fee,
           interest_rate, allows_partial, account_id, notes)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) returning id`,
        [v.name, v.amount, v.minimumAmount, v.currency, v.category, v.priority, v.recurrence, v.firstDueDate, v.endDate, v.lateFee,
          v.interestRate, v.allowsPartial, v.accountId, v.notes],
      );
      await syncBill(db, rows[0].id);
      return rows[0].id;
    },
    { message: "Bill added" },
  );
}

export async function updateBill(raw: unknown) {
  return run(
    z.intersection(idSchema, billSchema),
    raw,
    async (v, { db }) => {
      const r = await db.query(
        `update bills set name = $2, amount = $3, minimum_amount = $4, currency = $5, category = $6, priority = $7, recurrence = $8,
           first_due_date = $9, end_date = $10, late_fee = $11, interest_rate = $12, allows_partial = $13, account_id = $14, notes = $15
         where id = $1 returning id`,
        [v.id, v.name, v.amount, v.minimumAmount, v.currency, v.category, v.priority, v.recurrence, v.firstDueDate, v.endDate, v.lateFee,
          v.interestRate, v.allowsPartial, v.accountId, v.notes],
      );
      if (!r.length) throw new UserError("Bill not found.");
      // Future occurrences without payments follow the new rule/amount.
      const today = await userToday(db);
      await db.query(
        `delete from bill_occurrences o where o.bill_id = $1 and o.due_date >= $2
           and not exists (select 1 from bill_payments p where p.occurrence_id = o.id)`,
        [v.id, today],
      );
      await syncBill(db, v.id);
    },
    { message: "Bill updated" },
  );
}

export async function setBillActive(raw: unknown) {
  return run(z.object({ id: uuid, active: z.boolean() }), raw, async (v, { db }) => {
    await db.query("update bills set active = $2 where id = $1", [v.id, v.active]);
    if (v.active) await syncBill(db, v.id);
  });
}

export async function deleteBill(raw: unknown) {
  return run(
    idSchema,
    raw,
    async (v, { db }) => {
      const r = await db.query("delete from bills where id = $1 returning id", [v.id]);
      if (!r.length) throw new UserError("Bill not found.");
    },
    { message: "Bill deleted (payments already recorded stay in your expenses)" },
  );
}

async function payOccurrence(
  db: Db,
  v: { occurrenceId: string; amount: string; date: string; accountId: string | null; paymentMethod?: string | null; recordOutflow: boolean; fxRate?: string | null },
) {
  const rows = await db.query<{
    amount_due: string; waived: boolean; name: string; currency: Currency; category: string; allows_partial: boolean; paid: string | null;
  }>(
    `select o.amount_due, o.waived, b.name, b.currency, b.category, b.allows_partial,
            (select sum(p.amount)::text from bill_payments p where p.occurrence_id = o.id) as paid
       from bill_occurrences o join bills b on b.id = o.bill_id where o.id = $1`,
    [v.occurrenceId],
  );
  const o = rows[0];
  if (!o) throw new UserError("Due date not found.");
  if (o.waived) throw new UserError("This due date was skipped.");
  const remaining = toCents(o.amount_due) - toCents(o.paid ?? "0");
  const amount = toCents(v.amount);
  if (remaining <= 0) throw new UserError("This one is already paid.");
  if (amount > remaining) throw new UserError(`The amount is more than what is left (${dec(remaining)}).`);
  if (amount < remaining && !o.allows_partial)
    throw new UserError("This bill does not accept partial payments. Turn that option on when editing the bill, if needed.");
  let transactionId: string | null = null;
  if (v.recordOutflow) {
    if (!v.accountId) throw new UserError("Choose the account you paid from.");
    const acc = await getAccount(db, v.accountId);
    const { accountAmount, fxRate } = await amountInAccount(db, acc.currency, amount, o.currency, v.fxRate);
    const tx = await db.query<{ id: string }>(
      `insert into transactions (kind, status, date, amount, currency, account_id, account_amount, fx_rate, category, description, payment_method)
       values ('expense', 'paid', $1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
      [v.date, dec(amount), o.currency, v.accountId, dec(accountAmount), fxRate, o.category, `Payment: ${o.name}`, v.paymentMethod ?? null],
    );
    transactionId = tx[0].id;
  }
  await db.query("insert into bill_payments (occurrence_id, date, amount, transaction_id) values ($1, $2, $3, $4)", [
    v.occurrenceId,
    v.date,
    dec(amount),
    transactionId,
  ]);
}

export async function payBill(raw: unknown) {
  return run(billPaymentSchema, raw, async (v, { db }) => payOccurrence(db, v), {
    message: "Payment recorded. Reminder: Isabelle Wallet only keeps records — no real money is moved.",
  });
}

/** Records several payments chosen in the Smart Payment Planner simulation. */
export async function recordPlannedPayments(raw: unknown) {
  return run(
    z.object({
      date: isoDate,
      accountId: uuid,
      items: z
        .array(z.object({ id: z.string().min(1).max(80), amount: z.string().regex(/^\d{1,12}(\.\d{1,2})?$/) }))
        .min(1, "No payments selected")
        .max(100),
    }),
    raw,
    async (v, { db }) => {
      for (const it of v.items) {
        if (toCents(it.amount) <= 0) continue;
        if (it.id.startsWith("expense:")) {
          const id = it.id.slice(8);
          const t = await db.query<{ amount: string; currency: Currency; status: string }>(
            "select amount, currency, status from transactions where id = $1 and kind = 'expense'",
            [id],
          );
          if (!t[0] || t[0].status !== "pending") continue;
          if (toCents(it.amount) !== toCents(t[0].amount)) throw new UserError("Pending expenses must be paid in full.");
          const acc = await getAccount(db, v.accountId);
          const { accountAmount, fxRate } = await amountInAccount(db, acc.currency, toCents(t[0].amount), t[0].currency);
          await db.query(
            "update transactions set status = 'paid', account_id = $2, account_amount = $3, fx_rate = $4, date = $5 where id = $1",
            [id, v.accountId, dec(accountAmount), fxRate, v.date],
          );
        } else {
          if (!z.string().uuid().safeParse(it.id).success) throw new UserError("Invalid item.");
          await payOccurrence(db, { occurrenceId: it.id, amount: it.amount, date: v.date, accountId: v.accountId, recordOutflow: true });
        }
      }
    },
    { message: "Planned payments recorded" },
  );
}

export async function updateOccurrence(raw: unknown) {
  return run(
    occurrenceUpdateSchema,
    raw,
    async (v, { db }) => {
      const r = await db.query(
        "update bill_occurrences set amount_due = $2, minimum_due = $3, waived = $4, notes = $5 where id = $1 returning id",
        [v.occurrenceId, v.amountDue, v.minimumDue, v.waived, v.notes],
      );
      if (!r.length) throw new UserError("Due date not found.");
    },
    { message: "Due date updated" },
  );
}

export async function deleteBillPayment(raw: unknown) {
  return run(
    z.object({ id: uuid, transactionId: optionalUuid }),
    raw,
    async (v, { db }) => {
      const p = await db.query<{ transaction_id: string | null }>("select transaction_id from bill_payments where id = $1", [v.id]);
      if (!p[0]) throw new UserError("Payment not found.");
      if (p[0].transaction_id) await db.query("delete from transactions where id = $1", [p[0].transaction_id]);
      await db.query("delete from bill_payments where id = $1", [v.id]);
    },
    { message: "Payment removed" },
  );
}
