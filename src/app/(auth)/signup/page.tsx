import type { Metadata } from "next";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Criar conta" };

export default function SignupPage() {
  return (
    <>
      <h2 className="font-display text-3xl font-medium tracking-tight text-ink">Criar sua conta</h2>
      <p className="mb-8 mt-2 text-sm text-muted">Sua carteira é privada: só você acessa os seus dados.</p>
      <AuthForm mode="signup" />
    </>
  );
}
