import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/server/auth/supabase";
import { env } from "@/server/env";

/** Supabase e-mail confirmation / magic link landing (PKCE code or token hash). */
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const redirectTo = new URL("/dashboard", url.origin);
  if (env.backend !== "supabase") return NextResponse.redirect(new URL("/login", url.origin));
  const supabase = await createSupabaseServerClient();
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(redirectTo);
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(redirectTo);
  }
  return NextResponse.redirect(new URL("/login?error=link", url.origin));
}
