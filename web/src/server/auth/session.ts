import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { SessionPayload, SessionUser, UserRole } from "./types.ts";
import { activeSessionUser, onlineSessionIsActive, registerOnlineSession, revokeOnlineSession } from "@/server/identity/store";
import { auditSecurityEvent } from "@/server/security/audit";
import {requiresMfa} from "./mfa";
import {registerAuditActorResolver} from "@/server/database/postgres";

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
export async function createSession(user: SessionUser, mfaVerified = false): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const ttl=requiresMfa(user.role)&&!mfaVerified?600:SESSION_TTL_SECONDS;
  const payload: SessionPayload = { user, sessionId: randomUUID(), issuedAt: now, expiresAt: now + ttl, ...(mfaVerified?{mfaVerifiedAt:now}:{}) };
  await registerOnlineSession(payload);
  (await cookies()).set(COOKIE_NAME, serialize(payload), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: ttl, priority: "high" });
}
export async function readSession(allowMfaPending=false): Promise<SessionPayload | null> {
  const payload = parse((await cookies()).get(COOKIE_NAME)?.value);
  if (!payload || !(await onlineSessionIsActive(payload))) return null;
  const user = await activeSessionUser(payload.user);
  if(!user||(!allowMfaPending&&requiresMfa(user.role)&&!payload.mfaVerifiedAt))return null;
  return { ...payload, user };
}
export async function destroySession(): Promise<void> { const payload = parse((await cookies()).get(COOKIE_NAME)?.value); if (payload) await revokeOnlineSession(payload.sessionId); (await cookies()).set(COOKIE_NAME,"",{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"strict",path:"/",maxAge:0,expires:new Date(0)}); }
export async function requireSession(allowPasswordChange = false): Promise<SessionPayload> { const session = await readSession(true); if (!session) redirect("/login"); if(requiresMfa(session.user.role)&&!session.mfaVerifiedAt&&!allowPasswordChange)redirect("/mfa"); if (session.user.mustChangePassword && !allowPasswordChange) redirect("/change-password"); return session; }
export async function requireRole(...allowed: UserRole[]): Promise<SessionPayload> { const session = await requireSession(); if (!allowed.includes(session.user.role)) { auditSecurityEvent("authorization.denied", { actorId: session.user.id, organizationId: session.user.organizationId ?? undefined, outcome: "failure" }); redirect("/forbidden"); } return session; }
export function landingPath(user: SessionUser): string { return user.role === "platform_admin" ? "/admin" : user.role === "organization_owner" ? "/organization" : user.role === "billing_admin" ? "/forbidden" : "/"; }
export const sessionCookieName = COOKIE_NAME;
registerAuditActorResolver(async()=>parse((await cookies()).get(COOKIE_NAME)?.value)?.user.id??null);
