import { NextResponse, type NextRequest } from "next/server";
import { endSession } from "@/server/auth/session";

/** Clears an invalid/stale session (e.g. after a database reset) and goes to the login page. */
export async function GET(req: NextRequest) {
  await endSession();
  const res = NextResponse.redirect(new URL("/login", req.nextUrl.origin));
  res.cookies.delete("iw_session");
  return res;
}
