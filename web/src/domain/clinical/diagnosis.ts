import type {
  ClinicalConclusion,
  DiagnosticCheck,
  DiagnosisStatus,
  SeverityResult,
  SymptomDefinition,
  TriState,
  Vitals,
} from "./types.ts";

export const CLINICAL_ALGORITHM_VERSION = "anafix-web-2026.09.30.2";

export interface DiagnosticInput {
  selected: SymptomDefinition[];
  vitals: Vitals;
  severity: SeverityResult;
  acuteOnset: TriState;
  allergenContact: TriState;
}

const endOrganIds = new Set([
  "cv-collapse",
  "neuro-hypotonia",
  "neuro-syncope",
  "neuro-incontinence-urine",
  "neuro-incontinence-fecal",
]);
const skinOrMucousIds = new Set([
  "skin-urticaria",
  "skin-erythema",
  "skin-itching",
  "skin-angioedema",
  "mucous-eye-itch",
  "mucous-throat",
  "mucous-oas",
  "mucous-lips",
  "mucous-tongue",
]);
const respiratoryCompromiseIds = new Set([
  "resp-dyspnea",
  "resp-stridor",
  "resp-wheeze",
  "resp-stridor-prd",
  "resp-silent",
  "resp-failure",
]);
const bronchospasmOrLaryngealIds = new Set([
  "resp-exhale",
  "resp-dysphonia",
  "resp-stridor",
  "resp-wheeze",
  "resp-stridor-prd",
  "resp-silent",
]);

function status(confirmed: boolean, missingRequiredData: boolean): DiagnosisStatus {
  if (confirmed) return "confirmed";
  return missingRequiredData ? "insufficient_data" : "not_confirmed";
}

function ageSpecificHypotension(vitals: Vitals): boolean {
  const ageYears = vitals.age.years;
  const threshold = ageYears < 1 ? 70 : ageYears <= 10 ? 70 + 2 * ageYears : 90;
  const baselineDrop =
    vitals.baselineSystolicBP !== undefined &&
    vitals.baselineSystolicBP > 0 &&
    vitals.systolicBP < vitals.baselineSystolicBP * 0.7;
  return vitals.systolicBP < threshold || baselineDrop;
}

function check(
  key: DiagnosticCheck["key"],
  title: string,
  checkStatus: DiagnosisStatus,
  criteria: DiagnosticCheck["criteria"],
): DiagnosticCheck {
  const summary = checkStatus === "confirmed"
    ? "Критерии выполнены"
    : checkStatus === "insufficient_data"
      ? "Недостаточно данных"
      : "Критерии не выполнены";
  return { key, title, status: checkStatus, summary, criteria };
}

export function evaluateAnaphylaxis(input: DiagnosticInput): ClinicalConclusion {
  const { selected, severity, vitals, acuteOnset, allergenContact } = input;
  const hasSkinOrMucous = selected.some((symptom) => skinOrMucousIds.has(symptom.id));
  const hasRespiratory = selected.some((symptom) => respiratoryCompromiseIds.has(symptom.id))
    || severity.vitalSummary.dyspnea
    || severity.vitalSummary.lowOxygenSaturation;
  const hasEndOrganDysfunction = severity.vitalSummary.hypotension || selected.some((symptom) => endOrganIds.has(symptom.id));
  const hasPersistentOrSevereGI = selected.some(
    (symptom) => symptom.system === "gastrointestinal" && symptom.subgrade === "moderate",
  );
  const hasBronchospasmOrLaryngeal = selected.some((symptom) => bronchospasmOrLaryngealIds.has(symptom.id));
  const hypotension = ageSpecificHypotension(vitals);
  const activeSystems = Object.values(severity.perSystem).filter((value) => value !== "none").length;

  const primaryCriteria = [
    { id: "grade-4", label: "Степень ОАР 4–5", met: severity.grade >= 4, details: `Рассчитана степень ${severity.grade}` },
    { id: "grade-3-multisystem", label: "Степень 3 и не менее 2 систем", met: severity.grade === 3 && activeSystems >= 2, details: `Активных систем: ${activeSystems}` },
    { id: "isolated-hypotension", label: "Изолированная гипотензия", met: severity.vitalSummary.hypotension && activeSystems === 1 && severity.perSystem.cardiovascular !== "none", details: severity.vitalSummary.hypotension ? "Гипотензия выявлена" : "Гипотензия не выявлена" },
    { id: "respiratory", label: "Умеренные/тяжёлые респираторные проявления", met: severity.perSystem.respiratory === "moderate" || severity.perSystem.respiratory === "severe", details: `Субградация: ${severity.perSystem.respiratory}` },
  ];
  const primaryConfirmed = primaryCriteria.some((criterion) => criterion.met);
  const primary = check("primary", "Алгоритм «АнаФикс»", primaryConfirmed ? "confirmed" : "not_confirmed", primaryCriteria);

  const niaidOneBase = hasSkinOrMucous && (hasRespiratory || hasEndOrganDysfunction);
  const niaidOne = acuteOnset === "yes" && niaidOneBase;
  const niaidCategoryCount = [hasSkinOrMucous, hasRespiratory, hypotension, hasPersistentOrSevereGI].filter(Boolean).length;
  const niaidTwo = allergenContact === "yes" && niaidCategoryCount >= 2;
  const niaidThree = allergenContact === "yes" && hypotension;
  const niaidConfirmed = niaidOne || niaidTwo || niaidThree;
  const niaidMissing = !niaidConfirmed && ((niaidOneBase && acuteOnset === "unknown") || allergenContact === "unknown");
  const niaid = check("niaid_faan_2006", "NIAID/FAAN", status(niaidConfirmed, niaidMissing), [
    { id: "niaid-1", label: "1. Острое начало + кожа/слизистые + дыхание или снижение АД/дисфункция органов", met: niaidOne, details: acuteOnset === "unknown" && niaidOneBase ? "Не указано, было ли начало острым" : niaidOneBase ? "Клиническое сочетание есть" : "Нет нужного сочетания" },
    { id: "niaid-2", label: "2. Контакт с вероятным аллергеном + не менее 2 категорий", met: niaidTwo, details: `Категорий: ${niaidCategoryCount} из 4` },
    { id: "niaid-3", label: "3. Снижение АД после контакта с известным аллергеном", met: niaidThree, details: hypotension ? "Возрастной критерий АД выполнен" : "Возрастной критерий АД не выполнен" },
  ]);

  const waoOneBase = hasSkinOrMucous && (hasRespiratory || hasEndOrganDysfunction || hasPersistentOrSevereGI);
  const waoOne = acuteOnset === "yes" && waoOneBase;
  const waoTwoBase = hypotension || hasBronchospasmOrLaryngeal;
  const waoTwo = acuteOnset === "yes" && allergenContact === "yes" && waoTwoBase;
  const waoConfirmed = waoOne || waoTwo;
  const waoMissing = !waoConfirmed && ((acuteOnset === "unknown" && (waoOneBase || (allergenContact === "yes" && waoTwoBase))) || (allergenContact === "unknown" && waoTwoBase));
  const wao = check("wao_2020", "WAO 2020", status(waoConfirmed, waoMissing), [
    { id: "wao-1", label: "1. Острое начало + кожа/слизистые + дыхание, снижение АД/дисфункция или тяжёлые ЖКТ-симптомы", met: waoOne, details: acuteOnset === "unknown" && waoOneBase ? "Не указано, было ли начало острым" : waoOneBase ? "Клиническое сочетание есть" : "Нет нужного сочетания" },
    { id: "wao-2", label: "2. Острое снижение АД, бронхоспазм или поражение гортани после вероятного аллергена", met: waoTwo, details: waoTwoBase ? "Есть целевое респираторное/гемодинамическое проявление" : "Нет целевого проявления" },
  ]);

  const anyConfirmed = primaryConfirmed || niaidConfirmed || waoConfirmed;
  const severityLabel = severity.grade === 3
    ? "анафилаксия лёгкой степени"
    : severity.grade === 4
      ? "анафилаксия среднетяжёлой степени"
      : severity.grade === 5
        ? "тяжёлая анафилаксия / анафилактический шок"
        : "анафилаксия";

  return {
    primary,
    niaid,
    wao,
    anyConfirmed,
    text: anyConfirmed ? `ОАР ${severity.grade} степени тяжести (${severityLabel})` : `ОАР ${severity.grade} степени тяжести`,
  };
}
