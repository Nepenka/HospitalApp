import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { SessionPayload, SessionUser, UserRole } from "./types.ts";

const COOKIE_NAME = process.env.NODE_ENV === "production" ? "__Host-anafix-session" : "anafix-session";
const SESSION_TTL_SECONDS = 8 * 60 * 60;

function getSecret(): string {
  const secret = process.env.AUTH_SESSION_SECRET;
  if (secret && secret.length >= 32) return secret;
  if (process.env.NODE_ENV !== "production") return "development-only-secret-change-before-deploy-2026";
  throw new Error("AUTH_SESSION_SECRET must contain at least 32 characters");
}
const encode = (value: string) => Buffer.from(value, "utf8").toString("base64url");
const decode = (value: string) => Buffer.from(value, "base64url").toString("utf8");
const sign = (value: string) => createHmac("sha256", getSecret()).update(value).digest("base64url");
function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left); const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
function serialize(payload: SessionPayload): string { const body = encode(JSON.stringify(payload)); return `${body}.${sign(body)}`; }
function parse(token: string | undefined): SessionPayload | null {
  if (!token) return null;
  const [body, signature, ...rest] = token.split(".");
  if (!body || !signature || rest.length || !safeEqual(sign(body), signature)) return null;
  try {
    const payload = JSON.parse(decode(body)) as SessionPayload;
    if (!payload.user?.id || !payload.sessionId || payload.expiresAt <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}
export async function createSession(user: SessionUser): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = { user, sessionId: randomUUID(), issuedAt: now, expiresAt: now + SESSION_TTL_SECONDS };
  (await cookies()).set(COOKIE_NAME, serialize(payload), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: SESSION_TTL_SECONDS, priority: "high" });
}
export async function readSession(): Promise<SessionPayload | null> { return parse((await cookies()).get(COOKIE_NAME)?.value); }
export async function destroySession(): Promise<void> { (await cookies()).delete(COOKIE_NAME); }
export async function requireSession(allowPasswordChange = false): Promise<SessionPayload> { const session = await readSession(); if (!session) redirect("/login"); if (session.user.mustChangePassword && !allowPasswordChange) redirect("/change-password"); return session; }
export async function requireRole(...allowed: UserRole[]): Promise<SessionPayload> { const session = await requireSession(); if (!allowed.includes(session.user.role)) redirect("/forbidden"); return session; }
export function landingPath(user: SessionUser): string { return user.role === "platform_admin" ? "/admin" : user.role === "billing_admin" ? "/forbidden" : "/"; }
export const sessionCookieName = COOKIE_NAME;
