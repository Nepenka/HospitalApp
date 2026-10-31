import type { LocalExamination } from "../../domain/offline/types.ts";
import type { Locale } from "../../i18n/config.ts";
import { conclusionLabel, diagnosticPresentation, symptomLabel, optionLabel } from "../../i18n/clinical.ts";
import { reactionDateLabel } from "../../domain/examinations/annotations.ts";

export function offlineExportText(local: LocalExamination, locale: Locale): string {
  const r = local.record, e = locale === "en";
  const m = (ru: string,en: string) => e ? en : ru;
  const tri = (value: string) => value === "yes" ? m("Да","Yes") : value === "no" ? m("Нет","No") : m("Неизвестно","Unknown");
  return [
    m("АнаФикс · ЛОКАЛЬНАЯ КОПИЯ ОСМОТРА","AnaFix · LOCAL EXAMINATION COPY"),
    local.state === "synced" ? m("Синхронизированная копия; серверная версия могла измениться.","Synchronized copy; the server version may have changed.") : m("НЕ СИНХРОНИЗИРОВАНО. Не является подтверждением сохранения на сервере.","NOT SYNCHRONIZED. This is not proof of server persistence."),
    `${m("Пациент","Patient")}: ${r.patient.fullName}`,
    `${m("Осмотр","Examination")}: ${new Intl.DateTimeFormat(e ? "en-GB" : "ru-RU", { dateStyle:"short",timeStyle:"short",timeZone:"Europe/Minsk" }).format(new Date(r.examinedAt))} · ${m("Минск","Minsk")}`,
    `${m("Версия","Version")}: ${r.rowVersion} · ${m("Алгоритм","Algorithm")}: ${r.algorithmVersion}`,
    `${m("Аллерген","Allergen")}: ${r.probableAllergen ?? m("Не указан","Not specified")}`,
    `${m("Контакт / острое начало","Exposure / acute onset")}: ${tri(r.allergenContact)} / ${tri(r.acuteOnset)}`,
    `${m("Начало реакции","Reaction onset")}: ${reactionDateLabel(r.reactionDate,r.reactionTime,locale)}`,
    `${m("Возраст","Age")}: ${r.vitals.age.years} ${m("лет","years")}, ${r.vitals.age.months} ${m("месяцев","months")}`,
    `${m("АД","BP")}: ${r.vitals.systolicBP}/${r.vitals.diastolicBP} · SpO2: ${r.vitals.spO2}% · ${m("ЧСС","HR")}: ${r.vitals.heartRate} · ${m("ЧД","RR")}: ${r.vitals.respiratoryRate} · GCS: ${r.vitals.gcs}`,
    ...(r.vitals.baselineSystolicBP === undefined ? [] : [`${m("Исходное САД","Baseline SBP")}: ${r.vitals.baselineSystolicBP}`]),
    "", conclusionLabel(locale,r.severity,r.conclusion.anyConfirmed), "",
    `${m("Комментарий/уточнение врача","Physician comment / clarification")}: ${r.physicianComment ?? m("Не указано","Not specified")}`,
    "", m("Симптомы","Symptoms"),
    ...r.selectedSymptoms.map(s => `• ${symptomLabel(locale,s)}${s.selectedOptionLabel ? ` — ${optionLabel(locale,s.selectedOptionLabel)}` : ""}`),
    "", ...[r.conclusion.primary,r.conclusion.niaid,r.conclusion.wao].flatMap(source => { const d = diagnosticPresentation(locale,source); return [d.title,d.summary,...d.criteria.map(c => `${c.met ? "+" : "—"} ${c.label}: ${c.details}`),""]; }),
    m("Результат требует клинической проверки. Невыполнение критериев не исключает анафилаксию и не должно задерживать помощь.","The result requires clinical review. Not meeting the criteria does not exclude anaphylaxis and must not delay care."),
  ].join("\n");
}
export async function offlinePdfBlob(text: string): Promise<Blob> {
  // The package's browser entry is selected by Next; no server module or filesystem access.
  const { default: PDFDocument } = await import("pdfkit");
  const response = await fetch("/fonts/NotoSans.ttf", { credentials: "omit" });
  if (!response.ok) throw new Error("OFFLINE_FONT_UNAVAILABLE");
  const font = await response.arrayBuffer();
  // PDFKit supports ArrayBuffer fonts; its older DefinitelyTyped options only declare string.
  const doc = new PDFDocument({ size:"A4",margin:44,font:font as unknown as string,info:{Title:"AnaFix local examination copy"} });
  const chunks: ArrayBuffer[] = [];
  const output = new Promise<Blob>((resolve,reject) => {
    doc.on("data", (chunk: Uint8Array) => { chunks.push(new Uint8Array(chunk).buffer); });
    doc.on("error",reject); doc.on("end", () => resolve(new Blob(chunks,{type:"application/pdf"})));
  });
  doc.fontSize(10).fillColor("#17342d").text(text,{lineGap:3}); doc.end();
  return output;
}
export function downloadOfflinePdf(blob: Blob): void {
  const url = URL.createObjectURL(blob), link = document.createElement("a");
  link.href=url; link.download="anafix-local-examination.pdf"; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url),60_000);
}
export async function printOfflineText(text: string): Promise<void> {
  const frame = document.createElement("iframe");
  frame.title="AnaFix print"; frame.style.cssText="position:fixed;width:0;height:0;border:0";
  document.body.append(frame);
  try {
    const doc = frame.contentDocument, win = frame.contentWindow;
    if(!doc || !win) throw new Error("PRINT_UNAVAILABLE");
    const style=doc.createElement("style"); style.textContent="@page{size:A4;margin:18mm}body{font:11pt Arial,sans-serif;color:#17342d}pre{font:inherit;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.5}"; doc.head.append(style);
    const content=doc.createElement("pre"); content.textContent=text; doc.body.append(content);
    await doc.fonts.ready;
    win.addEventListener("afterprint",()=>frame.remove(),{once:true}); win.focus(); win.print();
  } catch(error) { frame.remove(); throw error; }
  // Ensure PHI does not remain in a hidden frame if afterprint isn't delivered.
  setTimeout(()=>frame.remove(),60_000);
}
