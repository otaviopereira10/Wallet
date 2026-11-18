"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { credentialsSchema, passwordChangeSchema } from "@/lib/validation";
import { AuthError, countUsers, localChangePassword, localSignIn, localSignUp } from "../auth/local";
import { endSession, requireUserForAction, startLocalSession } from "../auth/session";
import { createSupabaseServerClient } from "../auth/supabase";
import { env } from "../env";

export interface AuthState {
  error?: string;
  message?: string;
}

// Best-effort in-memory throttle for the Supabase backend (Supabase also rate-limits).
const attempts = new Map<string, { n: number; until: number }>();
function throttled(key: string): boolean {
  const a = attempts.get(key);
  return !!a && a.until > Date.now();
}
function fail(key: string) {
  const a = attempts.get(key) ?? { n: 0, until: 0 };
  a.n += 1;
  if (a.n >= 5) {
    a.until = Date.now() + 15 * 60 * 1000;
    a.n = 0;
  }
  attempts.set(key, a);
}

export async function signInAction(_prev: AuthState, form: FormData): Promise<AuthState> {
  const parsed = credentialsSchema.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { email, password } = parsed.data;
  try {
    if (env.backend === "supabase") {
      if (throttled(email)) return { error: "Too many attempts. Please wait a few minutes." };
      const supabase = await createSupabaseServerClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        fail(email);
        return { error: error.message.includes("confirm") ? "Please confirm your email before signing in." : "Wrong email or password." };
      }
    } else {
      const user = await localSignIn(email, password);
      await startLocalSession(user);
    }
  } catch (err) {
    if (err instanceof AuthError) return { error: err.message };
    console.error("[auth] sign-in failed:", err instanceof Error ? err.name : "unknown");
    return { error: "Could not sign in right now." };
  }
  redirect("/dashboard");
}

export async function signUpAction(_prev: AuthState, form: FormData): Promise<AuthState> {
  const parsed = credentialsSchema.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (form.get("password") !== form.get("confirm")) return { error: "The passwords do not match." };
  const { email, password } = parsed.data;
  const policy = env.allowSignup;
  try {
    if (env.backend === "supabase") {
      if (policy === "no") return { error: "New sign-ups are turned off." };
      const supabase = await createSupabaseServerClient();
      const h = await headers();
      const origin = env.siteUrl ?? h.get("origin") ?? `https://${h.get("host")}`;
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${origin}/auth/callback` },
      });
      if (error) return { error: error.message };
      if (!data.session) return { message: "Account created! Click the link we emailed you, then sign in." };
    } else {
      if (policy === "no" || (policy === "first-user" && (await countUsers()) > 0))
        return { error: "This Isabelle Wallet already has an owner. New sign-ups are turned off." };
      const user = await localSignUp(email, password);
      await startLocalSession(user);
    }
  } catch (err) {
    if (err instanceof AuthError) return { error: err.message };
    console.error("[auth] sign-up failed:", err instanceof Error ? err.name : "unknown");
    return { error: "Could not create the account right now." };
  }
  redirect("/onboarding");
}

export async function signOutAction(): Promise<void> {
  await endSession();
  redirect("/login");
}

export async function changePasswordAction(raw: unknown): Promise<{ ok: boolean; error?: string; message?: string }> {
  const parsed = passwordChangeSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  try {
    const user = await requireUserForAction();
    if (env.backend === "supabase") {
      const supabase = await createSupabaseServerClient();
      const { error: reauth } = await supabase.auth.signInWithPassword({ email: user.email, password: parsed.data.current });
      if (reauth) return { ok: false, error: "Your current password is wrong." };
      const { error } = await supabase.auth.updateUser({ password: parsed.data.next });
      if (error) return { ok: false, error: error.message };
    } else {
      await localChangePassword(user.id, parsed.data.current, parsed.data.next);
    }
    return { ok: true, message: "Password changed" };
  } catch (err) {
    if (err instanceof AuthError) return { ok: false, error: err.message };
    return { ok: false, error: "Could not change the password." };
  }
}
