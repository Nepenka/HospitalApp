import { normalizeAnnotations } from "./annotations.ts";
import { resolveSymptom, SYMPTOM_CATALOG_VERSION } from "../clinical/symptom-catalog.ts";
import { CLINICAL_ALGORITHM_VERSION, evaluateAnaphylaxis } from "../clinical/diagnosis.ts";
import { calculateSeverity } from "../clinical/severity.ts";
import type { ExaminationInput } from "./types.ts";

function object(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function integer(value: unknown, min: number, max: number): boolean { return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max; }

/** Shared by offline preview and sync. Never accept a calculated result from the client. */
export function prepareExamination(raw: unknown) {
  if (!object(raw) || typeof raw.fullName !== "string" || typeof raw.probableAllergen !== "string") throw new Error("INVALID_INPUT");
  const fullName = raw.fullName.trim().replace(/\s+/g, " ");
  const probableAllergen = raw.probableAllergen.trim().replace(/\s+/g, " ");
  if (fullName.length < 3 || fullName.length > 200 || probableAllergen.length > 200) throw new Error("INVALID_INPUT");
  if (!["yes", "no", "unknown"].includes(String(raw.acuteOnset)) || !["yes", "no", "unknown"].includes(String(raw.allergenContact))) throw new Error("INVALID_INPUT");
  if (raw.allergenContact === "yes" && !probableAllergen) throw new Error("INVALID_INPUT");
  const annotations = normalizeAnnotations(raw);
  if (!annotations.ok) throw new Error("INVALID_INPUT");
  const v = raw.vitals;
  if (!object(v) || !object(v.age) || !integer(v.age.years, 0, 130) || !integer(v.age.months, 0, 11)
    || !integer(v.systolicBP, 1, 350) || !integer(v.diastolicBP, 1, 250) || Number(v.diastolicBP) > Number(v.systolicBP)
    || !integer(v.spO2, 1, 100) || !integer(v.heartRate, 1, 300) || !integer(v.respiratoryRate, 1, 150) || !integer(v.gcs, 3, 15)
    || (v.baselineSystolicBP !== undefined && !integer(v.baselineSystolicBP, 1, 350))) throw new Error("INVALID_INPUT");
  if (!Array.isArray(raw.selectedSymptoms) || raw.selectedSymptoms.length < 1 || raw.selectedSymptoms.length > 100) throw new Error("INVALID_INPUT");
  const selections = raw.selectedSymptoms.map((selection) => {
    if (!object(selection) || typeof selection.id !== "string" || (selection.optionId !== undefined && typeof selection.optionId !== "string")) throw new Error("INVALID_INPUT");
    return { id: selection.id, ...(selection.optionId ? { optionId: selection.optionId as string } : {}) };
  });
  const selectedSymptoms = [...new Map(selections.map((s) => [s.id, s])).values()].map((s) => resolveSymptom(s.id, s.optionId));
  if (selectedSymptoms.some((s) => !s)) throw new Error("INVALID_INPUT");
  const selected = selectedSymptoms.filter((s) => s !== null);
  const typed = raw as unknown as ExaminationInput;
  // Copy only allowed clinical fields, not arbitrary client properties.
  const vitals = { age: { years: typed.vitals.age.years, months: typed.vitals.age.months }, systolicBP: typed.vitals.systolicBP, diastolicBP: typed.vitals.diastolicBP, spO2: typed.vitals.spO2, heartRate: typed.vitals.heartRate, respiratoryRate: typed.vitals.respiratoryRate, gcs: typed.vitals.gcs, ...(typed.vitals.baselineSystolicBP !== undefined ? { baselineSystolicBP: typed.vitals.baselineSystolicBP } : {}) };
  const severity = calculateSeverity(selected, vitals);
  const conclusion = evaluateAnaphylaxis({ selected, vitals, severity, acuteOnset: typed.acuteOnset, allergenContact: typed.allergenContact });
  return { fullName, probableAllergen: probableAllergen || null, acuteOnset: typed.acuteOnset, allergenContact: typed.allergenContact, ...annotations.value, selectedSymptoms: selected, vitals, severity, conclusion, algorithmVersion: CLINICAL_ALGORITHM_VERSION, catalogVersion: SYMPTOM_CATALOG_VERSION };
}
