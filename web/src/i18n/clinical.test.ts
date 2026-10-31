import test from "node:test";
import assert from "node:assert/strict";
import {symptomCatalog} from "../domain/clinical/symptom-catalog.ts";
import {symptomLabel,optionLabel,clinicalSystemLabel,clinicalSubgradeLabel,diagnosticPresentation} from "./clinical.ts";
import {evaluateAnaphylaxis} from "../domain/clinical/diagnosis.ts";
import {calculateSeverity} from "../domain/clinical/severity.ts";
test("Every clinical catalogue symptom and option has an English label",()=>{
 for(const symptom of symptomCatalog){assert.doesNotMatch(symptomLabel("en",symptom),/[А-Яа-яЁё]/,symptom.id);assert.doesNotMatch(clinicalSystemLabel("en",symptom.system),/[А-Яа-яЁё]/);for(const option of symptom.options??[])assert.doesNotMatch(optionLabel("en",option.label),/[А-Яа-яЁё]/,option.label);}
 for(const value of ["none","light","moderate","severe"] as const)assert.doesNotMatch(clinicalSubgradeLabel("en",value),/[А-Яа-яЁё]/);
});
test("English diagnostic presentation translates every generated criterion and never changes decisions",()=>{
 const vitals={age:{years:18,months:0},systolicBP:120,diastolicBP:80,spO2:98,heartRate:80,respiratoryRate:18,gcs:15};
 for(const acuteOnset of ["yes","no","unknown"] as const)for(const allergenContact of ["yes","no","unknown"] as const){const selected=symptomCatalog.slice(0,1),severity=calculateSeverity(selected,vitals),conclusion=evaluateAnaphylaxis({selected,vitals,severity,acuteOnset,allergenContact});for(const check of [conclusion.primary,conclusion.niaid,conclusion.wao]){const english=diagnosticPresentation("en",check);assert.equal(english.status,check.status);assert.deepEqual(english.criteria.map(c=>c.met),check.criteria.map(c=>c.met));for(const item of english.criteria)assert.doesNotMatch(`${item.label} ${item.details}`,/[А-Яа-яЁё]/);}}
});
