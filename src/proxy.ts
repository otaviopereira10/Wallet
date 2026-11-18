import { createServerClient } from "@supabase/ssr";
import { jwtVerify } from "jose";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { configProblems, resolveBackend, supabaseKey, supabaseUrl } from "@/lib/supabase-env";

/**
 * Route protection (optimistic check before rendering) + Supabase session
 * refresh. Every page, Server Action and Route Handler still verifies the
 * session itself on the server — this is not the only security boundary.
 */
const PUBLIC_PATHS = ["/login", "/signup", "/auth"];

function backend(): "supabase" | "local" {
  return resolveBackend();
}

function localSecret(): Uint8Array | null {
  let secret = process.env.AUTH_SECRET?.trim();
  if (!secret) {
    const file = path.resolve(process.cwd(), ".data", "auth-secret");
    if (!existsSync(file)) return null;
    secret = readFileSync(file, "utf8").trim();
  }
  return secret.length >= 32 ? new TextEncoder().encode(secret) : null;
}

async function validLocalSession(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const secret = localSecret();
  if (!secret) return false;
  try {
    await jwtVerify(token, secret, { algorithms: ["HS256"], audience: "isabelle-wallet" });
    return true;
  } catch {
    return false;
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Missing configuration (e.g. a Vercel deploy without the Supabase variables):
  // show a setup page instead of failing on every request.
  if (configProblems().length) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "The app is not configured yet." }, { status: 503 });
    if (pathname === "/setup-required") return NextResponse.next();
    const url = request.nextUrl.clone();
    url.pathname = "/setup-required";
    url.search = "";
    return NextResponse.redirect(url);
  }
  if (pathname === "/setup-required") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  let response = NextResponse.next({ request });
  let authenticated = false;

  if (backend() === "supabase") {
    const supabase = createServerClient(
      supabaseUrl()!,
      supabaseKey()!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
            response = NextResponse.next({ request });
            for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
          },
        },
      },
    );
    const { data } = await supabase.auth.getUser();
    authenticated = !!data.user;
  } else {
    const token = request.cookies.get("iw_session")?.value;
    authenticated = await validLocalSession(token);
    if (token && !authenticated) response.cookies.delete("iw_session");
  }

  if (!authenticated && !isPublic) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    const redirect = NextResponse.redirect(url);
    if (backend() === "local") redirect.cookies.delete("iw_session");
    return redirect;
  }
  if (authenticated && (pathname === "/login" || pathname === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|robots.txt|manifest.webmanifest).*)"],
};
