import "server-only";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { env } from "../env";
import { applyMigrations, LOCAL_BOOTSTRAP_SQL, readMigrationFiles } from "./migrations";

/**
 * Database access. Every query that touches user data runs through
 * `withUser`, which opens a transaction, switches to the `authenticated` role
 * and sets the JWT claims, so PostgreSQL Row Level Security decides which rows
 * are visible — exactly as on Supabase. Queries also filter by user_id
 * (defence in depth).
 */
export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
}

interface Driver {
  userTx<T>(userId: string, fn: (db: Db) => Promise<T>): Promise<T>;
  systemTx<T>(fn: (db: Db) => Promise<T>): Promise<T>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type GlobalWithDb = typeof globalThis & { __iwDriver?: Promise<Driver> };
const g = globalThis as GlobalWithDb;

async function createLocalDriver(): Promise<Driver> {
  const { PGlite } = await import("@electric-sql/pglite");
  const dir = path.resolve(/*turbopackIgnore: true*/ process.cwd(), env.localDataDir);
  mkdirSync(dir, { recursive: true });
  const raw = (v: string) => v;
  const pg = await PGlite.create({
    dataDir: dir,
    parsers: { 1700: raw, 1082: raw, 1114: raw, 1184: raw },
  });
  await pg.exec(LOCAL_BOOTSTRAP_SQL);
  await applyMigrations(
    {
      exec: async (sql) => void (await pg.exec(sql)),
      query: async (sql, params) => (await pg.query(sql, params)).rows as never,
    },
    readMigrationFiles(),
  );
  return {
    userTx: (userId, fn) =>
      pg.transaction(async (tx) => {
        await tx.query("set local role authenticated");
        await tx.query("select set_config('request.jwt.claims', $1, true)", [
          JSON.stringify({ sub: userId, role: "authenticated" }),
        ]);
        return fn({ query: async (sql, params) => (await tx.query(sql, params)).rows as never });
      }),
    systemTx: (fn) =>
      pg.transaction(async (tx) => fn({ query: async (sql, params) => (await tx.query(sql, params)).rows as never })),
  };
}

async function createPostgresDriver(): Promise<Driver> {
  const { default: postgres } = await import("postgres");
  if (!env.databaseUrl) throw new Error("DATABASE_URL não configurada.");
  const passthrough = { serialize: (x: unknown) => String(x), parse: (x: string) => x };
  const sql = postgres(env.databaseUrl, {
    prepare: false, // required by Supabase's transaction pooler
    max: 5,
    idle_timeout: 20,
    onnotice: () => {},
    types: {
      numeric: { to: 1700, from: [1700], ...passthrough },
      date: { to: 1082, from: [1082], ...passthrough },
      timestamp: { to: 1184, from: [1114, 1184], ...passthrough },
    },
  });
  const wrap = (tx: { unsafe: (q: string, p?: never[]) => Promise<unknown> }): Db => ({
    query: async (q, params) => [...((await tx.unsafe(q, (params ?? []) as never[])) as never[])] as never,
  });
  return {
    userTx: (userId, fn) =>
      sql.begin(async (tx) => {
        await tx.unsafe("set local role authenticated");
        await tx.unsafe("select set_config('request.jwt.claims', $1, true)", [
          JSON.stringify({ sub: userId, role: "authenticated" }),
        ]);
        return fn(wrap(tx as never));
      }) as Promise<never>,
    systemTx: (fn) => sql.begin(async (tx) => fn(wrap(tx as never))) as Promise<never>,
  };
}

function driver(): Promise<Driver> {
  if (!g.__iwDriver) {
    g.__iwDriver = (env.backend === "supabase" ? createPostgresDriver() : createLocalDriver()).catch((err) => {
      g.__iwDriver = undefined;
      throw err;
    });
  }
  return g.__iwDriver;
}

/** Runs `fn` as the given user, with RLS enforced, inside one transaction. */
export async function withUser<T>(userId: string, fn: (db: Db) => Promise<T>): Promise<T> {
  if (!UUID_RE.test(userId)) throw new Error("Usuário inválido");
  return (await driver()).userTx(userId, fn);
}

/** Privileged access — only for the local auth tables. Never for user data. */
export async function asSystem<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  return (await driver()).systemTx(fn);
}
