"use server";

import { z } from "zod";
import { advanceOnce } from "@/lib/finance/recurrence";
import { toCents } from "@/lib/finance/money";
import type { Currency, SubscriptionCycle } from "@/lib/finance/types";
import { isoDate, subscriptionChargeSchema, subscriptionSchema, uuid } from "@/lib/validation";
import { amountInAccount, dec, getAccount, idSchema, run, userToday, UserError } from "./helpers";

export async function createSubscription(raw: unknown) {
  return run(
    subscriptionSchema,
    raw,
    async (v, { db }) => {
      await db.query(
        `insert into subscriptions (name, amount, currency, billing_cycle, next_charge_date, category, account_id, status, last_used_on, usage_note, notes)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [v.name, v.amount, v.currency, v.billingCycle, v.nextChargeDate, v.category, v.accountId, v.status, v.lastUsedOn, v.usageNote, v.notes],
      );
    },
    { message: "Subscription added" },
  );
}

export async function updateSubscription(raw: unknown) {
  return run(
    z.intersection(idSchema, subscriptionSchema),
    raw,
    async (v, { db }) => {
      const r = await db.query(
        `update subscriptions set name = $2, amount = $3, currency = $4, billing_cycle = $5, next_charge_date = $6, category = $7,
           account_id = $8, status = $9, last_used_on = $10, usage_note = $11, notes = $12 where id = $1 returning id`,
        [v.id, v.name, v.amount, v.currency, v.billingCycle, v.nextChargeDate, v.category, v.accountId, v.status, v.lastUsedOn, v.usageNote, v.notes],
      );
      if (!r.length) throw new UserError("Subscription not found.");
    },
    { message: "Subscription updated" },
  );
}

export async function setSubscriptionStatus(raw: unknown) {
  return run(
    z.object({ id: uuid, status: z.enum(["active", "cancel_planned", "cancelled"]) }),
    raw,
    async (v, { db }) => {
      await db.query("update subscriptions set status = $2 where id = $1", [v.id, v.status]);
    },
    { message: "Status updated" },
  );
}

export async function markSubscriptionUsed(raw: unknown) {
  return run(idSchema, raw, async (v, { db }) => {
    const today = await userToday(db);
    await db.query("update subscriptions set last_used_on = $2 where id = $1", [v.id, today]);
  }, { message: "Marked as used today" });
}

async function advance(db: Parameters<Parameters<typeof run>[2]>[1]["db"], id: string) {
  const s = await db.query<{ next_charge_date: string; billing_cycle: SubscriptionCycle }>(
    "select next_charge_date::text, billing_cycle from subscriptions where id = $1",
    [id],
  );
  if (!s[0]) throw new UserError("Subscription not found.");
  const next = advanceOnce({ start: s[0].next_charge_date, frequency: s[0].billing_cycle }, s[0].next_charge_date);
  await db.query("update subscriptions set next_charge_date = $2 where id = $1", [id, next]);
  return next;
}

/** Registers the charge as an expense and moves the next charge date forward one cycle. */
export async function recordSubscriptionCharge(raw: unknown) {
  return run(
    subscriptionChargeSchema,
    raw,
    async (v, { db }) => {
      const s = await db.query<{ name: string; currency: Currency; category: string; status: string }>(
        "select name, currency, category, status from subscriptions where id = $1",
        [v.subscriptionId],
      );
      if (!s[0]) throw new UserError("Subscription not found.");
      const acc = await getAccount(db, v.accountId);
      const { accountAmount, fxRate } = await amountInAccount(db, acc.currency, toCents(v.amount), s[0].currency, v.fxRate);
      await db.query(
        `insert into transactions (kind, status, date, amount, currency, account_id, account_amount, fx_rate, category, description, subscription_id, recurrence)
         values ('expense', 'paid', $1, $2, $3, $4, $5, $6, $7, $8, $9, 'none')`,
        [v.date, v.amount, s[0].currency, v.accountId, dec(accountAmount), fxRate, s[0].category, s[0].name, v.subscriptionId],
      );
      return advance(db, v.subscriptionId);
    },
    { message: "Charge recorded" },
  );
}

export async function skipSubscriptionCharge(raw: unknown) {
  return run(z.object({ id: uuid, confirmDate: isoDate.optional() }), raw, async (v, { db }) => advance(db, v.id), {
    message: "Charge skipped — next date updated",
  });
}

export async function deleteSubscription(raw: unknown) {
  return run(
    idSchema,
    raw,
    async (v, { db }) => {
      const r = await db.query("delete from subscriptions where id = $1 returning id", [v.id]);
      if (!r.length) throw new UserError("Subscription not found.");
    },
    { message: "Subscription deleted (recorded charges were kept)" },
  );
}
