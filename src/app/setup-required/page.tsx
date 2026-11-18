import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Wordmark } from "@/components/brand";
import { configProblems, onVercel } from "@/lib/supabase-env";

export const metadata: Metadata = { title: "Setup required" };
export const dynamic = "force-dynamic";

/**
 * Shown instead of the app when required settings are missing (for example a
 * fresh Vercel deploy without the Supabase variables). Lists variable NAMES
 * only — never values.
 */
export default function SetupRequiredPage() {
  const missing = configProblems();
  if (!missing.length) redirect("/dashboard");
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-5 py-12">
      <Wordmark />
      <h1 className="mt-8 font-display text-3xl font-medium tracking-tight">Almost there — the app needs its database settings</h1>
      <p className="mt-3 text-sm text-muted">
        Isabelle Wallet stores your data in Supabase. Add these environment variables{onVercel() ? " in Vercel → Project → Settings → Environment Variables" : " to .env.local"}, then redeploy:
      </p>
      <ul className="mt-5 space-y-2">
        {missing.map((m) => (
          <li key={m} className="rounded-xl border border-border bg-surface px-4 py-2.5 font-mono text-sm">
            {m}
          </li>
        ))}
      </ul>
      <p className="mt-5 text-sm text-muted">
        You can find the values in Supabase → Project Settings → API (URL and publishable key) and → Database → Connection string → “Transaction pooler” (DATABASE_URL). The step-by-step
        guide is in <span className="font-mono">docs/DEPLOY.md</span>.
      </p>
    </main>
  );
}
