import { evaluateVitals } from "./vitals.ts";
import {
  systems,
  systemLabels,
  type ClinicalSystem,
  type SeverityResult,
  type Subgrade,
  type SymptomDefinition,
  type Vitals,
} from "./types.ts";

const rank: Record<Subgrade, number> = { none: 0, light: 1, moderate: 2, severe: 3 };
const nonCritical: ClinicalSystem[] = ["skin", "gastrointestinal", "mucous"];
const critical: ClinicalSystem[] = ["cardiovascular", "neurological", "respiratory"];

export function computeSubgrades(selected: SymptomDefinition[]): Record<ClinicalSystem, Subgrade> {
  const result = Object.fromEntries(systems.map((system) => [system, "none"])) as Record<ClinicalSystem, Subgrade>;

  for (const system of systems) {
    const symptoms = selected.filter((symptom) => symptom.system === system);
    if (symptoms.some((symptom) => symptom.subgrade === "severe")) result[system] = "severe";
    else if (symptoms.some((symptom) => symptom.subgrade === "moderate")) result[system] = "moderate";
    else if (symptoms.length > 0) {
      result[system] = nonCritical.includes(system) && symptoms.length >= 2 ? "moderate" : "light";
    }
  }
  return result;
}

export function calculateSeverity(selected: SymptomDefinition[], vitals: Vitals): SeverityResult {
  const perSystem = computeSubgrades(selected);
  const vitalSummary = evaluateVitals(vitals);
  const reasons: string[] = [];

  for (const impact of vitalSummary.impacts) {
    if (rank[impact.subgrade] > rank[perSystem[impact.system]]) {
      perSystem[impact.system] = impact.subgrade;
    }
    reasons.push(impact.label);
  }

  let grade: SeverityResult["grade"] = 0;
  if (critical.some((system) => perSystem[system] === "severe")) grade = 5;
  else if (critical.some((system) => perSystem[system] === "moderate") || perSystem.mucous === "severe") grade = 4;
  else if (critical.some((system) => perSystem[system] === "light")) grade = 3;
  else if (nonCritical.some((system) => perSystem[system] === "moderate")) grade = 2;
  else if (nonCritical.filter((system) => perSystem[system] === "light").length >= 2) grade = 2;
  else if (nonCritical.some((system) => perSystem[system] === "light")) grade = 1;

  const displaySubgrade: Record<Subgrade, string> = { none: "нет", light: "лёгкая", moderate: "умеренная", severe: "тяжёлая" };
  for (const system of systems) {
    if (perSystem[system] !== "none") reasons.push(`${systemLabels[system]}: ${displaySubgrade[perSystem[system]]}`);
  }

  return { grade, perSystem, vitalSummary, reasons };
}
