"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/primitives";
import { signInAction, signUpAction, type AuthState } from "@/server/actions/auth";

export function AuthForm({ mode, notice }: { mode: "login" | "signup"; notice?: string }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(mode === "login" ? signInAction : signUpAction, {});
  return (
    <form action={action} className="space-y-4">
      {notice && <p className="rounded-xl bg-warning-bg px-3 py-2 text-sm text-warning">{notice}</p>}
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required placeholder="you@email.com" />
      </Field>
      <Field label="Password" htmlFor="password" hint={mode === "signup" ? "At least 8 characters." : undefined}>
        <Input id="password" name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={8} />
      </Field>
      {mode === "signup" && (
        <Field label="Confirm password" htmlFor="confirm">
          <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required minLength={8} />
        </Field>
      )}
      {state.error && (
        <p className="rounded-xl bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">
          {state.error}
        </p>
      )}
      {state.message && <p className="rounded-xl bg-success-bg px-3 py-2 text-sm text-success">{state.message}</p>}
      <Button type="submit" size="lg" className="w-full" loading={pending}>
        {mode === "login" ? "Sign in" : "Create my account"}
      </Button>
      <p className="text-center text-sm text-muted">
        {mode === "login" ? (
          <>
            First time here? <Link href="/signup" className="font-semibold text-pink-600 hover:underline">Create an account</Link>
          </>
        ) : (
          <>
            Already have an account? <Link href="/login" className="font-semibold text-pink-600 hover:underline">Sign in</Link>
          </>
        )}
      </p>
    </form>
  );
}
