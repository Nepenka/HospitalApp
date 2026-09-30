"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { resolveSymptom, SYMPTOM_CATALOG_VERSION } from "@/domain/clinical/symptom-catalog";
import { CLINICAL_ALGORITHM_VERSION, evaluateAnaphylaxis } from "@/domain/clinical/diagnosis";
import { calculateSeverity } from "@/domain/clinical/severity";
import type { TriState, Vitals } from "@/domain/clinical/types";
import type { ExaminationInput, StoredExamination } from "@/domain/examinations/types";
import { requireRole } from "@/server/auth/session";
import { createExamination, getExamination, softDeleteExamination, updateExamination as updateStoredExamination } from "@/server/examinations/repository";
import { auditSecurityEvent } from "@/server/security/audit";
import { getLocale } from "@/i18n/server";

export interface SaveExaminationResult {
  ok: boolean;
  examinationId?: string;
  message: string;
}

export interface UpdateExaminationInput extends ExaminationInput {
  examinationId: string;
  expectedVersion: number;
}

const triStates = new Set<TriState>(["yes", "no", "unknown"]);

function validInteger(value: number, minimum: number, maximum: number): boolean {
  return Number.isInteger(value) && value >= minimum && value <= maximum;
}

function validateVitals(vitals: Vitals, locale: "ru" | "en"): string | null {
  const m = (ru: string, en: string) => locale === "en" ? en : ru;
  if (!validInteger(vitals.age.years, 0, 130) || !validInteger(vitals.age.months, 0, 11)) return m("Проверьте возраст пациента.", "Check the patient's age.");
  if (!validInteger(vitals.systolicBP, 1, 350) || !validInteger(vitals.diastolicBP, 1, 250) || vitals.diastolicBP > vitals.systolicBP) return m("Проверьте артериальное давление.", "Check the blood pressure values.");
  if (!validInteger(vitals.spO2, 1, 100)) return m("SpO₂ должна быть от 1 до 100%.", "SpO₂ must be between 1 and 100%.");
  if (!validInteger(vitals.heartRate, 1, 300) || !validInteger(vitals.respiratoryRate, 1, 150)) return m("Проверьте ЧСС и ЧД.", "Check the heart and respiratory rates.");
  if (!validInteger(vitals.gcs, 3, 15)) return m("GCS должна быть от 3 до 15.", "GCS must be between 3 and 15.");
  if (vitals.baselineSystolicBP !== undefined && !validInteger(vitals.baselineSystolicBP, 1, 350)) return m("Проверьте исходное систолическое АД.", "Check the baseline systolic blood pressure.");
  return null;
}

export async function saveExamination(input: ExaminationInput): Promise<SaveExaminationResult> {
  const [session, locale] = await Promise.all([requireRole("clinician", "organization_owner"), getLocale()]);
  const m = (ru: string, en: string) => locale === "en" ? en : ru;
  if (!session.user.organizationId) return { ok: false, message: m("Учётная запись не связана с организацией.", "The account is not linked to an organization.") };
  const fullName = input.fullName.trim().replace(/\s+/g, " ");
  const probableAllergen = input.probableAllergen.trim().replace(/\s+/g, " ");

  if (fullName.length < 3 || fullName.length > 200) return { ok: false, message: m("Укажите корректное ФИО пациента.", "Enter a valid patient name.") };
  if (probableAllergen.length > 200) return { ok: false, message: m("Название аллергена слишком длинное.", "The allergen name is too long.") };
  if (!triStates.has(input.acuteOnset) || !triStates.has(input.allergenContact)) return { ok: false, message: m("Проверьте данные о начале реакции и контакте с аллергеном.", "Check the reaction onset and allergen exposure data.") };
  if (input.allergenContact === "yes" && !probableAllergen) return { ok: false, message: m("Укажите аллерген или измените статус контакта.", "Enter the allergen or change the exposure status.") };
  const vitalsError = validateVitals(input.vitals, locale);
  if (vitalsError) return { ok: false, message: vitalsError };

  const uniqueSelections = [...new Map(input.selectedSymptoms.map((item) => [item.id, item])).values()];
  const selectedSymptoms = uniqueSelections.map((item) => resolveSymptom(item.id, item.optionId));
  if (!selectedSymptoms.length || selectedSymptoms.some((symptom) => !symptom)) return { ok: false, message: m("Список симптомов некорректен.", "The symptom list is invalid.") };
  const selected = selectedSymptoms.filter((symptom) => symptom !== null);

  const severity = calculateSeverity(selected, input.vitals);
  const conclusion = evaluateAnaphylaxis({
    selected,
    vitals: input.vitals,
    severity,
    acuteOnset: input.acuteOnset,
    allergenContact: input.allergenContact,
  });
  const now = new Date().toISOString();
  const examinationId = randomUUID();
  const record: StoredExamination = {
    id: examinationId,
    organizationId: session.user.organizationId,
    patient: { id: randomUUID(), fullName },
    probableAllergen: probableAllergen || null,
    allergenContact: input.allergenContact,
    acuteOnset: input.acuteOnset,
    examinedAt: now,
    createdAt: now,
    createdBy: session.user.id,
    updatedAt: now,
    updatedBy: session.user.id,
    rowVersion: 1,
    deletedAt: null,
    deletedBy: null,
    algorithmVersion: CLINICAL_ALGORITHM_VERSION,
    catalogVersion: SYMPTOM_CATALOG_VERSION,
    selectedSymptoms: selected,
    vitals: input.vitals,
    severity,
    conclusion,
  };

  try {
    await createExamination(record);
    auditSecurityEvent("examination.created", { actorId: session.user.id, outcome: "success", resourceId: examinationId });
    revalidatePath("/history");
    return { ok: true, examinationId, message: m("Осмотр сохранён на сервере.", "The examination was saved on the server.") };
  } catch {
    auditSecurityEvent("examination.created", { actorId: session.user.id, outcome: "failure" });
    return { ok: false, message: m("Не удалось сохранить осмотр. Повторите позже.", "Could not save the examination. Try again later.") };
  }
}

export async function updateExamination(input: UpdateExaminationInput): Promise<SaveExaminationResult> {
  const [session, locale] = await Promise.all([requireRole("clinician", "organization_owner"), getLocale()]);
  const m = (ru: string, en: string) => locale === "en" ? en : ru;
  const fullName = input.fullName.trim().replace(/\s+/g, " ");
  const probableAllergen = input.probableAllergen.trim().replace(/\s+/g, " ");
  if (!input.examinationId || !Number.isInteger(input.expectedVersion) || input.expectedVersion < 1) return { ok: false, message: m("Некорректная версия записи.", "Invalid record version.") };
  if (fullName.length < 3 || fullName.length > 200) return { ok: false, message: m("Укажите корректное ФИО пациента.", "Enter a valid patient name.") };
  if (probableAllergen.length > 200) return { ok: false, message: m("Название аллергена слишком длинное.", "The allergen name is too long.") };
  if (!triStates.has(input.acuteOnset) || !triStates.has(input.allergenContact)) return { ok: false, message: m("Проверьте данные о начале реакции и контакте с аллергеном.", "Check the reaction onset and allergen exposure data.") };
  if (input.allergenContact === "yes" && !probableAllergen) return { ok: false, message: m("Укажите аллерген или измените статус контакта.", "Enter the allergen or change the exposure status.") };
  const vitalsError = validateVitals(input.vitals, locale);
  if (vitalsError) return { ok: false, message: vitalsError };
  const uniqueSelections = [...new Map(input.selectedSymptoms.map((item) => [item.id, item])).values()];
  const selectedSymptoms = uniqueSelections.map((item) => resolveSymptom(item.id, item.optionId));
  if (!selectedSymptoms.length || selectedSymptoms.some((symptom) => !symptom)) return { ok: false, message: m("Список симптомов некорректен.", "The symptom list is invalid.") };
  const selected = selectedSymptoms.filter((symptom) => symptom !== null);
  const current = await getExamination(input.examinationId, session.user);
  if (!current) return { ok: false, message: m("Запись не найдена или уже удалена.", "The record was not found or has already been deleted.") };
  const severity = calculateSeverity(selected, input.vitals);
  const conclusion = evaluateAnaphylaxis({ selected, vitals: input.vitals, severity, acuteOnset: input.acuteOnset, allergenContact: input.allergenContact });
  const replacement: StoredExamination = {
    ...current,
    patient: { ...current.patient, fullName },
    probableAllergen: probableAllergen || null,
    allergenContact: input.allergenContact,
    acuteOnset: input.acuteOnset,
    selectedSymptoms: selected,
    vitals: input.vitals,
    severity,
    conclusion,
    algorithmVersion: CLINICAL_ALGORITHM_VERSION,
    catalogVersion: SYMPTOM_CATALOG_VERSION,
    updatedAt: new Date().toISOString(),
    updatedBy: session.user.id,
    rowVersion: current.rowVersion + 1,
  };
  try {
    await updateStoredExamination(current.id, input.expectedVersion, session.user, replacement);
    auditSecurityEvent("examination.updated", { actorId: session.user.id, outcome: "success", resourceId: current.id });
    revalidatePath("/history");
    revalidatePath(`/history/${current.id}`);
    return { ok: true, examinationId: current.id, message: m("Изменения сохранены.", "Changes saved.") };
  } catch (error) {
    auditSecurityEvent("examination.updated", { actorId: session.user.id, outcome: "failure", resourceId: current.id });
    if ((error as Error).message === "EXAMINATION_CONFLICT") return { ok: false, message: m("Запись уже изменил другой пользователь. Обновите страницу и повторите правки.", "Another user has already changed this record. Refresh the page and repeat your changes.") };
    return { ok: false, message: m("Не удалось сохранить изменения.", "Could not save changes.") };
  }
}

export async function deleteExaminationAction(formData: FormData): Promise<void> {
  const session = await requireRole("clinician", "organization_owner");
  const examinationId = String(formData.get("examinationId") ?? "");
  try {
    await softDeleteExamination(examinationId, session.user);
    auditSecurityEvent("examination.deleted", { actorId: session.user.id, outcome: "success", resourceId: examinationId });
  } catch {
    auditSecurityEvent("examination.deleted", { actorId: session.user.id, outcome: "failure", resourceId: examinationId });
    redirect(`/history/${examinationId}?deleteError=1`);
  }
  revalidatePath("/history");
  redirect("/history?deleted=1");
}
