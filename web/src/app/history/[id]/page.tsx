import Link from "next/link";
import { notFound } from "next/navigation";
import { resultSystems } from "@/domain/clinical/types";
import { requireRole } from "@/server/auth/session";
import { getExamination } from "@/server/examinations/repository";
import { auditSecurityEvent } from "@/server/security/audit";
import styles from "../history.module.css";
import { RecordActions } from "./record-actions";
import { getLocale } from "@/i18n/server";
import { translate } from "@/i18n/config";
import { clinicalSystemLabel, conclusionLabel, diagnosticPresentation, optionLabel, symptomLabel } from "@/i18n/clinical";

export const dynamic = "force-dynamic";
export default async function ExaminationDetailsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ deleteError?: string }> }) {
  const [session, locale] = await Promise.all([requireRole("clinician", "organization_owner"), getLocale()]);
  const t = (text: string) => translate(locale, text);
  const { id } = await params;
  const examination = await getExamination(id, session.user);
  if (!examination) notFound();
  auditSecurityEvent("examination.viewed", { actorId: session.user.id, outcome: "success", resourceId: examination.id });
  const diagnosticChecks = [examination.conclusion.primary, examination.conclusion.niaid, examination.conclusion.wao].map((item) => diagnosticPresentation(locale, item));
  const triStateLabel = { yes: t("Да"), no: t("Нет"), unknown: t("Не указано") } as const;
  const query = await searchParams;

  return <main className={styles.page}>
    <header className={styles.header}><div><p>{t("История осмотров")}</p><h1>{examination.patient.fullName}</h1><span>{new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "ru-RU", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Minsk" }).format(new Date(examination.examinedAt))}</span></div><div className={styles.headerActions}><RecordActions examinationId={examination.id} /><Link className={styles.secondaryLink} href="/history">← {t("К истории")}</Link></div></header>
    {query.deleteError && <div className={styles.errorNotice} role="alert">{locale === "en" ? "Could not delete the record. Refresh the page and try again." : "Не удалось удалить запись. Обновите страницу и повторите попытку."}</div>}
    <section className={styles.detailGrid}>
      <article className={styles.summaryCard} data-grade={examination.severity.grade}><p>{t("Итоговое заключение")}</p><h2>{conclusionLabel(locale, examination.severity, examination.conclusion.anyConfirmed)}</h2><div className={styles.bigGrade}>{examination.severity.grade}</div><small>{t("Алгоритм")}: {examination.algorithmVersion}<br />{t("Каталог")}: {examination.catalogVersion}</small></article>
      <article className={styles.card}><h2>{t("Исходные данные")}</h2><dl className={styles.definitionList}><div><dt>{t("Вероятный аллерген")}</dt><dd>{examination.probableAllergen ?? t("Не указан")}</dd></div><div><dt>{t("Контакт с аллергеном")}</dt><dd>{triStateLabel[examination.allergenContact]}</dd></div><div><dt>{t("Острое начало")}</dt><dd>{triStateLabel[examination.acuteOnset]}</dd></div>{examination.rowVersion > 1 && <div><dt>{t("Последнее изменение")}</dt><dd>{new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "ru-RU", { dateStyle: "short", timeStyle: "short" }).format(new Date(examination.updatedAt))}</dd></div>}</dl></article>
    </section>
    <section className={styles.card}><h2>{t("Диагностические критерии")}</h2><div className={styles.diagnosisGrid}>{diagnosticChecks.map((item) => <article className={styles.diagnosisCard} data-status={item.status} key={item.key}><header><h3>{item.title}</h3><strong>{item.summary}</strong></header><ul>{item.criteria.map((criterion) => <li key={criterion.id} data-met={criterion.met}><b>{criterion.met ? "✓" : "—"}</b><span>{criterion.label}<small>{criterion.details}</small></span></li>)}</ul></article>)}</div><p className={styles.clinicalWarning}>{locale === "en" ? "Not meeting the criteria does not rule out anaphylaxis and must not delay emergency care when there is clinical suspicion." : "Невыполнение критериев не исключает анафилаксию и не должно задерживать неотложную помощь при клиническом подозрении."}</p></section>
    <section className={styles.card}><h2>{t("Симптомы")}</h2><div className={styles.symptomColumns}>{resultSystems.map((system) => { const symptoms = examination.selectedSymptoms.filter((item) => item.system === system); return symptoms.length ? <div key={system}><h3>{clinicalSystemLabel(locale, system)}</h3><ul>{symptoms.map((item) => <li key={item.id}>{symptomLabel(locale, item)}{item.selectedOptionLabel ? ` — ${optionLabel(locale, item.selectedOptionLabel)}` : ""}</li>)}</ul></div> : null; })}</div></section>
    <section className={styles.card}><h2>{t("Витальные показатели")}</h2><dl className={styles.vitalList}><div><dt>{t("Возраст")}</dt><dd>{examination.vitals.age.years} {t("лет")}, {examination.vitals.age.months} {t("мес.")}</dd></div><div><dt>{t("АД")}</dt><dd>{examination.vitals.systolicBP}/{examination.vitals.diastolicBP}</dd></div><div><dt>SpO₂</dt><dd>{examination.vitals.spO2}%</dd></div><div><dt>{t("ЧСС")}</dt><dd>{examination.vitals.heartRate}</dd></div><div><dt>{t("ЧД")}</dt><dd>{examination.vitals.respiratoryRate}</dd></div><div><dt>GCS</dt><dd>{examination.vitals.gcs}</dd></div></dl></section>
  </main>;
}
