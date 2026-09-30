export const systems = [
  "skin",
  "mucous",
  "gastrointestinal",
  "cardiovascular",
  "neurological",
  "respiratory",
] as const;

export const resultSystems = [
  "cardiovascular",
  "neurological",
  "respiratory",
  "skin",
  "mucous",
  "gastrointestinal",
] as const;

export type ClinicalSystem = (typeof systems)[number];
export type Subgrade = "none" | "light" | "moderate" | "severe";

export interface SymptomOptionDefinition {
  id: string;
  label: string;
  subgrade: Exclude<Subgrade, "none">;
}

export interface SymptomDefinition {
  id: string;
  name: string;
  system: ClinicalSystem;
  subgrade: Exclude<Subgrade, "none">;
  options?: readonly SymptomOptionDefinition[];
  selectedOptionId?: string;
  selectedOptionLabel?: string;
}

export interface PatientAge {
  years: number;
  months: number;
}

export interface Vitals {
  age: PatientAge;
  baselineSystolicBP?: number;
  systolicBP: number;
  diastolicBP: number;
  spO2: number;
  heartRate: number;
  respiratoryRate: number;
  gcs: number;
}

export interface VitalImpact {
  system: ClinicalSystem;
  subgrade: Exclude<Subgrade, "none">;
  label: string;
}

export interface VitalSummary {
  meanArterialPressure: number;
  hypotension: boolean;
  tachycardia: boolean;
  dyspnea: boolean;
  lowOxygenSaturation: boolean;
  impacts: VitalImpact[];
  guidance: {
    systolicBP: string;
    heartRate: string;
    respiratoryRate: string;
    spO2: string;
    gcs: string;
  };
}

export interface SeverityResult {
  grade: 0 | 1 | 2 | 3 | 4 | 5;
  perSystem: Record<ClinicalSystem, Subgrade>;
  vitalSummary: VitalSummary;
  reasons: string[];
}

export type TriState = "yes" | "no" | "unknown";
export type DiagnosisStatus = "confirmed" | "not_confirmed" | "insufficient_data";

export interface DiagnosticCriterion {
  id: string;
  label: string;
  met: boolean;
  details: string;
}

export interface DiagnosticCheck {
  key: "primary" | "niaid_faan_2006" | "wao_2020";
  title: string;
  status: DiagnosisStatus;
  summary: string;
  criteria: DiagnosticCriterion[];
}

export interface ClinicalConclusion {
  primary: DiagnosticCheck;
  niaid: DiagnosticCheck;
  wao: DiagnosticCheck;
  anyConfirmed: boolean;
  text: string;
}

export const systemLabels: Record<ClinicalSystem, string> = {
  skin: "Кожа",
  mucous: "Слизистые / АНО",
  gastrointestinal: "ЖКТ",
  cardiovascular: "Сердечно-сосудистая",
  neurological: "Неврологическая",
  respiratory: "Респираторная",
};

export const subgradeLabels: Record<Subgrade, string> = {
  none: "Нет",
  light: "Л",
  moderate: "У",
  severe: "Т",
};
