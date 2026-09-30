import type { PatientAge, VitalImpact, VitalSummary, Vitals } from "./types.ts";

const ageInMonths = (age: PatientAge) => age.years * 12 + age.months;

function sbpThreshold(age: PatientAge): number {
  if (age.years < 1) return 70;
  if (age.years <= 10) return 70 + 2 * age.years;
  return 90;
}

function heartRateThreshold(age: PatientAge): number {
  if (age.years >= 11) return 100;
  if (age.years >= 1) return 130;
  if (ageInMonths(age) < 3) return 150;
  if (ageInMonths(age) < 6) return 130;
  return 120;
}

function respiratoryRateThreshold(age: PatientAge): number {
  if (age.years >= 18) return 20;
  if (age.years >= 11) return 30;
  if (age.years >= 6) return 35;
  if (age.years >= 1) return 40;
  return ageInMonths(age) < 3 ? 60 : 50;
}

export function evaluateVitals(vitals: Vitals): VitalSummary {
  const { age } = vitals;
  const meanArterialPressure = vitals.systolicBP / 3 + (2 * vitals.diastolicBP) / 3;
  const isAdult = age.years >= 18;
  const systolicThreshold = sbpThreshold(age);
  const hrThreshold = heartRateThreshold(age);
  const rrThreshold = respiratoryRateThreshold(age);
  const baselineDrop =
    isAdult &&
    vitals.baselineSystolicBP !== undefined &&
    vitals.baselineSystolicBP > 0 &&
    vitals.systolicBP < vitals.baselineSystolicBP * 0.7;
  const hypotension = isAdult
    ? meanArterialPressure < 65 || vitals.systolicBP < 90 || baselineDrop
    : vitals.systolicBP < systolicThreshold;
  const tachycardia = vitals.heartRate > hrThreshold;
  const dyspnea = vitals.respiratoryRate > rrThreshold;
  const lowOxygenSaturation = vitals.spO2 < 92;
  const impacts: VitalImpact[] = [];

  if (hypotension) {
    impacts.push({
      system: "cardiovascular",
      subgrade: isAdult ? "moderate" : "severe",
      label: isAdult ? "Гипотензия у взрослого" : "Гипотензия у ребёнка",
    });
  }
  if (tachycardia) impacts.push({ system: "cardiovascular", subgrade: "light", label: "Тахикардия" });
  if (dyspnea) impacts.push({ system: "respiratory", subgrade: "light", label: "Учащённое дыхание" });
  if (lowOxygenSaturation) impacts.push({ system: "respiratory", subgrade: "moderate", label: "SpO₂ менее 92%" });
  if (vitals.gcs >= 13 && vitals.gcs <= 14) impacts.push({ system: "neurological", subgrade: "moderate", label: "GCS 13–14" });
  if (vitals.gcs < 13) impacts.push({ system: "neurological", subgrade: "severe", label: "GCS менее 13" });

  return {
    meanArterialPressure,
    hypotension,
    tachycardia,
    dyspnea,
    lowOxygenSaturation,
    impacts,
    guidance: {
      systolicBP: isAdult ? "Ориентир: САД ≥ 90, срАД ≥ 65" : `Ориентир: САД ≥ ${systolicThreshold}`,
      heartRate: `Тахикардия: ЧСС > ${hrThreshold}`,
      respiratoryRate: `Одышка: ЧД > ${rrThreshold}`,
      spO2: "Ориентир: 95%; умеренный признак при < 92%",
      gcs: "Норма: 15 баллов",
    },
  };
}
