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
  selectedSymptoms: Array<{ id: string; optionId?: string }>;
  vitals: Vitals;
}

export interface StoredExamination {
  id: string;
  organizationId: string;
  patient: { id: string; fullName: string };
  probableAllergen: string | null;
  allergenContact: TriState;
  acuteOnset: TriState;
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
