"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { deleteExaminationAction } from "@/app/examinations/actions";
import { requestExaminationExport } from "./export-actions";
import styles from "../history.module.css";
import { useTranslations } from "@/i18n/provider";

type ExportKind = "print" | "copy" | "pdf";

export function RecordActions({ examinationId }: { examinationId: string }) {
  const { locale, t } = useTranslations();
  const [confirming, setConfirming] = useState(false);
  const [exportKind, setExportKind] = useState<ExportKind | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState("");
  const confirmExportRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!exportKind) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    confirmExportRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExportKind(null);
      if (event.key === "Tab") {
        const buttons = document.querySelectorAll<HTMLButtonElement>(`[data-export-dialog] button:not(:disabled)`);
        if (buttons.length < 2) return;
        if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons[buttons.length - 1].focus(); }
        else if (!event.shiftKey && document.activeElement === buttons[buttons.length - 1]) { event.preventDefault(); buttons[0].focus(); }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("keydown", onKeyDown); previousFocus?.focus(); };
  }, [exportKind]);

  async function continueExport() {
    if (!exportKind || exporting) return;
    setExporting(true);
    setExportMessage("");
    try {
      if (exportKind === "pdf") {
        const response = await fetch(`/history/${examinationId}/pdf`, { credentials: "same-origin", cache: "no-store" });
        if (!response.ok) throw new Error(locale === "en" ? "Could not download the PDF or write the audit entry." : "Не удалось скачать PDF или записать экспорт в журнал.");
        const url = URL.createObjectURL(await response.blob());
        const link = document.createElement("a");
        link.href = url;
        link.download = `examination-${examinationId}.pdf`;
        document.body.append(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
        setExportMessage(locale === "en" ? "PDF download started. The request was recorded in the audit log." : "Загрузка PDF начата. Запрос записан в журнал.");
      } else {
        const result = await requestExaminationExport(examinationId, exportKind);
        if (!result.ok) throw new Error(result.message);
        if (exportKind === "copy") {
          if (!navigator.clipboard?.writeText) throw new Error(locale === "en" ? "Clipboard access is unavailable in this browser or without a secure connection." : "Буфер обмена недоступен в этом браузере или без защищённого соединения.");
          await navigator.clipboard.writeText(result.conclusion ?? "");
          setExportMessage(locale === "en" ? "Conclusion copied. The action was recorded in the audit log." : "Заключение скопировано. Действие записано в журнал.");
        } else {
          setExportMessage(locale === "en" ? "Print dialog opened. The request was recorded in the audit log." : "Печать открыта. Запрос записан в журнал.");
          window.print();
        }
      }
      setExportKind(null);
    } catch (error) {
      setExportMessage(error instanceof Error ? error.message : locale === "en" ? "Export failed. Try again." : "Не удалось выполнить экспорт. Повторите попытку.");
    } finally {
      setExporting(false);
    }
  }

  return <div className={styles.recordActions}>
    <Link className={styles.secondaryLink} href={`/history/${examinationId}/edit`}>{t("Редактировать")}</Link>
    <button className={styles.secondaryLink} type="button" onClick={() => { setExportKind("copy"); setExportMessage(""); }}>{t("Копировать заключение")}</button>
    <button className={styles.secondaryLink} type="button" onClick={() => { setExportKind("print"); setExportMessage(""); }}>{t("Печать")}</button>
    <button className={styles.secondaryLink} type="button" onClick={() => { setExportKind("pdf"); setExportMessage(""); }}>{t("Скачать PDF")}</button>
    {!confirming ? <button className={styles.dangerButton} type="button" onClick={() => setConfirming(true)}>{t("Удалить")}</button> : <div className={styles.deleteConfirm} role="alert"><span>{t("Удалить запись из истории?")}</span><form action={deleteExaminationAction}><input type="hidden" name="examinationId" value={examinationId} /><button className={styles.dangerButton} type="submit">{t("Да, удалить")}</button></form><button className={styles.textCancel} type="button" onClick={() => setConfirming(false)}>{t("Отмена")}</button></div>}
    {exportMessage && <div className={styles.exportMessage} role="status">{exportMessage}</div>}
    {exportKind && <div className={styles.exportOverlay} role="presentation"><div className={styles.exportDialog} data-export-dialog role="alertdialog" aria-modal="true" aria-labelledby="export-title" aria-describedby="export-description"><h2 id="export-title">{t("Персональные данные пациента")}</h2><p id="export-description">{t("Заключение содержит медицинские и персональные данные. Передавайте его только уполномоченным лицам и храните в защищённом месте.")} {t(exportKind === "print" ? "Проверьте выбранный принтер и заберите распечатку." : exportKind === "pdf" ? "Проверьте папку загрузок и доступ к файлу." : "Проверьте, куда вы вставляете скопированный текст.")}</p><div><button className={styles.textCancel} type="button" disabled={exporting} onClick={() => setExportKind(null)}>{t("Отмена")}</button><button ref={confirmExportRef} className={styles.filterButton} type="button" disabled={exporting} onClick={continueExport}>{t(exporting ? "Подготовка…" : "Понимаю, продолжить")}</button></div></div></div>}
  </div>;
}
