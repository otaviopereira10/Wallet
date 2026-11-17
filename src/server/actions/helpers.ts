import "server-only";
import { refresh } from "next/cache";
import { z } from "zod";
import { FxConverter } from "@/lib/finance/fx";
import { centsToDecimalString, mulCents, toCents } from "@/lib/finance/money";
import type { Cents, Currency } from "@/lib/finance/types";
import { requireUserForAction, UnauthorizedError, type SessionUser } from "../auth/session";
import { withUser, type Db } from "../db";
import { mapFxRate } from "../repo/mappers";

import type { ActionResult } from "@/lib/action-result";
export type { ActionResult };

/** An error whose message is safe to show to the user. */
export class UserError extends Error {}

/**
 * Wraps a Server Action: authenticates, validates input with the shared Zod
 * schema, runs the handler as the user (RLS enforced), refreshes the client
 * router and converts failures into user-friendly messages (without logging
 * financial values).
 */
export async function run<S extends z.ZodType, T>(
  schema: S,
  raw: unknown,
  handler: (input: z.output<S>, ctx: { user: SessionUser; db: Db }) => Promise<T>,
  opts: { message?: string; skipRefresh?: boolean } = {},
): Promise<ActionResult<T>> {
  try {
    const user = await requireUserForAction();
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join(".") || "_";
        (fieldErrors[key] ??= []).push(issue.message);
      }
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos", fieldErrors };
    }
    const data = await withUser(user.id, (db) => handler(parsed.data, { user, db }));
    if (!opts.skipRefresh) refresh();
    return { ok: true, data, message: opts.message };
  } catch (err) {
    return toActionError(err);
  }
}

export function toActionError(err: unknown): { ok: false; error: string } {
  if (err instanceof UserError || err instanceof UnauthorizedError) return { ok: false, error: err.message };
  const code = (err as { code?: string })?.code;
  const map: Record<string, string> = {
    "23505": "Este registro já existe (possível duplicação).",
    "23503": "Este registro está ligado a outro item. Ajuste ou arquive em vez de excluir.",
    "23514": "Algum valor está fora do permitido.",
    "23502": "Preencha todos os campos obrigatórios.",
    "42501": "Acesso negado.",
    "22P02": "Formato de dado inválido.",
  };
  if (code && map[code]) return { ok: false, error: map[code] };
  // Log only the error type — never the payload with financial data.
  console.error("[action] unexpected error:", code ?? (err instanceof Error ? err.name : typeof err));
  return { ok: false, error: "Não foi possível concluir a operação. Tente novamente." };
}

export const dec = centsToDecimalString;
export const cents = (v: string | null | undefined) => (v === null || v === undefined ? null : toCents(v));

export async function getAccount(db: Db, id: string): Promise<{ id: string; currency: Currency; archived: boolean }> {
  const rows = await db.query<{ id: string; currency: Currency; archived: boolean }>(
    "select id, currency, archived from accounts where id = $1 and user_id = auth.uid()",
    [id],
  );
  if (!rows[0]) throw new UserError("Conta não encontrada.");
  return rows[0];
}

/**
 * Amount that actually hits an account. Same currency → identical. Different
 * currency → explicit conversion with the rate typed by the user or the latest
 * stored rate; if neither exists, the user must provide one.
 */
export async function amountInAccount(
  db: Db,
  accountCurrency: Currency,
  amount: Cents,
  currency: Currency,
  typedRate?: string | null,
): Promise<{ accountAmount: Cents; fxRate: string | null }> {
  if (accountCurrency === currency) return { accountAmount: amount, fxRate: null };
  let rate = typedRate ?? null;
  if (!rate) {
    const rows = (await db.query("select * from fx_rates order by fetched_at desc limit 200")).map(mapFxRate);
    rate = new FxConverter(rows).latest(currency, accountCurrency)?.rate ?? null;
  }
  if (!rate) throw new UserError(`Sem cotação ${currency}→${accountCurrency}. Informe a taxa de câmbio ou atualize a cotação em Configurações.`);
  const accountAmount = mulCents(amount, rate);
  if (accountAmount <= 0) throw new UserError("Valor convertido inválido.");
  return { accountAmount, fxRate: rate };
}

export const idSchema = z.object({ id: z.string().uuid("Identificador inválido") });

/** Today's date in the user's configured time zone. */
export async function userToday(db: Db): Promise<string> {
  const { todayInTimeZone } = await import("@/lib/finance/dates");
  const rows = await db.query<{ timezone: string }>("select timezone from profiles where user_id = auth.uid()");
  return todayInTimeZone(rows[0]?.timezone ?? "UTC");
}

export async function baseCurrency(db: Db): Promise<Currency> {
  const rows = await db.query<{ base_currency: Currency }>("select base_currency from profiles where user_id = auth.uid()");
  return rows[0]?.base_currency ?? "USD";
}
