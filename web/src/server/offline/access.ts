import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { decodeGrant, APPROVED_LOCAL_RETENTION_DAYS, type OfflineGrant } from "@/domain/offline/types";
import type { SessionUser } from "@/server/auth/types";

export function offlineAccessHours(): number | null {
  const raw = process.env.OFFLINE_ACCESS_HOURS ?? "";
  if (process.env.OFFLINE_ENABLED !== "true" || !/^\d+$/.test(raw)) return null;
  const hours = Number(raw);
  return Number.isInteger(hours) && hours >= 1 && hours <= 168 ? hours : null;
}
function secret(): string {
  const value = process.env.AUTH_SESSION_SECRET;
  if (value && value.length >= 32) return value;
  if (process.env.NODE_ENV !== "production") return "development-only-secret-change-before-deploy-2026";
  throw new Error("OFFLINE_CONFIGURATION");
}
function signature(body: string): string { return createHmac("sha256", secret()).update(`anafix-offline-v1:${body}`).digest("base64url"); }
export function issueOfflineGrant(user: SessionUser, deviceId: string, hours: number): { grant: string; access: OfflineGrant } {
  const issuedAt = Date.now();
  const access: OfflineGrant = { version: 1, principal: { id: user.id, organizationId: user.organizationId!, displayName: user.displayName, credentialVersion: user.credentialVersion ?? 1 }, deviceId, issuedAt, expiresAt: issuedAt + hours * 3600_000, localRetentionDays: APPROVED_LOCAL_RETENTION_DAYS };
  const body = Buffer.from(JSON.stringify(access)).toString("base64url");
  return { grant: `${body}.${signature(body)}`, access };
}
export function verifyOfflineGrant(token: string, user: SessionUser, allowExpired = false): OfflineGrant {
  if (token.length > 4096) throw new Error("INVALID_GRANT");
  const [body, sig, extra] = token.split(".");
  if (!body || !sig || extra) throw new Error("INVALID_GRANT");
  const actual = Buffer.from(sig), expected = Buffer.from(signature(body));
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error("INVALID_GRANT");
  const grant = decodeGrant(token);
  if (grant.principal.id !== user.id || grant.principal.organizationId !== user.organizationId || grant.issuedAt > Date.now() + 60_000
    || (!allowExpired && (grant.expiresAt <= Date.now() || grant.principal.credentialVersion !== (user.credentialVersion ?? 1)))) throw new Error("INVALID_GRANT");
  return grant;
}
