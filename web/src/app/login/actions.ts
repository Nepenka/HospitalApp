"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { authenticateCredentials } from "@/server/auth/credentials";
import { createSession, destroySession, landingPath } from "@/server/auth/session";
import { auditSecurityEvent } from "@/server/security/audit";
import { getLocale } from "@/i18n/server";

export interface LoginState { error?: string }
const attempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 15 * 60 * 1000; const MAX_ATTEMPTS = 5;
function consumeAttempt(key: string): boolean {
  const now = Date.now(); const current = attempts.get(key);
  if (!current || current.resetAt <= now) { attempts.set(key, { count: 1, resetAt: now + WINDOW_MS }); return true; }
  if (current.count >= MAX_ATTEMPTS) return false;
  current.count += 1; return true;
}
export async function loginAction(_state: LoginState, formData: FormData): Promise<LoginState> {
  const locale = await getLocale();
  const m = (ru: string, en: string) => locale === "en" ? en : ru;
  const login = String(formData.get("login") ?? "").trim().toLowerCase(); const password = String(formData.get("password") ?? "");
  const requestHeaders = await headers(); const forwarded = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const rateKey = `${forwarded}:${login}`;
  if (!/^[a-z0-9-]{4,64}$/.test(login) || password.length < 12) return { error: m("Проверьте логин и пароль.", "Check your login and password.") };
  if (!consumeAttempt(rateKey)) { auditSecurityEvent("authentication.rate_limited", { outcome: "failure" }); return { error: m("Слишком много попыток. Повторите вход позднее.", "Too many attempts. Try signing in later.") }; }
  const user = await authenticateCredentials(login, password);
  if (!user) { auditSecurityEvent("authentication.failed", { outcome: "failure" }); return { error: m("Неверные учётные данные.", "Invalid credentials.") }; }
  attempts.delete(rateKey); await createSession(user); auditSecurityEvent("authentication.succeeded", { actorId: user.id, outcome: "success" }); redirect(user.mustChangePassword ? "/change-password" : landingPath(user));
}
export async function logoutAction(): Promise<void> { await destroySession(); auditSecurityEvent("session.ended", { outcome: "success" }); redirect("/login"); }
