import "server-only";
import { scryptSync, timingSafeEqual } from "node:crypto";
import type { SessionUser } from "./types.ts";
import { authenticateAccount } from "@/server/identity/store";

const developmentCredentials = { login: "platform-admin", password: "Anafix-Dev-2026!" };
function verifyScrypt(password: string, encoded: string): boolean {
  const [scheme, salt, expected] = encoded.split("$");
  if (scheme !== "scrypt" || !salt || !expected) return false;
  const actual = scryptSync(password, salt, 64); const expectedBuffer = Buffer.from(expected, "base64url");
  return actual.length === expectedBuffer.length && timingSafeEqual(actual, expectedBuffer);
}
function verifyDevelopmentPassword(password: string): boolean {
  return timingSafeEqual(scryptSync(password, "anafix-development-v1", 64), scryptSync(developmentCredentials.password, "anafix-development-v1", 64));
}
export async function authenticateCredentials(login: string, password: string): Promise<SessionUser | null> {
  const normalizedLogin = login.trim().toLowerCase();
  const configuredLogin = process.env.PLATFORM_ADMIN_LOGIN?.trim().toLowerCase();
  const configuredHash = process.env.PLATFORM_ADMIN_PASSWORD_SCRYPT;
  if (configuredLogin && configuredHash && normalizedLogin === configuredLogin && verifyScrypt(password, configuredHash)) {
    return { id: "platform-admin", role: "platform_admin", organizationId: null, displayName: "Администратор платформы", mustChangePassword: false };
  } else if (process.env.NODE_ENV !== "production") {
    if (normalizedLogin === developmentCredentials.login && verifyDevelopmentPassword(password)) return { id: "platform-admin", role: "platform_admin", organizationId: null, displayName: "Администратор платформы", mustChangePassword: false };
  }
  return authenticateAccount(normalizedLogin, password);
}
export const developmentLoginHint = process.env.NODE_ENV !== "production" ? developmentCredentials : null;
