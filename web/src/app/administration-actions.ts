"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/server/auth/session";
import { getLocale } from "@/i18n/server";
import { manageAccount, revokeOnlineSession, setOfflineDeviceStatus, setOrganizationStatus, updateLicense } from "@/server/identity/store";
import { validateLicense, type OrganizationLicense, type LicenseCurrency } from "@/domain/administration/license";
import { auditSecurityEvent } from "@/server/security/audit";

export interface AdministrationState { error?: string; success?: string }
export async function manageAccessAction(_state: AdministrationState, form: FormData): Promise<AdministrationState> {
  const session = await requireRole("organization_owner", "platform_admin");
  const e = (await getLocale()) === "en";
  const platform = session.user.role === "platform_admin";
  const organizationId = platform ? String(form.get("organizationId") ?? "") : session.user.organizationId!;
  const operation = String(form.get("operation") ?? "");
  const target = String(form.get("target") ?? "");
  const id = String(form.get("id") ?? "");
  if (!id || (target !== "session" && !organizationId)) return { error: e ? "Invalid target." : "Не выбран объект изменения." };
  if (operation !== "rename" && form.get("confirm") !== "yes") return { error: e ? "Confirm the access change." : "Подтвердите изменение доступа." };
  try {
    if (target === "account" && ["rename", "suspend", "activate", "revoke"].includes(operation)) {
      if (id === session.user.id && operation !== "rename") throw new Error("SELF_CHANGE");
      await manageAccount(id, organizationId, operation as "rename" | "suspend" | "activate" | "revoke", String(form.get("displayName") ?? ""), !platform);
      auditSecurityEvent("account.updated", { actorId: session.user.id, organizationId, resourceId: id, outcome: "success" });
    } else if (target === "session" && operation === "revoke") {
      if (id === session.sessionId) throw new Error("SELF_CHANGE");
      if (!(await revokeOnlineSession(id, platform ? undefined : organizationId))) throw new Error("NOT_FOUND");
      auditSecurityEvent("session.revoked", { actorId: session.user.id, organizationId: organizationId || undefined, outcome: "success" });
    } else if (target === "device" && ["suspend", "activate"].includes(operation)) {
      await setOfflineDeviceStatus(id, String(form.get("accountId") ?? ""), organizationId, operation === "suspend" ? "suspended" : "active");
      auditSecurityEvent("device.status_updated", { actorId: session.user.id, organizationId, resourceId: id, outcome: "success" });
    } else if (platform && target === "organization" && ["suspend", "activate"].includes(operation) && id === organizationId) {
      await setOrganizationStatus(id, operation === "suspend" ? "suspended" : "active");
      auditSecurityEvent("organization.status_updated", { actorId: session.user.id, organizationId, resourceId: id, outcome: "success" });
    } else throw new Error("INVALID_OPERATION");
    revalidatePath("/", "layout");
    return { success: e ? "Access settings updated. No medical records were deleted." : "Доступ обновлён. Медицинские записи не удалены." };
  } catch (error) {
    auditSecurityEvent("authorization.denied", { actorId: session.user.id, organizationId: organizationId || undefined, outcome: "failure" });
    return { error: error instanceof Error && error.message === "CLINICIAN_LIMIT" ? (e ? "The clinician limit has been reached." : "Достигнут лимит врачей по лицензии.") : (e ? "Could not update access. Check the account and permissions." : "Не удалось изменить доступ. Проверьте учётную запись и права.") };
  }
}
export async function updateLicenseAction(_state: AdministrationState, form: FormData): Promise<AdministrationState> {
  const session = await requireRole("platform_admin");
  const e = (await getLocale()) === "en";
  const organizationId = String(form.get("organizationId") ?? "");
  const rawPrice = String(form.get("price") ?? "").trim().replace(",", ".");
  const rawLimit = String(form.get("maxClinicians") ?? "").trim();
  const rawHours = String(form.get("offlineHours") ?? "").trim();
  try {
    if (!organizationId || (rawPrice && !/^\d{1,9}(?:\.\d{1,2})?$/.test(rawPrice)) || (rawLimit && !/^\d+$/.test(rawLimit)) || (rawHours && !/^\d+$/.test(rawHours))) throw new Error("INVALID_LICENSE");
    const [whole, fraction = ""] = rawPrice.split(".");
    const license: OrganizationLicense = {
      startsOn: String(form.get("startsOn") ?? "") || null, endsOn: String(form.get("endsOn") ?? "") || null,
      maxClinicians: rawLimit ? Number(rawLimit) : null, priceMinor: rawPrice ? Number(whole) * 100 + Number(fraction.padEnd(2, "0")) : null,
      currency: rawPrice ? String(form.get("currency") ?? "") as LicenseCurrency : null,
      offlineAllowed: form.get("offlineAllowed") === "on", offlineHours: rawHours ? Number(rawHours) : null,
    };
    validateLicense(license);
    await updateLicense(organizationId, license, session.user.id, String(form.get("reason") ?? ""));
    auditSecurityEvent("organization.license_updated", { actorId: session.user.id, organizationId, resourceId: organizationId, outcome: "success" });
    revalidatePath("/", "layout");
    return { success: e ? "License saved. No charges were created automatically." : "Лицензия сохранена. Начисления автоматически не создавались." };
  } catch (error) {
    auditSecurityEvent("organization.license_updated", { actorId: session.user.id, organizationId, outcome: "failure" });
    return { error: error instanceof Error && error.message === "ACTIVE_CLINICIAN_LIMIT" ? (e ? "The limit cannot be lower than the current number of active clinicians. Block excess accounts first." : "Лимит не может быть меньше текущего числа активных врачей. Сначала заблокируйте лишние учётные записи.") : (e ? "Check dates, limits, currency and change reason. Offline access requires an explicit duration of 1–168 hours." : "Проверьте даты, лимиты, валюту и причину изменения. Для offline-доступа нужен явно указанный срок от 1 до 168 часов.") };
  }
}
