import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calculateSeverity, computeSubgrades } from "./severity.ts";
import { evaluateVitals } from "./vitals.ts";
import { evaluateAnaphylaxis } from "./diagnosis.ts";
import { resolveSymptom, symptomCatalog } from "./symptom-catalog.ts";
import type { SymptomDefinition, Vitals } from "./types.ts";

const normalVitals: Vitals = {
  age: { years: 18, months: 0 },
  systolicBP: 120,
  diastolicBP: 80,
  spO2: 95,
  heartRate: 80,
  respiratoryRate: 16,
  gcs: 15,
};

const symptom = (
  system: SymptomDefinition["system"],
  subgrade: SymptomDefinition["subgrade"],
  id: string,
): SymptomDefinition => ({ id, name: id, system, subgrade });

describe("официальная матрица степени ОАР", () => {
  it("даёт степень 1 для одного лёгкого non-critical признака", () => {
    assert.equal(calculateSeverity([symptom("skin", "light", "one")], normalVitals).grade, 1);
  });

  it("повышает два лёгких признака одной non-critical системы до У и степени 2", () => {
    const selected = [symptom("skin", "light", "one"), symptom("skin", "light", "two")];
    assert.equal(computeSubgrades(selected).skin, "moderate");
    assert.equal(calculateSeverity(selected, normalVitals).grade, 2);
  });

  it("даёт степень 2 для любой умеренной non-critical системы", () => {
    assert.equal(calculateSeverity([symptom("gastrointestinal", "moderate", "one")], normalVitals).grade, 2);
  });

  it("маппит critical Л/У/Т в степени 3/4/5", () => {
    assert.equal(calculateSeverity([symptom("respiratory", "light", "l")], normalVitals).grade, 3);
    assert.equal(calculateSeverity([symptom("respiratory", "moderate", "u")], normalVitals).grade, 4);
    assert.equal(calculateSeverity([symptom("respiratory", "severe", "t")], normalVitals).grade, 5);
  });

  it("даёт степень 4 для тяжёлой реакции слизистых/АНО", () => {
    assert.equal(calculateSeverity([symptom("mucous", "severe", "one")], normalVitals).grade, 4);
  });
});

describe("граничные значения витальных показателей", () => {
  it("не срабатывает на границе и срабатывает за границей", () => {
    assert.equal(evaluateVitals({ ...normalVitals, heartRate: 100, respiratoryRate: 20, spO2: 92 }).tachycardia, false);
    const triggered = evaluateVitals({ ...normalVitals, heartRate: 101, respiratoryRate: 21, spO2: 91 });
    assert.equal(triggered.tachycardia, true);
    assert.equal(triggered.dyspnea, true);
    assert.equal(triggered.lowOxygenSaturation, true);
  });

  it("детская гипотензия автоматически даёт critical Т и степень 5", () => {
    const child = { ...normalVitals, age: { years: 1, months: 0 }, systolicBP: 71 };
    assert.equal(evaluateVitals(child).hypotension, true);
    assert.equal(calculateSeverity([symptom("skin", "light", "one")], child).grade, 5);
  });

  it("SpO2 91 автоматически даёт respiratory У и степень 4", () => {
    assert.equal(calculateSeverity([symptom("skin", "light", "one")], { ...normalVitals, spO2: 91 }).grade, 4);
  });

  it("GCS 14 даёт У, а 12 — Т", () => {
    assert.equal(calculateSeverity([symptom("skin", "light", "one")], { ...normalVitals, gcs: 14 }).grade, 4);
    assert.equal(calculateSeverity([symptom("skin", "light", "one")], { ...normalVitals, gcs: 12 }).grade, 5);
  });
});

function diagnose(
  selected: SymptomDefinition[],
  options: { vitals?: Vitals; acuteOnset?: "yes" | "no" | "unknown"; allergenContact?: "yes" | "no" | "unknown" } = {},
) {
  const vitals = options.vitals ?? normalVitals;
  return evaluateAnaphylaxis({
    selected,
    vitals,
    severity: calculateSeverity(selected, vitals),
    acuteOnset: options.acuteOnset ?? "yes",
    allergenContact: options.allergenContact ?? "unknown",
  });
}

describe("диагностические критерии анафилаксии", () => {
  it("подтверждает NIAID 1 при остром начале, крапивнице и дыхательных симптомах", () => {
    const result = diagnose([
      symptom("skin", "light", "skin-urticaria"),
      symptom("respiratory", "light", "resp-dyspnea"),
    ]);
    assert.equal(result.niaid.status, "confirmed");
    assert.equal(result.niaid.criteria[0].met, true);
  });

  it("не подменяет неизвестное острое начало положительным", () => {
    const result = diagnose([
      symptom("skin", "light", "skin-urticaria"),
      symptom("respiratory", "light", "resp-dyspnea"),
    ], { acuteOnset: "unknown", allergenContact: "no" });
    assert.equal(result.niaid.status, "insufficient_data");
  });

  it("подтверждает NIAID 2 при аллергене и двух категориях", () => {
    const result = diagnose([
      symptom("skin", "light", "skin-urticaria"),
      symptom("respiratory", "light", "resp-dyspnea"),
    ], { acuteOnset: "no", allergenContact: "yes" });
    assert.equal(result.niaid.criteria[1].met, true);
  });

  it("не считает лёгкую тошноту персистирующим ЖКТ-симптомом", () => {
    const result = diagnose([
      symptom("skin", "light", "skin-urticaria"),
      symptom("gastrointestinal", "light", "gi-nausea-light"),
    ], { acuteOnset: "no", allergenContact: "yes" });
    assert.equal(result.niaid.criteria[1].met, false);
  });

  it("не подменяет любые симптомы системы целевыми признаками критерия", () => {
    const result = diagnose([
      symptom("mucous", "light", "mucous-nasal"),
      symptom("respiratory", "light", "resp-new-cough"),
    ]);
    assert.equal(result.niaid.criteria[0].met, false);
    assert.equal(result.wao.criteria[0].met, false);
  });

  it("подтверждает WAO 1 при кожных и тяжёлых ЖКТ-проявлениях", () => {
    const result = diagnose([
      symptom("skin", "light", "skin-urticaria"),
      symptom("gastrointestinal", "moderate", "gi-vomit"),
    ]);
    assert.equal(result.wao.criteria[0].met, true);
  });

  it("подтверждает WAO 2 при аллергене и стридоре без кожных проявлений", () => {
    const result = diagnose([
      symptom("respiratory", "moderate", "resp-stridor"),
    ], { allergenContact: "yes" });
    assert.equal(result.wao.criteria[1].met, true);
  });

  it("подтверждает NIAID 3 по возрастному порогу давления", () => {
    const childVitals = { ...normalVitals, age: { years: 5, months: 0 }, systolicBP: 79 };
    const result = diagnose([], { vitals: childVitals, allergenContact: "yes" });
    assert.equal(result.niaid.criteria[2].met, true);
  });
});

describe("каталог Symptom.swift и варианты SymptomsViewController", () => {
  it("содержит все уникальные Swift-симптомы и утверждённые Кашель/Стридор", () => {
    assert.equal(symptomCatalog.length, 70);
    assert.equal(new Set(symptomCatalog.map((item) => item.id)).size, 70);
    for (const name of ["Повторяющееся высовывание языка", "Рвота и диарея по 2 эпизода каждые", "Выраженная брадикардия", "Кряхтение/хрюканье", "Кашель", "Стридор"]) {
      assert.equal(symptomCatalog.some((item) => item.name === name), true, name);
    }
  });

  it("реализует все 12 dropdown-групп из SymptomsViewController", () => {
    const dropdowns = symptomCatalog.filter((item) => item.options?.length);
    assert.equal(dropdowns.length, 12);
    assert.deepEqual(dropdowns.map((item) => item.name), ["Крапивница", "Эритема", "Зуд", "Отёк языка, мягкого нёба, язычка", "Тошнота", "Рвота", "Диарея", "Боль в животе", "Гипотензия", "Одышка", "Кашель", "Стридор"]);
  });

  it("подставляет выбранную субградацию и сохраняет название варианта", () => {
    const selected = resolveSymptom("resp-dyspnea", "silent-lung");
    assert.equal(selected?.subgrade, "severe");
    assert.equal(selected?.selectedOptionLabel, "«Немое лёгкое»");
    assert.equal(resolveSymptom("resp-dyspnea"), null);
    assert.equal(resolveSymptom("skin-discomfort", "unknown"), null);
  });
});
