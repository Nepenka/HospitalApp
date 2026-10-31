import type { TriState } from "../clinical/types.ts";
export type ExaminationStep = "patient" | "symptoms" | "vitals" | "result";
export type VitalsDraft = { ageYears: string; ageMonths: string; systolicBP: string; diastolicBP: string; baselineSystolicBP: string; spO2: string; heartRate: string; respiratoryRate: string; gcs: string };
/** Raw keyboard input remains text, including blanks; a draft is not a clinical conclusion. */
export interface ExaminationDraft { step: ExaminationStep; fullName: string; allergen: string; allergenContact: TriState; acuteOnset: TriState; reactionDate: string; reactionTime: string; physicianComment: string; selectedIds: string[]; selectedOptions: Record<string,string>; vitalsDraft: VitalsDraft }
