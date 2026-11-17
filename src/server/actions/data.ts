"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { dedupeHash } from "@/lib/finance/csv";
import { centsToDecimalString, mulCents, toCents } from "@/lib/finance/money";
import type { Currency } from "@/lib/finance/types";
import { currency, expenseCategory, incomeCategory, isoDate, money, sanitize } from "@/lib/validation";
import { requireUserForAction } from "../auth/session";
import { withUser, type Db } from "../db";
import { FxConverter } from "@/lib/finance/fx";
import { mapFxRate } from "../repo/mappers";
import { restoreBackup as restore, validateBackupShape } from "../services/backup";
import { toActionError, type ActionResult } from "./helpers";

const importRow = z.object({
  date: isoDate,
  description: z.string().transform(sanitize).pipe(z.string().min(1, "Descrição vazia").max(200)),
  amount: money,
  kind: z.enum(["income", "expense"]),
  category: z.string(),
  currency,
  status: z.enum(["paid", "pending"]).default("paid"),
  notes: z.string().max(1000).optional().nullable(),
});

const importPayload = z.object({
  accountId: z.string().uuid("Escolha a conta"),
  rows: z.array(z.unknown()).min(1, "Nenhuma linha para importar").max(5000, "Máximo de 5.000 linhas por importação"),
});

export interface ImportRowResult {
  index: number;
  status: "ok" | "invalid" | "duplicate";
  errors: string[];
  hash?: string;
}

interface Checked {
  results: ImportRowResult[];
  valid: Array<{ index: number; hash: string; row: z.output<typeof importRow> }>;
  accountCurrency: Currency;
}

async function check(db: Db, accountId: string, rows: unknown[]): Promise<Checked> {
  const acc = await db.query<{ currency: Currency }>("select currency from accounts where id = $1", [accountId]);
  if (!acc[0]) throw new Error("Conta não encontrada.");
  const existing = await db.query<{ import_hash: string | null; date: string; amount: string; description: string; account_id: string | null }>(
    "select import_hash, date::text, amount::text, description, account_id from transactions",
  );
  const hashes = new Set(existing.map((e) => e.import_hash).filter(Boolean) as string[]);
  const natural = new Set(existing.map((e) => dedupeHash([e.date, toCents(e.amount), e.description, e.account_id])));
  const seen = new Set<string>();
  const results: ImportRowResult[] = [];
  const valid: Checked["valid"] = [];
  rows.forEach((raw, index) => {
    const p = importRow.safeParse(raw);
    if (!p.success) {
      results.push({ index, status: "invalid", errors: p.error.issues.map((i) => `${i.path.join(".") || "linha"}: ${i.message}`) });
      return;
    }
    const r = p.data;
    const catOk = r.kind === "income" ? incomeCategory.safeParse(r.category).success : expenseCategory.safeParse(r.category).success;
    if (!catOk) {
      results.push({ index, status: "invalid", errors: [`categoria: “${r.category}” não é válida para ${r.kind === "income" ? "receitas" : "despesas"}`] });
      return;
    }
    if (r.kind === "income" && r.status === "pending") {
      results.push({ index, status: "invalid", errors: ["receitas não podem ser pendentes"] });
      return;
    }
    const hash = dedupeHash([r.date, toCents(r.amount), r.description, accountId, r.kind]);
    const nat = dedupeHash([r.date, toCents(r.amount), r.description, accountId]);
    if (hashes.has(hash) || natural.has(nat) || seen.has(hash)) {
      results.push({ index, status: "duplicate", errors: ["já existe uma movimentação igual (data, valor, descrição e conta)"], hash });
      return;
    }
    seen.add(hash);
    results.push({ index, status: "ok", errors: [], hash });
    valid.push({ index, hash, row: r });
  });
  return { results, valid, accountCurrency: acc[0].currency };
}

/** Server-side validation + duplicate detection; nothing is written. */
export async function previewImport(raw: unknown): Promise<ActionResult<ImportRowResult[]>> {
  try {
    const user = await requireUserForAction();
    const p = importPayload.safeParse(raw);
    if (!p.success) return { ok: false, error: p.error.issues[0].message };
    const checked = await withUser(user.id, (db) => check(db, p.data.accountId, p.data.rows));
    return { ok: true, data: checked.results };
  } catch (err) {
    if (err instanceof Error && err.message === "Conta não encontrada.") return { ok: false, error: err.message };
    return toActionError(err);
  }
}

/** Inserts the valid, non-duplicate rows in one transaction. */
export async function commitImport(raw: unknown): Promise<ActionResult<{ imported: number; skipped: number }>> {
  try {
    const user = await requireUserForAction();
    const p = importPayload.safeParse(raw);
    if (!p.success) return { ok: false, error: p.error.issues[0].message };
    const result = await withUser(user.id, async (db) => {
      const checked = await check(db, p.data.accountId, p.data.rows);
      const rates = (await db.query("select * from fx_rates order by fetched_at desc limit 200")).map(mapFxRate);
      const fx = new FxConverter(rates);
      let imported = 0;
      for (const { row, hash } of checked.valid) {
        const amount = toCents(row.amount);
        let accountAmount: number | null = null;
        let rate: string | null = null;
        if (row.status === "paid") {
          if (row.currency === checked.accountCurrency) accountAmount = amount;
          else {
            rate = fx.latest(row.currency, checked.accountCurrency)?.rate ?? null;
            if (!rate) throw new Error(`FX:${row.currency}`);
            accountAmount = mulCents(amount, rate);
          }
        }
        const ins = await db.query(
          `insert into transactions (kind, status, date, amount, currency, account_id, account_amount, fx_rate, category, description, notes, import_hash)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) on conflict do nothing returning id`,
          [row.kind, row.status, row.date, row.amount, row.currency, p.data.accountId, accountAmount === null ? null : centsToDecimalString(accountAmount),
            rate, row.category, row.description, row.notes ?? null, hash],
        );
        imported += ins.length;
      }
      return { imported, skipped: checked.results.length - imported };
    });
    refresh();
    return { ok: true, data: result, message: `${result.imported} movimentação(ões) importada(s)` };
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("FX:"))
      return { ok: false, error: `Sem cotação para ${err.message.slice(3)}. Atualize a cotação ou informe uma taxa manual antes de importar.` };
    if (err instanceof Error && err.message === "Conta não encontrada.") return { ok: false, error: err.message };
    return toActionError(err);
  }
}

export async function restoreBackupAction(raw: unknown): Promise<ActionResult<Record<string, number>>> {
  try {
    const user = await requireUserForAction();
    const p = z.object({ json: z.string().min(2).max(9_000_000), confirm: z.literal(true) }).safeParse(raw);
    if (!p.success) return { ok: false, error: "Confirme a restauração e escolha um arquivo válido." };
    let data: unknown;
    try {
      data = JSON.parse(p.data.json);
      validateBackupShape(data);
    } catch (e) {
      return { ok: false, error: e instanceof Error && !(e instanceof SyntaxError) ? e.message : "O arquivo não é um JSON válido." };
    }
    const counts = await withUser(user.id, (db) => restore(db, data as Record<string, unknown>));
    refresh();
    return { ok: true, data: counts, message: "Backup restaurado com sucesso" };
  } catch (err) {
    const e = toActionError(err);
    return { ok: false, error: e.error === "Não foi possível concluir a operação. Tente novamente." ? "O backup contém dados inválidos; nada foi alterado." : e.error };
  }
}
