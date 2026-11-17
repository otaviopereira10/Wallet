import type { Metadata } from "next";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <>
      <h2 className="font-display text-3xl font-medium tracking-tight text-ink">Bem-vinda de volta</h2>
      <p className="mb-8 mt-2 text-sm text-muted">Entre para ver sua situação financeira.</p>
      <AuthForm mode="login" notice={error === "link" ? "O link de confirmação é inválido ou expirou." : undefined} />
    </>
  );
}
