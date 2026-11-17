"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { isValidTimeZone } from "@/lib/finance/dates";
import { accountSchema, manualRateSchema, profileSchema, uuid } from "@/lib/validation";
import { refreshRates } from "../services/fx";
import { idSchema, run, userToday, UserError } from "./helpers";

export async function updateProfile(raw: unknown) {
  return run(
    profileSchema,
    raw,
    async (v, { db }) => {
      if (!isValidTimeZone(v.timezone)) throw new UserError("Fuso horário inválido.");
      await db.query(
        `update profiles set display_name = $1, base_currency = $2, locale = $3, timezone = $4, theme = $5, emergency_buffer = $6,
           alert_days_ahead = $7, ai_enabled = $8 where user_id = auth.uid()`,
        [v.displayName, v.baseCurrency, v.locale, v.timezone, v.theme, v.emergencyBuffer, v.alertDaysAhead, v.aiEnabled],
      );
      (await cookies()).set("iw_theme", v.theme, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
    },
    { message: "Preferências salvas" },
  );
}

export async function setTheme(raw: unknown) {
  return run(z.object({ theme: z.enum(["light", "dark", "system"]) }), raw, async (v, { db }) => {
    await db.query("update profiles set theme = $1 where user_id = auth.uid()", [v.theme]);
    (await cookies()).set("iw_theme", v.theme, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  });
}

export async function completeOnboarding(raw: unknown) {
  return run(z.object({ done: z.literal(true) }), raw, async (_v, { db }) => {
    await db.query("update profiles set onboarding_completed = true where user_id = auth.uid()");
  });
}

export async function createAccount(raw: unknown) {
  return run(
    accountSchema,
    raw,
    async (v, { db }) => {
      const r = await db.query<{ id: string }>(
        `insert into accounts (name, type, currency, opening_balance, opening_date, include_in_available)
         values ($1, $2, $3, $4, $5, $6) returning id`,
        [v.name, v.type, v.currency, v.openingBalance, v.openingDate, v.includeInAvailable],
      );
      return r[0].id;
    },
    { message: "Conta criada" },
  );
}

export async function updateAccount(raw: unknown) {
  return run(
    z.intersection(idSchema, accountSchema),
    raw,
    async (v, { db }) => {
      const cur = await db.query<{ currency: string; n: string }>(
        "select currency, (select count(*)::text from transactions t where t.account_id = a.id or t.to_account_id = a.id) as n from accounts a where id = $1",
        [v.id],
      );
      if (!cur[0]) throw new UserError("Conta não encontrada.");
      if (cur[0].currency !== v.currency && Number(cur[0].n) > 0)
        throw new UserError("Não é possível mudar a moeda de uma conta com movimentações. Crie uma nova conta.");
      await db.query(
        "update accounts set name = $2, type = $3, currency = $4, opening_balance = $5, opening_date = $6, include_in_available = $7 where id = $1",
        [v.id, v.name, v.type, v.currency, v.openingBalance, v.openingDate, v.includeInAvailable],
      );
    },
    { message: "Conta atualizada" },
  );
}

export async function setAccountArchived(raw: unknown) {
  return run(z.object({ id: uuid, archived: z.boolean() }), raw, async (v, { db }) => {
    await db.query("update accounts set archived = $2 where id = $1", [v.id, v.archived]);
  }, { message: "Conta atualizada" });
}

export async function deleteAccount(raw: unknown) {
  return run(
    idSchema,
    raw,
    async (v, { db }) => {
      const used = await db.query<{ n: string }>(
        "select count(*)::text as n from transactions where account_id = $1 or to_account_id = $1",
        [v.id],
      );
      if (Number(used[0].n) > 0) throw new UserError("Esta conta tem movimentações. Arquive-a em vez de excluir.");
      await db.query("delete from accounts where id = $1", [v.id]);
    },
    { message: "Conta excluída" },
  );
}

export async function refreshFxNow() {
  return run(z.object({}), {}, async (_v, { user, db }) => {
    const today = await userToday(db);
    const r = await refreshRates(user.id, today);
    if (!r.ok) throw new UserError(r.error);
    return r.count;
  }, { message: "Cotação atualizada" });
}

export async function setManualRate(raw: unknown) {
  return run(
    manualRateSchema,
    raw,
    async (v, { db }) => {
      if (v.base === v.quote) throw new UserError("Escolha moedas diferentes.");
      await db.query(
        `insert into fx_rates (base, quote, rate, rate_date, source, is_manual, fetched_at) values ($1, $2, $3, $4, 'manual', true, now())
         on conflict (user_id, base, quote, rate_date, source) do update set rate = excluded.rate, fetched_at = now()`,
        [v.base, v.quote, v.rate, v.date],
      );
    },
    { message: "Taxa manual salva e em uso" },
  );
}

export async function deleteManualRates() {
  return run(z.object({}), {}, async (_v, { db }) => {
    await db.query("delete from fx_rates where is_manual");
  }, { message: "Taxas manuais removidas" });
}

/** Deletes every financial record of the user (keeps the login and preferences). */
export async function resetAllData(raw: unknown) {
  return run(
    z.object({ confirm: z.literal("APAGAR", { message: "Digite APAGAR para confirmar" }) }),
    raw,
    async (_v, { db }) => {
      for (const t of ["bill_payments", "debt_events", "goal_contributions", "transactions", "bill_occurrences", "bills", "subscriptions", "incomes", "debts", "goals", "budgets", "fx_rates", "accounts"])
        await db.query(`delete from ${t} where user_id = auth.uid()`);
      await db.query("update profiles set onboarding_completed = false where user_id = auth.uid()");
    },
    { message: "Todos os dados financeiros foram apagados" },
  );
}
