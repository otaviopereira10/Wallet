import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyMigrations, LOCAL_BOOTSTRAP_SQL, readMigrationFiles } from "@/server/db/migrations";

/**
 * Runs the real migration (the same SQL deployed to Supabase) on an in-memory
 * PostgreSQL and checks Row Level Security isolates users.
 */
let db: PGlite;
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

async function asUser<T>(userId: string, fn: (q: (sql: string, params?: unknown[]) => Promise<unknown[]>) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.query("set local role authenticated");
    await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: userId, role: "authenticated" })]);
    return fn(async (sql, params) => (await tx.query(sql, params)).rows);
  });
}

beforeAll(async () => {
  db = new PGlite({ parsers: { 1700: (v: string) => v, 1082: (v: string) => v } });
  await db.exec(LOCAL_BOOTSTRAP_SQL);
  const applied = await applyMigrations(
    { exec: async (sql) => void (await db.exec(sql)), query: async (sql, p) => (await db.query(sql, p)).rows as never },
    readMigrationFiles(),
  );
  expect(applied.length).toBeGreaterThan(0);
  await db.query("insert into auth.users (id, email, encrypted_password) values ($1, 'a@x.test', 'x'), ($2, 'b@x.test', 'x')", [A, B]);
});

afterAll(async () => {
  await db?.close();
});

describe("database security (RLS)", () => {
  it("is idempotent when migrations run twice", async () => {
    const again = await applyMigrations(
      { exec: async (sql) => void (await db.exec(sql)), query: async (sql, p) => (await db.query(sql, p)).rows as never },
      readMigrationFiles(),
    );
    expect(again).toEqual([]);
  });

  it("isolates each user's rows", async () => {
    const accA = await asUser(A, async (q) => {
      await q("insert into profiles default values");
      const rows = (await q(
        "insert into accounts (name, type, currency, opening_balance, opening_date) values ('A checking', 'checking', 'USD', 100.50, '2026-11-01') returning id, user_id, opening_balance",
      )) as Array<{ id: string; user_id: string; opening_balance: string }>;
      expect(rows[0].user_id).toBe(A);
      expect(rows[0].opening_balance).toBe("100.50");
      return rows[0].id;
    });
    await asUser(B, async (q) => {
      expect(await q("select * from accounts")).toEqual([]);
      expect(await q("select * from profiles")).toEqual([]);
      // cannot update or delete A's rows (silently affects 0 rows)
      expect(await q("update accounts set name = 'hacked' where id = $1 returning id", [accA])).toEqual([]);
      expect(await q("delete from accounts where id = $1 returning id", [accA])).toEqual([]);
    });
    const still = await asUser(A, (q) => q("select name from accounts"));
    expect(still).toEqual([{ name: "A checking" }]);
  });

  it("rejects writing rows on behalf of another user", async () => {
    await expect(
      asUser(B, (q) =>
        q("insert into accounts (user_id, name, type, currency, opening_date) values ($1, 'x', 'cash', 'USD', '2026-11-01')", [A]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("blocks referencing another user's records through foreign keys", async () => {
    const accA = await asUser(A, async (q) => ((await q("select id from accounts")) as Array<{ id: string }>)[0].id);
    await expect(
      asUser(B, (q) =>
        q(
          "insert into transactions (kind, date, amount, currency, account_id, account_amount, description) values ('expense', '2026-11-02', 10, 'USD', $1, 10, 'x')",
          [accA],
        ),
      ),
    ).rejects.toThrow(/foreign key/);
  });

  it("denies anonymous access", async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.query("set local role anon");
        return tx.query("select * from accounts");
      }),
    ).rejects.toThrow(/permission denied/);
  });

  it("enforces ledger integrity rules", async () => {
    const acc = await asUser(A, async (q) => ((await q("select id from accounts")) as Array<{ id: string }>)[0].id);
    // a pending income is invalid (only expenses can be pending)
    await expect(
      asUser(A, (q) =>
        q("insert into transactions (kind, status, date, amount, currency, description) values ('income', 'pending', '2026-11-02', 10, 'USD', 'x')"),
      ),
    ).rejects.toThrow(/check constraint/);
    // a transfer to the same account is invalid
    await expect(
      asUser(A, (q) =>
        q(
          "insert into transactions (kind, date, amount, currency, account_id, account_amount, to_account_id, to_amount, description) values ('transfer', '2026-11-02', 10, 'USD', $1, 10, $1, 10, 'x')",
          [acc],
        ),
      ),
    ).rejects.toThrow(/check constraint/);
    // the same income occurrence cannot be received twice
    const inc = await asUser(A, async (q) =>
      ((await q(
        "insert into incomes (name, amount, currency, category, start_date, frequency) values ('Bolsa', 500, 'USD', 'scholarship', '2026-11-01', 'monthly') returning id",
      )) as Array<{ id: string }>)[0].id,
    );
    const receive = () =>
      asUser(A, (q) =>
        q(
          "insert into transactions (kind, date, amount, currency, account_id, account_amount, description, income_id, income_occurrence) values ('income', '2026-11-01', 500, 'USD', $1, 500, 'Bolsa', $2, '2026-11-01')",
          [acc, inc],
        ),
      );
    await receive();
    await expect(receive()).rejects.toThrow(/duplicate key/);
  });

  it("posts automatic debt increments at most once per date", async () => {
    await asUser(A, async (q) => {
      const debt = ((await q(
        "insert into debts (name, currency, initial_balance, start_date, increment_amount, increment_anchor_date) values ('Faculdade', 'USD', 10000, '2026-01-01', 5500, '2026-02-15') returning id",
      )) as Array<{ id: string }>)[0].id;
      const post = () =>
        q("insert into debt_events (debt_id, date, type, amount, automatic) values ($1, '2026-02-15', 'increment', 5500, true) on conflict do nothing returning id", [debt]);
      expect(await post()).toHaveLength(1);
      expect(await post()).toHaveLength(0);
    });
  });
});
