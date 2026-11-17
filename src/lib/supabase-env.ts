/**
 * Supabase configuration resolution shared by the server and the proxy.
 * Accepts the app's own variable names and the ones created by the
 * Supabase ↔ Vercel integration (SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY,
 * NEXT_PUBLIC_SUPABASE_ANON_KEY, POSTGRES_URL…), so a Vercel deploy works
 * without renaming anything. Secret keys (service role / secret key / JWT
 * secret) are never read: the app does not need them.
 */
function pick(...names: string[]): string | undefined {
  for (const n of names) {
    const v = process.env[n];
    if (v && v.trim()) return v.trim().replace(/^"(.*)"$/, "$1");
  }
  return undefined;
}

export function supabaseUrl(): string | undefined {
  return pick("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL");
}

export function supabaseKey(): string | undefined {
  return pick("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_ANON_KEY");
}

/** Pooled connection string, without ORM-specific query parameters the driver would forward to Postgres. */
export function databaseUrl(): string | undefined {
  const raw = pick("DATABASE_URL", "POSTGRES_URL");
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    for (const p of ["pgbouncer", "supa", "connection_limit", "pool_timeout"]) url.searchParams.delete(p);
    return url.toString();
  } catch {
    return raw;
  }
}

export function resolveBackend(): "supabase" | "local" {
  const explicit = pick("DATA_BACKEND");
  if (explicit === "local" || explicit === "supabase") return explicit;
  return supabaseUrl() && supabaseKey() && databaseUrl() ? "supabase" : "local";
}
