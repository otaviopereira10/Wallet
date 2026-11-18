import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { env } from "../env";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, createSessionToken, verifySessionToken } from "./local";
import { createSupabaseServerClient } from "./supabase";

export interface SessionUser {
  id: string;
  email: string;
}

/** The authenticated user for this request (verified server-side), or null. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  if (env.backend === "supabase") {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;
    return { id: data.user.id, email: data.user.email ?? "" };
  }
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
});

/** For pages/layouts: redirects to /login when there is no session. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export class UnauthorizedError extends Error {
  constructor() {
    super("Your session expired. Please sign in again.");
  }
}

/** For Server Actions and Route Handlers: throws when there is no session. */
export async function requireUserForAction(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

export async function startLocalSession(user: SessionUser): Promise<void> {
  const token = await createSessionToken(user);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.isProduction,
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function endSession(): Promise<void> {
  if (env.backend === "supabase") {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
    return;
  }
  (await cookies()).delete(SESSION_COOKIE);
}
