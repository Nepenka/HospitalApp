import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import PDFDocument from "pdfkit";
import type { StoredExamination } from "@/domain/examinations/types";
import { resultSystems } from "@/domain/clinical/types";
import type { Locale } from "@/i18n/config";
import { clinicalSystemLabel, conclusionLabel, diagnosticPresentation, optionLabel, symptomLabel } from "@/i18n/clinical";

export async function createExaminationPdf(examination: StoredExamination, locale: Locale = "ru"): Promise<Buffer> {
  const e = locale === "en";
  const triStateLabel = e ? { yes: "Yes", no: "No", unknown: "Not specified" } as const : { yes: "Да", no: "Нет", unknown: "Не указано" } as const;
  const font = await readFile(path.join(process.cwd(), "public", "fonts", "NotoSans.ttf"));
  const document = new PDFDocument({ size: "A4", margin: 48, info: { Title: e ? "Examination report" : "Заключение по осмотру", Author: "АнаФикс" } });
  const chunks: Buffer[] = [];
  const finished = new Promise<Buffer>((resolve, reject) => {
    document.on("data", (chunk: Buffer) => chunks.push(chunk));
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);
  });
  document.registerFont("NotoSans", font);
  document.font("NotoSans");
  const addHeading = (text: string) => { document.moveDown(0.8).fontSize(14).fillColor("#156b59").text(text).moveDown(0.35); };
  const addLine = (text: string) => { document.fontSize(10).fillColor("#26342f").text(text, { lineGap: 2 }); };

  document.fontSize(20).fillColor("#123c32").text(e ? "AnaFix — examination report" : "АнаФикс — заключение по осмотру");
  document.moveDown(0.4).fontSize(10).fillColor("#64736e").text(`${e ? "Examination ID" : "Номер осмотра"}: ${examination.id}`);
  addLine(`${e ? "Patient" : "Пациент"}: ${examination.patient.fullName}`);
  addLine(`${e ? "Examination date" : "Дата осмотра"}: ${new Intl.DateTimeFormat(e ? "en-GB" : "ru-RU", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Minsk" }).format(new Date(examination.examinedAt))} (${e ? "Minsk time" : "Минск"})`);

  addHeading(e ? "Final assessment" : "Итоговое заключение");
  addLine(conclusionLabel(locale, examination.severity, examination.conclusion.anyConfirmed));
  addLine(`${e ? "Severity grade" : "Степень тяжести"}: ${examination.severity.grade}`);

  addHeading(e ? "Source data" : "Исходные данные");
  addLine(`${e ? "Probable allergen" : "Вероятный аллерген"}: ${examination.probableAllergen ?? (e ? "Not specified" : "Не указан")}`);
  addLine(`${e ? "Allergen exposure" : "Контакт с аллергеном"}: ${triStateLabel[examination.allergenContact]}`);
  addLine(`${e ? "Acute onset" : "Острое начало"}: ${triStateLabel[examination.acuteOnset]}`);

  addHeading(e ? "Diagnostic criteria" : "Диагностические критерии");
  for (const sourceCheck of [examination.conclusion.primary, examination.conclusion.niaid, examination.conclusion.wao]) {
    const check = diagnosticPresentation(locale, sourceCheck);
    addLine(`${check.title}: ${check.summary}`);
    for (const criterion of check.criteria) addLine(`${criterion.met ? "✓" : "—"} ${criterion.label}. ${criterion.details}`);
    document.moveDown(0.25);
  }

  addHeading(e ? "Symptoms" : "Симптомы");
  for (const system of resultSystems) {
    const symptoms = examination.selectedSymptoms.filter((item) => item.system === system);
    if (symptoms.length) addLine(`${clinicalSystemLabel(locale, system)}: ${symptoms.map((item) => symptomLabel(locale, item) + (item.selectedOptionLabel ? ` — ${optionLabel(locale, item.selectedOptionLabel)}` : "")).join(", ")}`);
  }

  addHeading(e ? "Vital signs" : "Витальные показатели");
  addLine(`${e ? "Age" : "Возраст"}: ${examination.vitals.age.years} ${e ? "years" : "лет"}, ${examination.vitals.age.months} ${e ? "months" : "мес."}`);
  addLine(`${e ? "BP" : "АД"}: ${examination.vitals.systolicBP}/${examination.vitals.diastolicBP} ${e ? "mmHg" : "мм рт. ст."}; SpO₂: ${examination.vitals.spO2}%; ${e ? "HR" : "ЧСС"}: ${examination.vitals.heartRate}; ${e ? "RR" : "ЧД"}: ${examination.vitals.respiratoryRate}; GCS: ${examination.vitals.gcs}.`);
  document.moveDown(0.7).fontSize(9).fillColor("#6b6251").text(e ? "Not meeting the criteria does not rule out anaphylaxis and must not delay emergency care when there is clinical suspicion." : "Невыполнение критериев не исключает анафилаксию и не должно задерживать неотложную помощь при клиническом подозрении.");
  document.moveDown(0.5).fontSize(8).fillColor("#71807a").text(`${e ? "Algorithm" : "Алгоритм"}: ${examination.algorithmVersion}. ${e ? "Catalog" : "Каталог"}: ${examination.catalogVersion}.`);
  document.end();
  return finished;
}
