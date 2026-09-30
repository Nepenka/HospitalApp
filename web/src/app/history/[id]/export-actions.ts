"use server";

import { requireRole } from "@/server/auth/session";
import { getExamination } from "@/server/examinations/repository";
import { recordExaminationExport } from "@/server/security/export-audit";
import { getLocale } from "@/i18n/server";
import { conclusionLabel } from "@/i18n/clinical";

export async function requestExaminationExport(examinationId: string, kind: "copy" | "print"): Promise<{ ok: boolean; message: string; conclusion?: string }> {
  const [session, locale] = await Promise.all([requireRole("clinician", "organization_owner"), getLocale()]);
  const examination = await getExamination(examinationId, session.user);
  if (!examination) return { ok: false, message: locale === "en" ? "The examination was not found or access is restricted." : "Осмотр не найден или доступ к нему закрыт." };
  try {
    await recordExaminationExport(kind, examination.id, session.user);
  } catch {
    return { ok: false, message: locale === "en" ? "The audit entry could not be recorded. Export was cancelled." : "Не удалось записать действие в журнал. Экспорт отменён." };
  }
  return { ok: true, message: "", conclusion: kind === "copy" ? conclusionLabel(locale, examination.severity, examination.conclusion.anyConfirmed) : undefined };
}
