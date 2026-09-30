"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/server/auth/session";
import { createOrganizationMember, resetAccountPassword } from "@/server/identity/store";
import { auditSecurityEvent } from "@/server/security/audit";
import { getLocale } from "@/i18n/server";

export interface TeamActionState {
  error?: string;
  success?: string;
  credentials?: { login: string; password: string; displayName: string };
}

export async function createClinicianAction(_state: TeamActionState, formData: FormData): Promise<TeamActionState> {
  const [session, locale] = await Promise.all([requireRole("organization_owner"), getLocale()]);
  const m = (ru: string, en: string) => locale === "en" ? en : ru;
  if (!session.user.organizationId) return { error: m("Организация не определена.", "Organization is not defined.") };
  const displayName = String(formData.get("displayName") ?? "").trim().replace(/\s+/g, " ");
  if (displayName.length < 3 || displayName.length > 160) return { error: m("Укажите ФИО врача от 3 до 160 символов.", "Enter a clinician name between 3 and 160 characters.") };
  try {
    const credentials = await createOrganizationMember(session.user.organizationId, displayName);
    auditSecurityEvent("account.created", { actorId: session.user.id, outcome: "success", resourceId: credentials.accountId });
    revalidatePath("/organization");
    return { success: m("Учётная запись создана. Сохраните пароль: после закрытия он больше не будет показан.", "Account created. Save the password: it will not be shown again after this panel is closed."), credentials: { login: credentials.login, password: credentials.password, displayName } };
  } catch {
    auditSecurityEvent("account.created", { actorId: session.user.id, outcome: "failure" });
    return { error: m("Не удалось создать учётную запись.", "Could not create the account.") };
  }
}

export async function resetClinicianPasswordAction(_state: TeamActionState, formData: FormData): Promise<TeamActionState> {
  const [session, locale] = await Promise.all([requireRole("organization_owner"), getLocale()]);
  const m = (ru: string, en: string) => locale === "en" ? en : ru;
  if (!session.user.organizationId) return { error: m("Организация не определена.", "Organization is not defined.") };
  const accountId = String(formData.get("accountId") ?? "");
  const displayName = String(formData.get("displayName") ?? "");
  const credentials = accountId ? await resetAccountPassword(accountId, session.user.organizationId) : null;
  if (!credentials) return { error: m("Учётная запись не найдена.", "Account not found.") };
  auditSecurityEvent("account.password_reset", { actorId: session.user.id, outcome: "success", resourceId: accountId });
  return { success: m("Старый пароль отключён. Передайте врачу новые реквизиты.", "The old password has been disabled. Give the clinician the new credentials."), credentials: { login: credentials.login, password: credentials.password, displayName } };
}
