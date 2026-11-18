import type { Metadata } from "next";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <>
      <h2 className="font-display text-3xl font-medium tracking-tight text-ink">Welcome back</h2>
      <p className="mb-8 mt-2 text-sm text-muted">Sign in to see where your money stands.</p>
      <AuthForm mode="login" notice={error === "link" ? "The confirmation link is invalid or has expired." : undefined} />
    </>
  );
}
