import "server-only";
import { databaseUrl, resolveBackend, supabaseKey, supabaseUrl } from "@/lib/supabase-env";

/**
 * Server-side configuration. Secrets live only in environment variables and
 * are never imported by client components (this module is server-only).
 *
 * Backend selection:
 *   DATA_BACKEND=supabase → Supabase Auth + Supabase Postgres (DATABASE_URL)
 *   DATA_BACKEND=local    → embedded PostgreSQL (PGlite) on disk + local auth
 * When unset, Supabase is used if its variables are present, otherwise local.
 */
export type Backend = "supabase" | "local";

function pick(...names: string[]): string | undefined {
  for (const n of names) {
    const v = process.env[n];
    if (v && v.trim()) return v.trim();
  }
  return undefined;
}

export const env = {
  get backend(): Backend {
    return resolveBackend();
  },
  get supabaseUrl() {
    return supabaseUrl();
  },
  get supabaseKey() {
    return supabaseKey();
  },
  get databaseUrl() {
    return databaseUrl();
  },
  get localDataDir() {
    return pick("LOCAL_DATA_DIR") ?? ".data/pglite";
  },
  get authSecret() {
    return pick("AUTH_SECRET");
  },
  get allowSignup(): "first-user" | "yes" | "no" {
    const v = pick("ALLOW_SIGNUP");
    if (v === "true") return "yes";
    if (v === "false") return "no";
    return "first-user";
  },
  get fxProvider(): "frankfurter" | "awesomeapi" {
    return pick("FX_PROVIDER") === "awesomeapi" ? "awesomeapi" : "frankfurter";
  },
  get fxApiBase() {
    return pick("FX_API_BASE_URL");
  },
  get aiApiKey() {
    return pick("AI_API_KEY", "ANTHROPIC_API_KEY");
  },
  get aiModel() {
    return pick("AI_MODEL");
  },
  get aiBaseUrl() {
    return pick("AI_BASE_URL");
  },
  get isProduction() {
    return process.env.NODE_ENV === "production";
  },
};
