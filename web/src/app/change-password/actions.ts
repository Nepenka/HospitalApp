"use server";

import { redirect } from "next/navigation";
import { createSession, landingPath, requireSession } from "@/server/auth/session";
import { changeAccountPassword } from "@/server/identity/store";
import { auditSecurityEvent } from "@/server/security/audit";
import { getLocale } from "@/i18n/server";

export interface ChangePasswordState { error?: string }

export async function changePasswordAction(_state: ChangePasswordState, formData: FormData): Promise<ChangePasswordState> {
  const [session, locale] = await Promise.all([requireSession(true), getLocale()]);
  const m = (ru: string, en: string) => locale === "en" ? en : ru;
  if (session.user.role === "platform_admin") redirect("/admin");
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "");
  if (password.length < 14 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) return { error: m("Пароль должен содержать не менее 14 символов, заглавную и строчную буквы, цифру и спецсимвол.", "Use at least 14 characters including uppercase and lowercase letters, a number and a special character.") };
  if (password !== confirmation) return { error: m("Пароли не совпадают.", "Passwords do not match.") };
  const user = await changeAccountPassword(session.user.id, password);
  if (!user) { auditSecurityEvent("account.password_reset", { actorId: session.user.id, outcome: "failure" }); return { error: m("Не удалось изменить пароль.", "Could not change the password.") }; }
  await createSession(user);
  auditSecurityEvent("account.password_reset", { actorId: session.user.id, outcome: "success", resourceId: session.user.id });
  redirect(landingPath(user));
}
