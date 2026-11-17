import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * SQL that emulates the pieces of Supabase the schema depends on, for the
 * embedded local database only (never run against Supabase): the `auth`
 * schema with `auth.users` and `auth.uid()`, and the `authenticated`/`anon`
 * roles. auth.uid() reads the same `request.jwt.claims` setting Supabase uses,
 * so the RLS policies behave identically in both backends.
 */
export const LOCAL_BOOTSTRAP_SQL = `
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  encrypted_password text not null,
  created_at timestamptz not null default now()
);
create table if not exists auth.login_attempts (
  key text primary key,
  failures integer not null default 0,
  locked_until timestamptz
);
create or replace function auth.uid() returns uuid
language sql stable
as $$
  select nullif(nullif(current_setting('request.jwt.claims', true), '')::json ->> 'sub', '')::uuid
$$;
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
end
$$;
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated, anon;
grant usage on schema public to authenticated;
`;

export const MIGRATIONS_TABLE_SQL = `
create schema if not exists app_meta;
create table if not exists app_meta.migrations (
  name text primary key,
  applied_at timestamptz not null default now()
);
`;

export interface MigrationFile {
  name: string;
  sql: string;
}

export function readMigrationFiles(dir = path.join(process.cwd(), "supabase", "migrations")): MigrationFile[] {
  return readdirSync(/*turbopackIgnore: true*/ dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((name) => ({ name, sql: readFileSync(path.join(/*turbopackIgnore: true*/ dir, name), "utf8") }));
}

export interface MigrationRunner {
  exec(sql: string): Promise<void>;
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;
}

/** Applies pending migrations, each inside its own transaction. Returns applied names. */
export async function applyMigrations(db: MigrationRunner, files: MigrationFile[]): Promise<string[]> {
  await db.exec(MIGRATIONS_TABLE_SQL);
  const done = new Set((await db.query<{ name: string }>("select name from app_meta.migrations")).map((r) => r.name));
  const applied: string[] = [];
  for (const file of files) {
    if (done.has(file.name)) continue;
    await db.exec(`begin;\n${file.sql}\ninsert into app_meta.migrations (name) values ('${file.name.replace(/'/g, "''")}');\ncommit;`);
    applied.push(file.name);
  }
  return applied;
}
