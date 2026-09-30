"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import styles from "../../app/page.module.css";
import { saveExamination, updateExamination } from "@/app/examinations/actions";
import { resolveSymptom, selectionFromStoredSymptom, symptomCatalog } from "@/domain/clinical/symptom-catalog";
import { evaluateAnaphylaxis } from "@/domain/clinical/diagnosis";
import { calculateSeverity } from "@/domain/clinical/severity";
import { evaluateVitals } from "@/domain/clinical/vitals";
import { resultSystems, systems, type TriState, type Vitals } from "@/domain/clinical/types";
import type { StoredExamination } from "@/domain/examinations/types";
import { useTranslations } from "@/i18n/provider";
import { clinicalSubgradeLabel, clinicalSystemLabel, conclusionLabel, diagnosticPresentation, optionLabel, severityReasonLabel, symptomLabel } from "@/i18n/clinical";

type Step = "patient" | "symptoms" | "vitals" | "result";

const stepOrder: Step[] = ["patient", "symptoms", "vitals", "result"];
const stepLabels: Record<Step, string> = {
  patient: "Пациент",
  symptoms: "Симптомы",
  vitals: "Показатели",
  result: "Результат",
};

const initialVitals: Vitals = {
  age: { years: 18, months: 0 },
  systolicBP: 120,
  diastolicBP: 80,
  spO2: 95,
  heartRate: 80,
  respiratoryRate: 16,
  gcs: 15,
};

type VitalsDraft = {
  ageYears: string;
  ageMonths: string;
  systolicBP: string;
  diastolicBP: string;
  baselineSystolicBP: string;
  spO2: string;
  heartRate: string;
  respiratoryRate: string;
  gcs: string;
};

function draftFromVitals(vitals: Vitals): VitalsDraft {
  return {
    ageYears: String(vitals.age.years),
    ageMonths: String(vitals.age.months),
    systolicBP: String(vitals.systolicBP),
    diastolicBP: String(vitals.diastolicBP),
    baselineSystolicBP: vitals.baselineSystolicBP === undefined ? "" : String(vitals.baselineSystolicBP),
    spO2: String(vitals.spO2),
    heartRate: String(vitals.heartRate),
    respiratoryRate: String(vitals.respiratoryRate),
    gcs: String(vitals.gcs),
  };
}

function vitalsFromDraft(draft: VitalsDraft): Vitals {
  return {
    age: { years: Number(draft.ageYears), months: Number(draft.ageMonths) },
    systolicBP: Number(draft.systolicBP),
    diastolicBP: Number(draft.diastolicBP),
    baselineSystolicBP: draft.baselineSystolicBP === "" ? undefined : Number(draft.baselineSystolicBP),
    spO2: Number(draft.spO2),
    heartRate: Number(draft.heartRate),
    respiratoryRate: Number(draft.respiratoryRate),
    gcs: Number(draft.gcs),
  };
}

export default function Home({ initialExamination }: { initialExamination?: StoredExamination }) {
  const { locale, t } = useTranslations();
  const editing = Boolean(initialExamination);
  const initialSelections = initialExamination?.selectedSymptoms.map(selectionFromStoredSymptom).filter((item) => item !== null) ?? [];
  const [step, setStep] = useState<Step>("patient");
  const [fullName, setFullName] = useState(initialExamination?.patient.fullName ?? "");
  const [allergen, setAllergen] = useState(initialExamination?.probableAllergen ?? "");
  const [allergenContact, setAllergenContact] = useState<TriState>(initialExamination?.allergenContact ?? "unknown");
  const [acuteOnset, setAcuteOnset] = useState<TriState>(initialExamination?.acuteOnset ?? "unknown");
  const [selectedIds, setSelectedIds] = useState<string[]>([...new Set(initialSelections.map((item) => item.id))]);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>(() => Object.fromEntries(initialSelections.filter((item) => item.optionId).map((item) => [item.id, item.optionId as string])));
  const [vitalsDraft, setVitalsDraft] = useState<VitalsDraft>(() => draftFromVitals(initialExamination?.vitals ?? initialVitals));
  const [error, setError] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState("");
  const [isSaving, startSaving] = useTransition();

  const selectedSymptoms = useMemo(
    () => selectedIds.map((id) => resolveSymptom(id, selectedOptions[id])).filter((symptom) => symptom !== null),
    [selectedIds, selectedOptions],
  );
  const vitals = useMemo(() => vitalsFromDraft(vitalsDraft), [vitalsDraft]);
  const vitalSummary = useMemo(() => evaluateVitals(vitals), [vitals]);
  const result = useMemo(() => calculateSeverity(selectedSymptoms, vitals), [selectedSymptoms, vitals]);
  const diagnosis = useMemo(() => evaluateAnaphylaxis({ selected: selectedSymptoms, vitals, severity: result, acuteOnset, allergenContact }), [acuteOnset, allergenContact, result, selectedSymptoms, vitals]);
  const currentIndex = stepOrder.indexOf(step);

  useEffect(() => {
    const dirty = !savedId && Boolean(fullName.trim() || allergen.trim() || selectedIds.length);
    const protectDraft = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault(); };
    window.addEventListener("beforeunload", protectDraft);
    return () => window.removeEventListener("beforeunload", protectDraft);
  }, [allergen, fullName, savedId, selectedIds.length]);

  const setVitalDraft = (field: keyof VitalsDraft, value: string) => setVitalsDraft((current) => ({ ...current, [field]: value }));

  const moveNext = () => {
    setError("");
    if (step === "patient" && fullName.trim().length < 3) {
      setError(t("Укажите ФИО пациента."));
      return;
    }
    if (step === "patient" && allergenContact === "yes" && !allergen.trim()) {
      setError(t("Укажите вероятный аллерген или измените статус контакта."));
      return;
    }
    if (step === "symptoms" && selectedIds.length === 0) {
      setError(t("Выберите хотя бы один симптом."));
      return;
    }
    if (step === "vitals") {
      const requiredDrafts = [vitalsDraft.ageYears, vitalsDraft.ageMonths, vitalsDraft.systolicBP, vitalsDraft.diastolicBP, vitalsDraft.spO2, vitalsDraft.heartRate, vitalsDraft.respiratoryRate, vitalsDraft.gcs];
      if (requiredDrafts.some((value) => value.trim() === "")) {
        setError(t("Заполните все обязательные числовые поля."));
        return;
      }
      const values = [vitals.systolicBP, vitals.diastolicBP, vitals.spO2, vitals.heartRate, vitals.respiratoryRate, vitals.gcs];
      if (values.some((value) => !Number.isInteger(value) || value <= 0)) {
        setError(t("Все обязательные показатели должны быть положительными целыми числами."));
        return;
      }
      if (vitals.spO2 > 100 || vitals.gcs < 3 || vitals.gcs > 15 || vitals.age.months < 0 || vitals.age.months > 11) {
        setError(t("Проверьте диапазоны: SpO₂ 1–100%, GCS 3–15, месяцы 0–11."));
        return;
      }
    }
    setStep(stepOrder[Math.min(currentIndex + 1, stepOrder.length - 1)]);
  };

  const reset = () => {
    setStep("patient");
    setFullName("");
    setAllergen("");
    setAllergenContact("unknown");
    setAcuteOnset("unknown");
    setSelectedIds([]);
    setSelectedOptions({});
    setVitalsDraft(draftFromVitals(initialVitals));
    setConfirmed(false);
    setSavedId(null);
    setSaveMessage("");
    setError("");
  };

  const persist = () => {
    setError("");
    setSaveMessage("");
    if (!confirmed) {
      setError(t("Перед сохранением подтвердите, что проверили введённые данные."));
      return;
    }
    if (!navigator.onLine) {
      setError(t("Нет подключения к сети. Не закрывайте вкладку: сохранение станет доступно после восстановления связи."));
      return;
    }
    startSaving(async () => {
      const examination = { fullName, probableAllergen: allergen, allergenContact, acuteOnset, selectedSymptoms: selectedIds.map((id) => ({ id, ...(selectedOptions[id] ? { optionId: selectedOptions[id] } : {}) })), vitals };
      const response = initialExamination
        ? await updateExamination({ ...examination, examinationId: initialExamination.id, expectedVersion: initialExamination.rowVersion })
        : await saveExamination(examination);
      setSaveMessage(response.message);
      if (response.ok && response.examinationId) setSavedId(response.examinationId);
      else setError(response.message);
    });
  };

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.brandMark}>АФ</div>
        <div>
          <p className={styles.eyebrow}>{t("Клиническая поддержка")}</p>
          <h1>АнаФикс</h1>
        </div>
        <span className={styles.draftBadge}>{t("Прототип")}</span>
      </header>

      <nav className={styles.steps} aria-label={t("Этапы осмотра")}>
        {stepOrder.map((item, index) => (
          <button
            className={`${styles.step} ${item === step ? styles.stepActive : ""} ${index < currentIndex ? styles.stepDone : ""}`}
            key={item}
            onClick={() => index < currentIndex && setStep(item)}
            disabled={index > currentIndex}
          >
            <span>{index < currentIndex ? "✓" : index + 1}</span>
            {t(stepLabels[item])}
          </button>
        ))}
      </nav>

      <section className={styles.workspace}>
        {step === "patient" && (
          <div className={styles.panel}>
            <div className={styles.sectionHeading}>
              <p>{t(editing ? "Редактирование осмотра" : "Новый осмотр")}</p>
              <h2>{t("Данные пациента")}</h2>
              <span>{t("Заполните основные сведения перед оценкой симптомов.")}</span>
            </div>
            <div className={styles.formGrid}>
              <label className={styles.fieldWide}>
                <span>{t("ФИО пациента")} <b>*</b></span>
                <input value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder={t("Например, Иванов Иван Иванович")} autoComplete="off" />
              </label>
              <label>
                <span>{t("Вероятный аллерген")}</span>
                <input value={allergen} onChange={(event) => setAllergen(event.target.value)} placeholder={t("Препарат, пищевой продукт…")} />
                <small>{t("Можно оставить пустым, если аллерген неизвестен.")}</small>
              </label>
              <label>
                <span>{t("Контакт с аллергеном")}</span>
                <select value={allergenContact} onChange={(event) => setAllergenContact(event.target.value as TriState)}>
                  <option value="unknown">{t("Неизвестно")}</option>
                  <option value="yes">{t("Да, подтверждён/вероятен")}</option>
                  <option value="no">{t("Нет")}</option>
                </select>
                <small>{t("Используется в NIAID/FAAN и WAO 2020.")}</small>
              </label>
              <label>
                <span>{t("Острое начало")}</span>
                <select value={acuteOnset} onChange={(event) => setAcuteOnset(event.target.value as TriState)}>
                  <option value="unknown">{t("Не указано")}</option>
                  <option value="yes">{t("Да")}</option>
                  <option value="no">{t("Нет")}</option>
                </select>
                <small>{t("Начало в течение минут–нескольких часов.")}</small>
              </label>
            </div>
          </div>
        )}

        {step === "symptoms" && (
          <div className={styles.panel}>
            <div className={styles.sectionHeadingRow}>
              <div className={styles.sectionHeading}>
                <p>{t("Шаг 2")}</p>
                <h2>{t("Клинические симптомы")}</h2>
                <span>{t("Отметьте все наблюдаемые признаки. Текст симптомов показан полностью.")}</span>
              </div>
              <div className={styles.selectedCounter}><strong>{selectedIds.length}</strong><span>{t("выбрано")}</span></div>
            </div>
            <div className={styles.systemList}>
              {systems.map((system) => {
                const items = symptomCatalog.filter((symptom) => symptom.system === system);
                const count = items.filter((symptom) => selectedIds.includes(symptom.id)).length;
                return (
                  <details className={styles.systemCard} key={system} open={count > 0 || system === "skin"}>
                    <summary><span>{clinicalSystemLabel(locale, system)}</span><em>{count || items.length}</em></summary>
                    <div className={styles.symptomGrid}>
                      {items.map((symptom) => {
                        const selected = selectedIds.includes(symptom.id);
                        const resolved = selectedSymptoms.find((item) => item.id === symptom.id);
                        if (symptom.options?.length) return (
                          <div className={`${styles.symptomOption} ${selected ? styles.symptomSelected : ""}`} key={symptom.id}>
                            <div><span>{symptomLabel(locale, symptom)}</span>{resolved && <i data-grade={resolved.subgrade}>{clinicalSubgradeLabel(locale, resolved.subgrade)}</i>}</div>
                            <label><span className="srOnly">{t("Вариант симптома")} «{symptomLabel(locale, symptom)}»</span><select value={selectedOptions[symptom.id] ?? ""} onChange={(event) => { const optionId = event.target.value; setSelectedOptions((current) => { const next = { ...current }; if (optionId) next[symptom.id] = optionId; else delete next[symptom.id]; return next; }); setSelectedIds((current) => optionId ? (current.includes(symptom.id) ? current : [...current, symptom.id]) : current.filter((id) => id !== symptom.id)); }}><option value="">{t("Не выбрано — открыть список")}</option>{symptom.options.map((variant) => <option value={variant.id} key={variant.id}>{optionLabel(locale, variant.label)} ({clinicalSubgradeLabel(locale, variant.subgrade)})</option>)}</select></label>
                          </div>
                        );
                        return (
                          <label className={`${styles.symptom} ${selected ? styles.symptomSelected : ""}`} key={symptom.id}>
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => setSelectedIds((current) => selected ? current.filter((id) => id !== symptom.id) : [...current, symptom.id])}
                            />
                            <span>{symptomLabel(locale, symptom)}</span>
                            <i data-grade={symptom.subgrade}>{clinicalSubgradeLabel(locale, symptom.subgrade)}</i>
                          </label>
                        );
                      })}
                    </div>
                  </details>
                );
              })}
            </div>
          </div>
        )}

        {step === "vitals" && (
          <div className={styles.panel}>
            <div className={styles.sectionHeading}>
              <p>{t("Шаг 3")}</p>
              <h2>{t("Витальные показатели")}</h2>
              <span>{t("Возрастные ориентиры обновляются автоматически и не заменяют клиническую оценку.")}</span>
            </div>
            <div className={styles.ageRow}>
              <label><span>{t("Полных лет")}</span><input type="number" min="0" value={vitalsDraft.ageYears} onChange={(event) => setVitalDraft("ageYears", event.target.value)} /></label>
              <label><span>{t("Месяцев")}</span><input type="number" min="0" max="11" value={vitalsDraft.ageMonths} onChange={(event) => setVitalDraft("ageMonths", event.target.value)} /></label>
            </div>
            <div className={styles.vitalsGrid}>
              <VitalField label={t("Систолическое АД")} unit={t("мм рт. ст.")} value={vitalsDraft.systolicBP} hint={locale === "en" ? `Target: SBP ≥ ${vitals.age.years < 1 ? 70 : vitals.age.years <= 10 ? 70 + 2 * vitals.age.years : 90}` : vitalSummary.guidance.systolicBP} onChange={(value) => setVitalDraft("systolicBP", value)} flagged={vitalSummary.hypotension} />
              <VitalField label={t("Диастолическое АД")} unit={t("мм рт. ст.")} value={vitalsDraft.diastolicBP} hint={locale === "en" ? `Calculated MAP: ${vitalSummary.meanArterialPressure.toFixed(1)}` : `Расчётное срАД: ${vitalSummary.meanArterialPressure.toFixed(1)}`} onChange={(value) => setVitalDraft("diastolicBP", value)} flagged={vitalSummary.meanArterialPressure < 65} />
              {vitals.age.years >= 18 && <VitalField label={t("Исходное САД")} unit={t("мм рт. ст.")} value={vitalsDraft.baselineSystolicBP} hint={t("Для оценки снижения более чем на 30%")} onChange={(value) => setVitalDraft("baselineSystolicBP", value)} />}
              <VitalField label="SpO₂" unit="%" value={vitalsDraft.spO2} hint={locale === "en" ? "Target: 95%; moderate sign below 92%" : vitalSummary.guidance.spO2} onChange={(value) => setVitalDraft("spO2", value)} flagged={vitalSummary.lowOxygenSaturation} />
              <VitalField label={t("ЧСС")} unit={t("уд/мин")} value={vitalsDraft.heartRate} hint={locale === "en" ? vitalSummary.guidance.heartRate.replace("Тахикардия: ЧСС", "Tachycardia: HR") : vitalSummary.guidance.heartRate} onChange={(value) => setVitalDraft("heartRate", value)} flagged={vitalSummary.tachycardia} />
              <VitalField label={t("ЧД")} unit={t("в минуту")} value={vitalsDraft.respiratoryRate} hint={locale === "en" ? vitalSummary.guidance.respiratoryRate.replace("Одышка: ЧД", "Tachypnea: RR") : vitalSummary.guidance.respiratoryRate} onChange={(value) => setVitalDraft("respiratoryRate", value)} flagged={vitalSummary.dyspnea} />
              <VitalField label={t("Шкала комы Глазго")} unit={t("баллы")} value={vitalsDraft.gcs} hint={locale === "en" ? "Normal: 15 points" : vitalSummary.guidance.gcs} onChange={(value) => setVitalDraft("gcs", value)} flagged={vitals.gcs < 15} />
            </div>
          </div>
        )}

        {step === "result" && (
          <div className={styles.resultLayout}>
            <section className={styles.resultHero} data-grade={result.grade}>
              <div><p>{t("Результат оценки")}</p><h2>{locale === "en" ? `Acute allergic reaction · grade ${result.grade}` : `ОАР ${result.grade} степени`}</h2></div>
              <div className={styles.gradeCircle}>{result.grade}</div>
              <p>{t("Результат является поддержкой принятия решения и требует подтверждения врачом.")}</p>
            </section>
            <section className={styles.panel}>
              <div className={styles.sectionHeading}><p>{t("Сводка")}</p><h2>{fullName}</h2><span>{allergen ? `${t("Вероятный аллерген")}: ${allergen}` : t("Вероятный аллерген не указан")}</span></div>
              <div className={styles.subgradeGrid}>
                {resultSystems.map((system) => <div key={system}><span>{clinicalSystemLabel(locale, system)}</span><strong data-subgrade={result.perSystem[system]}>{clinicalSubgradeLabel(locale, result.perSystem[system])}</strong></div>)}
              </div>
              <div className={styles.reasonBox}><h3>{t("Что повлияло на результат")}</h3><ul>{result.reasons.map((reason, index) => <li key={`${reason}-${index}`}>{severityReasonLabel(locale, reason)}</li>)}</ul></div>
              <h3 className={styles.conclusion}>{conclusionLabel(locale, result, diagnosis.anyConfirmed)}</h3>
              <div className={styles.diagnosisResultGrid}>{[diagnosis.primary, diagnosis.niaid, diagnosis.wao].map((source) => diagnosticPresentation(locale, source)).map((item) => <article key={item.key} data-status={item.status}><div><h3>{item.title}</h3><strong>{item.summary}</strong></div><ul>{item.criteria.map((criterion) => <li key={criterion.id} data-met={criterion.met}><b>{criterion.met ? "✓" : "—"}</b><span>{criterion.label}<small>{criterion.details}</small></span></li>)}</ul></article>)}</div>
              <div className={styles.emergencyNotice}><strong>{t("Клинически важно")}</strong><span>{t("Невыполнение критериев не исключает анафилаксию и не должно задерживать неотложную помощь.")}</span></div>
              <label className={styles.confirm}><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} disabled={Boolean(savedId)} /> <span>{t("Я проверил(а) данные и подтверждаю результат осмотра")}</span></label>
              {saveMessage && savedId && <div className={styles.success} role="status">{saveMessage}</div>}
            </section>
          </div>
        )}

        {error && <div className={styles.error} role="alert">{error}</div>}
        <div className={styles.actions}>
          {currentIndex > 0 && <button className={styles.secondaryButton} onClick={() => setStep(stepOrder[currentIndex - 1])}>{t("Назад")}</button>}
          {step !== "result" ? <button className={styles.primaryButton} onClick={moveNext}>{t(step === "vitals" ? "Рассчитать результат" : "Продолжить")}<span>→</span></button> : savedId ? <><Link className={styles.secondaryActionLink} href={`/history/${savedId}`}>{t("Открыть запись")}</Link>{!editing && <button className={styles.primaryButton} onClick={reset}>{t("Новый осмотр")}</button>}</> : <button className={styles.primaryButton} onClick={persist} disabled={isSaving}>{t(isSaving ? "Сохранение…" : editing ? "Сохранить изменения" : "Сохранить осмотр")}</button>}
        </div>
      </section>
      <footer>{t("Алгоритм")}: anafix-web-2026.09.30 · {t("Осмотры сохраняются на сервере в зашифрованном виде")}</footer>
    </main>
  );
}

function VitalField({ label, unit, value, hint, onChange, flagged = false }: { label: string; unit: string; value: number | string; hint: string; onChange: (value: string) => void; flagged?: boolean }) {
  return (
    <label className={`${styles.vitalField} ${flagged ? styles.vitalFlagged : ""}`}>
      <span>{label}</span>
      <div><input type="number" value={value} onChange={(event) => onChange(event.target.value)} /><em>{unit}</em></div>
      <small>{flagged ? `⚠ ${hint}` : hint}</small>
    </label>
  );
}
