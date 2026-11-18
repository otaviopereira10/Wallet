import { afterEach, describe, expect, it } from "vitest";
import { configProblems, databaseUrl, resolveBackend } from "@/lib/supabase-env";

const KEYS = [
  "VERCEL",
  "DATA_BACKEND",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_ANON_KEY",
  "DATABASE_URL",
  "POSTGRES_URL",
];
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

function setEnv(values: Partial<Record<(typeof KEYS)[number], string>>) {
  for (const k of KEYS) delete process.env[k];
  Object.assign(process.env, values);
}

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const SUPABASE = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
  DATABASE_URL: "postgresql://user:pass@pooler.example.com:6543/postgres",
};

describe("deployment configuration", () => {
  it("runs locally with no configuration at all", () => {
    setEnv({});
    expect(resolveBackend()).toBe("local");
    expect(configProblems()).toEqual([]);
  });

  it("uses Supabase automatically when its variables are present", () => {
    setEnv({ ...SUPABASE });
    expect(resolveBackend()).toBe("supabase");
    expect(configProblems()).toEqual([]);
  });

  it("lists the missing variable names on a bare Vercel deploy", () => {
    setEnv({ VERCEL: "1" });
    expect(configProblems()).toEqual(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "DATABASE_URL"]);
  });

  it("refuses the local database on Vercel", () => {
    setEnv({ VERCEL: "1", DATA_BACKEND: "local", ...SUPABASE });
    expect(configProblems().join(" ")).toContain("DATA_BACKEND");
  });

  it("accepts the variable names created by the Vercel ↔ Supabase integration", () => {
    setEnv({
      VERCEL: "1",
      SUPABASE_URL: SUPABASE.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
      POSTGRES_URL: "postgres://u:p@pooler.example.com:6543/postgres?sslmode=require&supa=base-pooler.x",
    });
    expect(configProblems()).toEqual([]);
    expect(resolveBackend()).toBe("supabase");
    expect(databaseUrl()).not.toContain("supa=");
    expect(databaseUrl()).toContain("sslmode=require");
  });

  it("reports a half-finished Supabase setup instead of silently falling back", () => {
    setEnv({ NEXT_PUBLIC_SUPABASE_URL: SUPABASE.NEXT_PUBLIC_SUPABASE_URL });
    expect(configProblems()).toEqual(["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "DATABASE_URL"]);
  });
});
