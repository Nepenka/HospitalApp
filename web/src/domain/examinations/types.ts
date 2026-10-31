import type {
  ClinicalConclusion,
  SeverityResult,
  SymptomDefinition,
  TriState,
  Vitals,
} from "../clinical/types.ts";

export interface ExaminationInput {
  fullName: string;
  probableAllergen: string;
  allergenContact: TriState;
  acuteOnset: TriState;
  physicianComment?: string;
  reactionDate?: string;
  reactionTime?: string;
  selectedSymptoms: Array<{ id: string; optionId?: string }>;
  vitals: Vitals;
}

export interface StoredExamination {
  /** Explicit clinician marking only. Legacy records default to real records. */
  isTest?: boolean;
  id: string;
  organizationId: string;
  patient: { id: string; fullName: string };
  probableAllergen: string | null;
  allergenContact: TriState;
  acuteOnset: TriState;
  physicianComment: string | null;
  /** Known local date/time, Europe/Minsk; absent time does not imply midnight. */
  reactionDate: string | null;
  reactionTime: string | null;
  examinedAt: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  rowVersion: number;
  deletedAt: string | null;
  deletedBy: string | null;
  algorithmVersion: string;
  catalogVersion: string;
  selectedSymptoms: SymptomDefinition[];
  vitals: Vitals;
  severity: SeverityResult;
  conclusion: ClinicalConclusion;
}

export interface ExaminationSummary {
  id: string;
  patientName: string;
  examinedAt: string;
  probableAllergen: string | null;
  severityGrade: number;
  diagnosis: string;
  anaphylaxisConfirmed: boolean;
}
