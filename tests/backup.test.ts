import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { analyze } from "@/lib/finance/analysis";
import { applyMigrations, LOCAL_BOOTSTRAP_SQL, readMigrationFiles } from "@/server/db/migrations";
import type { Db } from "@/server/db";
import { exportBackup, restoreBackup, validateBackupShape } from "@/server/services/backup";
import { loadSnapshotWith } from "@/server/services/snapshot";

/**
 * End-to-end data tests on a real (embedded) PostgreSQL with the production
 * migration: scheduled syncing, ledger effects of real records, and a full
 * backup → wipe → restore round trip under Row Level Security.
 */
let pg: PGlite;
const U = "33333333-3333-4333-8333-333333333333";
const OTHER = "44444444-4444-4444-8444-444444444444";

function asUser<T>(userId: string, fn: (db: Db) => Promise<T>): Promise<T> {
  return pg.transaction(async (tx) => {
    await tx.query("set local role authenticated");
    await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: userId, role: "authenticated" })]);
    return fn({ query: async (sql, params) => (await tx.query(sql, params)).rows as never });
  });
}

beforeAll(async () => {
  const raw = (v: string) => v;
  pg = new PGlite({ parsers: { 1700: raw, 1082: raw, 1114: raw, 1184: raw } });
  await pg.exec(LOCAL_BOOTSTRAP_SQL);
  await applyMigrations({ exec: async (s) => void (await pg.exec(s)), query: async (s, p) => (await pg.query(s, p)).rows as never }, readMigrationFiles());
  await pg.query("insert into auth.users (id, email, encrypted_password) values ($1, 'u@x.test', 'x'), ($2, 'o@x.test', 'x')", [U, OTHER]);

  await asUser(U, async (db) => {
    await db.query("insert into profiles (timezone, emergency_buffer) values ('America/New_York', 100)");
    const acc = (await db.query<{ id: string }>("insert into accounts (name, type, currency, opening_balance, opening_date) values ('Main', 'checking', 'USD', 1000, '2026-01-01') returning id"))[0].id;
    const sav = (await db.query<{ id: string }>("insert into accounts (name, type, currency, opening_balance, opening_date, include_in_available) values ('Savings', 'savings', 'USD', 0, '2026-01-01', false) returning id"))[0].id;
    const exp = (await db.query<{ id: string }>(
      "insert into transactions (kind, date, amount, currency, account_id, account_amount, category, description) values ('expense', '2026-03-02', 80, 'USD', $1, 80, 'personal', 'Shoes') returning id",
      [acc],
    ))[0].id;
    await db.query(
      "insert into transactions (kind, date, amount, currency, account_id, account_amount, category, description, refund_of) values ('refund', '2026-03-05', 30, 'USD', $1, 30, 'personal', 'Shoes refund', $2)",
      [acc, exp],
    );
    await db.query(
      "insert into transactions (kind, date, amount, currency, account_id, account_amount, to_account_id, to_amount, description) values ('transfer', '2026-03-06', 200, 'USD', $1, 200, $2, 200, 'To savings')",
      [acc, sav],
    );
    const debt = (await db.query<{ id: string }>(
      "insert into debts (name, currency, initial_balance, start_date, increment_amount, increment_interval_months, increment_anchor_date) values ('College', 'USD', 10000, '2026-01-01', 5500, 6, '2026-02-15') returning id",
    ))[0].id;
    const pay = (await db.query<{ id: string }>(
      "insert into transactions (kind, date, amount, currency, account_id, account_amount, category, description, debt_id) values ('debt_payment', '2026-04-05', 100, 'USD', $1, 100, 'debt', 'Debt payment', $2) returning id",
      [acc, debt],
    ))[0].id;
    await db.query("insert into debt_events (debt_id, date, type, amount, transaction_id) values ($1, '2026-04-05', 'payment', 100, $2)", [debt, pay]);
    await db.query(
      "insert into bills (name, amount, currency, category, priority, recurrence, first_due_date) values ('Rent', 700, 'USD', 'housing', 'essential', 'monthly', '2026-11-25')",
    );
    await db.query("insert into incomes (name, amount, currency, category, start_date, frequency, skipped_dates) values ('Scholarship', 900, 'USD', 'scholarship', '2026-12-01', 'monthly', '{2026-10-01}')");
    const goal = (await db.query<{ id: string }>("insert into goals (name, kind, target_amount, currency) values ('Emergency', 'emergency', 3000, 'USD') returning id"))[0].id;
    await db.query("insert into goal_contributions (goal_id, date, amount) values ($1, '2026-05-01', 250)", [goal]);
    await db.query("insert into budgets (category, amount, currency) values ('food', 250, 'USD')");
  });
});

afterAll(async () => {
  await pg?.close();
});

describe("snapshot sync on real data", () => {
  it("materialises bills, posts semester increments once and computes balances", async () => {
    const s1 = await asUser(U, (db) => loadSnapshotWith(db));
    const s2 = await asUser(U, (db) => loadSnapshotWith(db)); // second load must not duplicate anything
    expect(s2.occurrences.length).toBe(s1.occurrences.length);
    expect(s2.debtEvents.length).toBe(s1.debtEvents.length);
    const increments = s2.debtEvents.filter((e) => e.type === "increment");
    expect(increments.map((e) => e.date)).toContain("2026-02-15");
    expect(new Set(increments.map((e) => e.date)).size).toBe(increments.length);
    const a = analyze(s2);
    const main = a.accountRows.find((r) => r.account.name === "Main")!;
    expect(main.balance).toBe(100000 - 8000 + 3000 - 20000 - 10000);
    expect(a.totalBalance).toBe(100000 - 8000 + 3000 - 10000); // transfer stays inside
    expect(a.spendableBalance).toBe(main.balance);
    expect(a.debts[0].balance).toBe(1000000 + 550000 * increments.length - 10000);
    expect(s2.incomes[0].skippedDates).toEqual(["2026-10-01"]);
  });
});

describe("backup and restore", () => {
  it("round-trips every table and keeps balances identical", async () => {
    const before = await asUser(U, (db) => loadSnapshotWith(db));
    const backup = JSON.parse(JSON.stringify(await asUser(U, exportBackup)));
    validateBackupShape(backup);
    await asUser(U, async (db) => {
      for (const t of ["bill_payments", "debt_events", "goal_contributions", "transactions", "bill_occurrences", "bills", "subscriptions", "incomes", "debts", "goals", "budgets", "fx_rates", "accounts"])
        await db.query(`delete from ${t}`);
    });
    expect((await asUser(U, (db) => loadSnapshotWith(db))).transactions).toHaveLength(0);
    await asUser(U, (db) => restoreBackup(db, backup));
    const after = await asUser(U, (db) => loadSnapshotWith(db));
    expect(after.transactions.length).toBe(before.transactions.length);
    expect(after.debtEvents.length).toBe(before.debtEvents.length);
    const a1 = analyze(before);
    const a2 = analyze(after);
    expect(a2.totalBalance).toBe(a1.totalBalance);
    expect(a2.debtTotal).toBe(a1.debtTotal);
    expect(a2.savingsTotal).toBe(a1.savingsTotal);
    expect(after.transactions.find((t) => t.kind === "refund")?.refundOf).toBeTruthy();
  });

  it("restores only into the signed-in user, never another one", async () => {
    const backup = JSON.parse(JSON.stringify(await asUser(U, exportBackup)));
    // A crafted backup trying to inject another user's id is ignored (user_id is not a restorable column).
    // Only the accounts table, with fresh ids, so nothing collides with the original rows.
    const crafted = {
      app: "isabelle-wallet",
      version: 1,
      accounts: backup.accounts.map((a: Record<string, unknown>, i: number) => ({
        ...a,
        id: `55555555-5555-4555-8555-55555555555${i}`,
        user_id: U,
      })),
    };
    await asUser(OTHER, async (db) => {
      await db.query("insert into profiles default values");
      await restoreBackup(db, crafted);
    });
    const otherAccounts = await asUser(OTHER, (db) => db.query<{ user_id: string }>("select user_id from accounts"));
    expect(otherAccounts.length).toBe(2);
    expect(otherAccounts.every((r) => r.user_id === OTHER)).toBe(true);
    const mine = await asUser(U, (db) => db.query("select id from accounts"));
    expect(mine.length).toBe(2);
    // Restoring a backup whose ids belong to another user's rows fails as a whole (nothing partial).
    await expect(asUser(OTHER, (db) => restoreBackup(db, backup))).rejects.toThrow();
    expect((await asUser(OTHER, (db) => db.query("select id from accounts"))).length).toBe(2);
  });

  it("rejects files that are not Isabelle Wallet backups", () => {
    expect(() => validateBackupShape({ app: "other" })).toThrow();
    expect(() => validateBackupShape({ app: "isabelle-wallet", version: 1, accounts: "x" })).toThrow();
  });
});
