import "server-only";
import type { Db } from "../db";

/**
 * Backup format: one JSON document with every table of the user (user_id is
 * omitted — it is re-assigned from the session on restore). Columns are
 * whitelisted, so a crafted backup can never write to other columns or users.
 */
export const BACKUP_VERSION = 1;

export const BACKUP_TABLES: Array<{ table: string; columns: string[] }> = [
  { table: "accounts", columns: ["id", "name", "type", "currency", "opening_balance", "opening_date", "include_in_available", "archived", "created_at"] },
  {
    table: "incomes",
    columns: ["id", "name", "amount", "currency", "category", "start_date", "frequency", "custom_interval", "custom_unit", "end_date", "account_id", "skipped_dates", "notes", "active", "created_at"],
  },
  {
    table: "debts",
    columns: ["id", "name", "currency", "initial_balance", "start_date", "increment_amount", "increment_interval_months", "increment_anchor_date", "increments_end_date",
      "interest_rate", "interest_since", "planned_monthly_payment", "payment_day", "target_payoff_date", "notes", "active", "created_at"],
  },
  {
    table: "bills",
    columns: ["id", "name", "amount", "minimum_amount", "currency", "category", "priority", "recurrence", "first_due_date", "end_date", "late_fee", "interest_rate",
      "allows_partial", "account_id", "notes", "active", "created_at"],
  },
  { table: "bill_occurrences", columns: ["id", "bill_id", "due_date", "amount_due", "minimum_due", "waived", "notes", "created_at"] },
  {
    table: "subscriptions",
    columns: ["id", "name", "amount", "currency", "billing_cycle", "next_charge_date", "category", "account_id", "status", "last_used_on", "usage_note", "notes", "created_at"],
  },
  {
    table: "transactions",
    columns: ["id", "kind", "status", "date", "amount", "currency", "account_id", "account_amount", "fx_rate", "to_account_id", "to_amount", "category", "description",
      "payment_method", "notes", "recurrence", "series_id", "income_id", "income_occurrence", "subscription_id", "debt_id", "refund_of", "import_hash", "created_at"],
  },
  { table: "bill_payments", columns: ["id", "occurrence_id", "date", "amount", "transaction_id", "created_at"] },
  { table: "debt_events", columns: ["id", "debt_id", "date", "type", "amount", "automatic", "voided", "transaction_id", "note", "created_at"] },
  { table: "goals", columns: ["id", "name", "kind", "target_amount", "currency", "deadline", "priority", "monthly_contribution", "notes", "archived", "created_at"] },
  { table: "goal_contributions", columns: ["id", "goal_id", "date", "amount", "note", "created_at"] },
  { table: "budgets", columns: ["id", "category", "amount", "currency", "created_at"] },
  { table: "fx_rates", columns: ["id", "base", "quote", "rate", "rate_date", "source", "is_manual", "fetched_at"] },
];

const PROFILE_COLUMNS = ["display_name", "base_currency", "locale", "timezone", "theme", "emergency_buffer", "alert_days_ahead", "ai_enabled", "onboarding_completed"];

export async function exportBackup(db: Db): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {
    app: "isabelle-wallet",
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
  };
  const profile = await db.query(`select ${PROFILE_COLUMNS.join(", ")} from profiles where user_id = auth.uid()`);
  out.profile = profile[0] ?? null;
  for (const { table, columns } of BACKUP_TABLES) {
    const cols = columns.map((c) => (c === "skipped_dates" ? "skipped_dates::text[] as skipped_dates" : c)).join(", ");
    out[table] = await db.query(`select ${cols} from ${table} where user_id = auth.uid()`);
  }
  return out;
}

export function summarizeBackup(data: Record<string, unknown>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const { table } of BACKUP_TABLES) counts[table] = Array.isArray(data[table]) ? (data[table] as unknown[]).length : 0;
  return counts;
}

export function validateBackupShape(data: unknown): asserts data is Record<string, unknown> {
  if (!data || typeof data !== "object") throw new Error("Invalid backup file.");
  const d = data as Record<string, unknown>;
  if (d.app !== "isabelle-wallet") throw new Error("This file is not an Isabelle Wallet backup.");
  if (d.version !== BACKUP_VERSION) throw new Error("Unsupported backup version.");
  for (const { table } of BACKUP_TABLES) {
    if (d[table] !== undefined && !Array.isArray(d[table])) throw new Error(`Invalid “${table}” section in the backup.`);
    if (Array.isArray(d[table]) && (d[table] as unknown[]).length > 100_000) throw new Error("The backup is too large.");
  }
}

/** Replaces all of the user's data with the backup content, inside one transaction. */
export async function restoreBackup(db: Db, data: Record<string, unknown>): Promise<Record<string, number>> {
  for (const { table } of [...BACKUP_TABLES].reverse()) await db.query(`delete from ${table} where user_id = auth.uid()`);
  const deferredRefunds: Array<{ id: string; refund_of: string }> = [];
  for (const { table, columns } of BACKUP_TABLES) {
    const rows = (data[table] as Array<Record<string, unknown>> | undefined) ?? [];
    for (const raw of rows) {
      if (!raw || typeof raw !== "object") throw new Error(`Invalid row in ${table}.`);
      const row = { ...raw };
      if (table === "transactions" && row.refund_of) {
        deferredRefunds.push({ id: String(row.id), refund_of: String(row.refund_of) });
        row.refund_of = null;
      }
      const cols = columns.filter((c) => c in row);
      if (!cols.length) continue;
      const values = cols.map((c) => {
        const v = row[c];
        return v !== null && typeof v === "object" && !Array.isArray(v) ? JSON.stringify(v) : v;
      });
      const placeholders = cols.map((c, i) => (c === "skipped_dates" ? `$${i + 1}::date[]` : `$${i + 1}`));
      await db.query(`insert into ${table} (${cols.join(", ")}) values (${placeholders.join(", ")})`, values);
    }
  }
  for (const r of deferredRefunds) await db.query("update transactions set refund_of = $2 where id = $1", [r.id, r.refund_of]);
  const profile = data.profile as Record<string, unknown> | null;
  if (profile && typeof profile === "object") {
    const cols = PROFILE_COLUMNS.filter((c) => c in profile);
    if (cols.length) {
      await db.query(
        `update profiles set ${cols.map((c, i) => `${c} = $${i + 1}`).join(", ")} where user_id = auth.uid()`,
        cols.map((c) => profile[c]),
      );
    }
  }
  return summarizeBackup(data);
}
