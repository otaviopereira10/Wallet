import type { Metadata } from "next";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Create account" };

export default function SignupPage() {
  return (
    <>
      <h2 className="font-display text-3xl font-medium tracking-tight text-ink">Create your account</h2>
      <p className="mb-8 mt-2 text-sm text-muted">Your wallet is private: only you can see your data.</p>
      <AuthForm mode="signup" />
    </>
  );
}
