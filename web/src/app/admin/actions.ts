"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/server/auth/session";
import { createBillingEntry, createOrganizationWithOwner, resetAccountPassword, voidBillingEntry, type BillingCurrency, type BillingEntryType } from "@/server/identity/store";
import { auditSecurityEvent } from "@/server/security/audit";
import { getLocale } from "@/i18n/server";

export interface AdminActionState {
  error?: string;
  success?: string;
  credentials?: { login: string; password: string; organizationName: string };
}

export interface BillingActionState { error?: string; success?: string }

async function localizer() {
  const locale = await getLocale();
  return (ru: string, en: string) => locale === "en" ? en : ru;
}

export async function createOrganizationAction(_state: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const m = await localizer();
  const session = await requireRole("platform_admin");
  const organizationName = String(formData.get("organizationName") ?? "").trim().replace(/\s+/g, " ");
  const ownerName = String(formData.get("ownerName") ?? "").trim().replace(/\s+/g, " ");
  if (organizationName.length < 2 || organizationName.length > 200) return { error: m("Укажите название организации от 2 до 200 символов.", "Enter an organization name between 2 and 200 characters.") };
  if (ownerName.length < 3 || ownerName.length > 160) return { error: m("Укажите ФИО администратора организации.", "Enter the organization administrator's name.") };
  try {
    const created = await createOrganizationWithOwner(organizationName, ownerName);
    auditSecurityEvent("organization.created", { actorId: session.user.id, outcome: "success", resourceId: created.organization.id });
    revalidatePath("/admin");
    return { success: m("Организация создана. Пароль больше не будет показан после закрытия этого блока.", "Organization created. The password will not be shown again after this panel is closed."), credentials: { login: created.credentials.login, password: created.credentials.password, organizationName: created.organization.name } };
  } catch (error) {
    auditSecurityEvent("organization.created", { actorId: session.user.id, outcome: "failure" });
    return { error: error instanceof Error && error.message === "ORGANIZATION_EXISTS" ? m("Организация с таким названием уже существует.", "An organization with this name already exists.") : m("Не удалось создать организацию.", "Could not create the organization.") };
  }
}

export async function resetOwnerPasswordAction(_state: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const m = await localizer();
  const session = await requireRole("platform_admin");
  const accountId = String(formData.get("accountId") ?? "");
  const organizationName = String(formData.get("organizationName") ?? "");
  const credentials = accountId ? await resetAccountPassword(accountId) : null;
  if (!credentials) return { error: m("Учётная запись не найдена.", "Account not found.") };
  auditSecurityEvent("account.password_reset", { actorId: session.user.id, outcome: "success", resourceId: accountId });
  return { success: m("Старый пароль больше не действует. Сохраните новые реквизиты.", "The old password is no longer valid. Save the new credentials."), credentials: { login: credentials.login, password: credentials.password, organizationName } };
}

const billingCurrencies = new Set<BillingCurrency>(["USD", "BYN", "RUB"]);
const billingTypes = new Set<BillingEntryType>(["charge", "payment"]);

function parseAmountMinor(raw: string): number | null {
  const normalized = raw.trim().replace(",", ".");
  if (!/^\d{1,9}(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  const value = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function validIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export async function createBillingEntryAction(_state: BillingActionState, formData: FormData): Promise<BillingActionState> {
  const m = await localizer();
  const session = await requireRole("platform_admin");
  const organizationId = String(formData.get("organizationId") ?? "");
  const type = String(formData.get("type") ?? "") as BillingEntryType;
  const currency = String(formData.get("currency") ?? "") as BillingCurrency;
  const effectiveDate = String(formData.get("effectiveDate") ?? "");
  const amountMinor = parseAmountMinor(String(formData.get("amount") ?? ""));
  const note = String(formData.get("note") ?? "").trim().replace(/\s+/g, " ");
  if (!organizationId || !billingTypes.has(type)) return { error: m("Проверьте тип операции.", "Check the transaction type.") };
  if (!billingCurrencies.has(currency)) return { error: m("Выберите USD, BYN или RUB.", "Select USD, BYN or RUB.") };
  if (amountMinor === null) return { error: m("Введите положительную сумму, не более двух знаков после запятой.", "Enter a positive amount with no more than two decimal places.") };
  if (!validIsoDate(effectiveDate)) return { error: m("Укажите корректную дату операции.", "Enter a valid transaction date.") };
  if (note.length > 200) return { error: m("Комментарий не должен превышать 200 символов.", "The comment must not exceed 200 characters.") };
  try {
    const entry = await createBillingEntry({ organizationId, type, currency, amountMinor, effectiveDate, note: note || null, createdBy: session.user.id });
    auditSecurityEvent("billing.entry_created", { actorId: session.user.id, outcome: "success", resourceId: entry.id });
    revalidatePath("/admin");
    revalidatePath(`/admin/organizations/${organizationId}`);
    return { success: type === "charge" ? m("Начисление добавлено.", "Charge added.") : m("Оплата добавлена.", "Payment added.") };
  } catch {
    auditSecurityEvent("billing.entry_created", { actorId: session.user.id, outcome: "failure", resourceId: organizationId });
    return { error: m("Не удалось сохранить финансовую операцию.", "Could not save the financial transaction.") };
  }
}

export async function voidBillingEntryAction(_state: BillingActionState, formData: FormData): Promise<BillingActionState> {
  const m = await localizer();
  const session = await requireRole("platform_admin");
  const entryId = String(formData.get("entryId") ?? "");
  const organizationId = String(formData.get("organizationId") ?? "");
  const entry = entryId ? await voidBillingEntry(entryId, organizationId, session.user.id) : null;
  if (!entry) {
    auditSecurityEvent("billing.entry_voided", { actorId: session.user.id, outcome: "failure", resourceId: entryId });
    return { error: m("Операция не найдена или уже аннулирована.", "Transaction not found or already voided.") };
  }
  auditSecurityEvent("billing.entry_voided", { actorId: session.user.id, outcome: "success", resourceId: entryId });
  revalidatePath("/admin");
  revalidatePath(`/admin/organizations/${organizationId}`);
  return { success: m("Операция аннулирована и исключена из расчётов.", "Transaction voided and excluded from calculations.") };
}
