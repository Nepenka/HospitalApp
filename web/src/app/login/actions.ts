"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { authenticateCredentials } from "@/server/auth/credentials";
import { createSession, destroySession, landingPath, readSession } from "@/server/auth/session";
import { auditSecurityEvent } from "@/server/security/audit";
import { getLocale } from "@/i18n/server";
import { consumeRateLimit } from "@/server/security/rate-limit";
import {requiresMfa} from "@/server/auth/mfa";

export interface LoginState { error?: string }
export async function loginAction(_state: LoginState, formData: FormData): Promise<LoginState> {
  const locale = await getLocale();
  const m = (ru: string, en: string) => locale === "en" ? en : ru;
  const login = String(formData.get("login") ?? "").trim().toLowerCase(); const password = String(formData.get("password") ?? "");
  const requestHeaders = await headers();
  // Only a configured, trusted proxy may supply a client address. Account throttling
  // cannot be bypassed by changing a forwarded header or switching server processes.
  const address=process.env.TRUST_PROXY_CLIENT_IP === "true" ? requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0,64) || "unknown" : "untrusted";
  const allowed=await consumeRateLimit("login-account",login.slice(0,64));
  const networkAllowed=await consumeRateLimit("login-network",address,100);
  if (!allowed || !networkAllowed) { auditSecurityEvent("authentication.rate_limited", { outcome: "failure" }); return { error: m("Слишком много попыток. Повторите вход позднее.", "Too many attempts. Try signing in later.") }; }
  if (!/^[a-z0-9-]{4,64}$/.test(login) || password.length < 12 || password.length > 256) return { error: m("Проверьте логин и пароль.", "Check your login and password.") };
  const user = await authenticateCredentials(login, password);
  if (!user) { auditSecurityEvent("authentication.failed", { outcome: "failure" }); return { error: m("Неверные учётные данные.", "Invalid credentials.") }; }
  await createSession(user); auditSecurityEvent("authentication.succeeded", { actorId: user.id, organizationId: user.organizationId ?? undefined, outcome: "success" }); redirect(requiresMfa(user.role)?"/mfa":user.mustChangePassword?"/change-password":landingPath(user));
}
export async function logoutAction(): Promise<void> { const session = await readSession(); await destroySession(); auditSecurityEvent("session.ended", { actorId: session?.user.id, organizationId: session?.user.organizationId ?? undefined, outcome: "success" }); redirect("/login"); }
