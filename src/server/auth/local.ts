import "server-only";
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { jwtVerify, SignJWT } from "jose";
import { asSystem } from "../db";
import { env } from "../env";

/**
 * Local authentication (used only with DATA_BACKEND=local).
 * - Passwords: scrypt (N=2^15, r=8, p=1) with a random 16-byte salt; never stored in plain text.
 * - Sessions: HS256 JWT in an httpOnly, SameSite=Lax cookie (Secure in production).
 * - Brute force: 5 failed attempts lock the e-mail for 15 minutes.
 */
const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;
const N = 32768;
const KEYLEN = 64;
export const SESSION_COOKIE = "iw_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, KEYLEN, { N, r: 8, p: 1, maxmem: 128 * N * 8 * 2 });
  return `scrypt$${N}$8$1$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, n, r, p, saltB64, hashB64] = stored.split("$");
  if (algo !== "scrypt") return false;
  const expected = Buffer.from(hashB64, "base64");
  const actual = await scrypt(password, Buffer.from(saltB64, "base64"), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: 128 * Number(n) * Number(r) * 2,
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

let cachedSecret: Uint8Array | null = null;

/** AUTH_SECRET from the environment; in local development a random one is generated once and kept in .data/. */
export function authSecret(): Uint8Array {
  if (cachedSecret) return cachedSecret;
  let secret = env.authSecret;
  if (!secret) {
    if (env.isProduction) throw new Error("AUTH_SECRET is required in production when using local mode.");
    const file = path.resolve(process.cwd(), ".data", "auth-secret");
    if (existsSync(file)) secret = readFileSync(file, "utf8").trim();
    else {
      mkdirSync(path.dirname(file), { recursive: true });
      secret = randomBytes(48).toString("base64url");
      writeFileSync(file, secret, { mode: 0o600 });
    }
  }
  if (secret.length < 32) throw new Error("AUTH_SECRET must have at least 32 characters.");
  cachedSecret = new TextEncoder().encode(secret);
  return cachedSecret;
}

export async function createSessionToken(user: { id: string; email: string }): Promise<string> {
  return new SignJWT({ email: user.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .setAudience("isabelle-wallet")
    .sign(authSecret());
}

export async function verifySessionToken(token: string): Promise<{ id: string; email: string } | null> {
  try {
    const { payload } = await jwtVerify(token, authSecret(), { algorithms: ["HS256"], audience: "isabelle-wallet" });
    if (!payload.sub || typeof payload.email !== "string") return null;
    return { id: payload.sub, email: payload.email };
  } catch {
    return null;
  }
}

export async function countUsers(): Promise<number> {
  return asSystem(async (db) => Number((await db.query<{ n: string }>("select count(*)::text as n from auth.users"))[0].n));
}

export async function localSignUp(email: string, password: string): Promise<{ id: string; email: string }> {
  const hash = await hashPassword(password);
  return asSystem(async (db) => {
    const existing = await db.query("select 1 from auth.users where email = $1", [email]);
    if (existing.length) throw new AuthError("This email is already registered.");
    const rows = await db.query<{ id: string; email: string }>(
      "insert into auth.users (email, encrypted_password) values ($1, $2) returning id, email",
      [email, hash],
    );
    return rows[0];
  });
}

export class AuthError extends Error {}

const MAX_FAILURES = 5;
const LOCK_MINUTES = 15;

export async function localSignIn(email: string, password: string): Promise<{ id: string; email: string }> {
  const key = email.toLowerCase();
  const lock = await asSystem((db) =>
    db.query<{ locked: boolean }>(
      "select (locked_until is not null and locked_until > now()) as locked from auth.login_attempts where key = $1",
      [key],
    ),
  );
  if (lock[0]?.locked) throw new AuthError(`Too many attempts. Try again in up to ${LOCK_MINUTES} minutes.`);
  const rows = await asSystem((db) =>
    db.query<{ id: string; email: string; encrypted_password: string }>(
      "select id, email, encrypted_password from auth.users where email = $1",
      [key],
    ),
  );
  // Always run a hash comparison to keep timing similar for unknown e-mails.
  const ok = rows[0]
    ? await verifyPassword(password, rows[0].encrypted_password)
    : (await verifyPassword(password, `scrypt$${N}$8$1$${Buffer.alloc(16).toString("base64")}$${Buffer.alloc(64).toString("base64")}`), false);
  if (!ok) {
    await asSystem((db) =>
      db.query(
        `insert into auth.login_attempts (key, failures) values ($1, 1)
         on conflict (key) do update set
           failures = case when auth.login_attempts.locked_until is not null and auth.login_attempts.locked_until <= now() then 1 else auth.login_attempts.failures + 1 end,
           locked_until = case when (case when auth.login_attempts.locked_until is not null and auth.login_attempts.locked_until <= now() then 1 else auth.login_attempts.failures + 1 end) >= ${MAX_FAILURES}
             then now() + interval '${LOCK_MINUTES} minutes' else null end`,
        [key],
      ),
    );
    throw new AuthError("Wrong email or password.");
  }
  await asSystem((db) => db.query("delete from auth.login_attempts where key = $1", [key]));
  return { id: rows[0].id, email: rows[0].email };
}

export async function localChangePassword(userId: string, current: string, next: string): Promise<void> {
  const rows = await asSystem((db) =>
    db.query<{ encrypted_password: string }>("select encrypted_password from auth.users where id = $1", [userId]),
  );
  if (!rows[0] || !(await verifyPassword(current, rows[0].encrypted_password))) throw new AuthError("Your current password is wrong.");
  const hash = await hashPassword(next);
  await asSystem((db) => db.query("update auth.users set encrypted_password = $2 where id = $1", [userId, hash]));
}
