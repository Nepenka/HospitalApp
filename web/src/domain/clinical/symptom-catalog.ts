import type { ClinicalSystem, Subgrade, SymptomDefinition, SymptomOptionDefinition } from "./types.ts";

export const SYMPTOM_CATALOG_VERSION = "symptom-swift-79dbb34ddd3e-client-delta-2026.06.30";

type Grade = Exclude<Subgrade, "none">;
type RawOption = readonly [id: string, label: string, subgrade: Grade];
const options = (items: readonly RawOption[]): SymptomOptionDefinition[] => items.map(([id, label, subgrade]) => ({ id, label, subgrade }));
const symptom = (id: string, name: string, system: ClinicalSystem, subgrade: Grade, variants?: readonly RawOption[]): SymptomDefinition => ({ id, name, system, subgrade, ...(variants ? { options: options(variants) } : {}) });

export const symptomCatalog: SymptomDefinition[] = [
  symptom("skin-urticaria", "Крапивница", "skin", "light", [["localized", "Локализованная (<50% ППТ)", "light"], ["generalized", "Генерализованная (≥50% ППТ)", "moderate"]]),
  symptom("skin-erythema", "Эритема", "skin", "light", [["localized", "Локализованная (<50% ППТ)", "light"], ["generalized", "Генерализованная (≥50% ППТ)", "moderate"]]),
  symptom("skin-itching", "Зуд", "skin", "light", [["periodic", "Периодически (<50% ППТ)", "light"], ["localized", "Локализованный (<50% ППТ)", "light"], ["constant", "Постоянный", "moderate"], ["generalized", "Генерализованный (≥50% ППТ)", "moderate"]]),
  symptom("skin-discomfort", "Дискомфорт кожи", "skin", "light"),
  symptom("skin-tingling", "Генерализованное чувство покалывания", "skin", "light"),
  symptom("skin-excoriation", "Экскориации", "skin", "light"),
  symptom("skin-angioedema", "АНО вне слизистых", "skin", "moderate"),

  symptom("mucous-conjunctivitis", "Конъюнктивит", "mucous", "light"),
  symptom("mucous-chemosis", "Хемоз", "mucous", "light"),
  symptom("mucous-eye-itch", "Внезапный зуд глаз", "mucous", "light"),
  symptom("mucous-eyelid", "Отёк век", "mucous", "light"),
  symptom("mucous-tongue-protrusion", "Повторяющееся высовывание языка", "mucous", "light"),
  symptom("mucous-throat", "Дискомфорт, зуд, першение, боль или «ком» в горле", "mucous", "light"),
  symptom("mucous-oas", "ОАС: зуд, покалывание, металлический привкус во рту", "mucous", "light"),
  symptom("mucous-swallow", "Нарушение глотания", "mucous", "light"),
  symptom("mucous-rubbing", "Повторяющееся потирание губ, ушей, глаз", "mucous", "light"),
  symptom("mucous-nasal", "Заложенность носа", "mucous", "light"),
  symptom("mucous-nose-itch", "Внезапный зуд носа", "mucous", "light"),
  symptom("mucous-rhinorrhea", "Ринорея", "mucous", "light"),
  symptom("mucous-sneeze", "Чихание", "mucous", "light"),
  symptom("mucous-lips", "Отёк губ", "mucous", "moderate"),
  symptom("mucous-salivation", "Появление или усиление слюнотечения", "mucous", "moderate"),
  symptom("mucous-tongue", "Отёк языка, мягкого нёба, язычка", "mucous", "severe", [["landmarks-preserved", "Анатомические ориентиры сохранены", "light"], ["landmarks-smoothed", "Анатомические ориентиры сглажены", "moderate"], ["landmarks-invisible", "Анатомические ориентиры не видны", "severe"]]),

  symptom("gi-nausea", "Тошнота", "gastrointestinal", "light", [["episodic", "Эпизодичная", "light"], ["constant", "Постоянная", "moderate"]]),
  symptom("gi-regurgitation", "Отхаркивание", "gastrointestinal", "light"),
  symptom("gi-infant", "Младенцы — икота, выгибание спины, отхаркивание", "gastrointestinal", "light"),
  symptom("gi-vomit", "Рвота", "gastrointestinal", "moderate", [["one-two", "1–2 раза", "light"], ["more-two", "Более 2-х раз", "moderate"]]),
  symptom("gi-diarrhea", "Диарея", "gastrointestinal", "moderate", [["one-two", "1–2 раза", "light"], ["more-two", "Более 2-х раз", "moderate"]]),
  symptom("gi-pain", "Боль в животе", "gastrointestinal", "moderate", [["episodic", "Эпизодичная", "light"], ["constant-severe", "Постоянная, сильная", "moderate"]]),
  symptom("gi-vomit-diarrhea", "Рвота и диарея по 2 эпизода каждые", "gastrointestinal", "moderate"),

  symptom("cv-tachycardia", "Тахикардия", "cardiovascular", "light"),
  symptom("cv-pallor", "Бледность", "cardiovascular", "light"),
  symptom("cv-blurred-vision", "Нечёткость зрения", "cardiovascular", "light"),
  symptom("cv-weakness", "Слабость, вялость", "cardiovascular", "light"),
  symptom("cv-dizziness", "Головокружение", "cardiovascular", "light"),
  symptom("cv-presyncope", "Предобморочное состояние", "cardiovascular", "light"),
  symptom("cv-bradycardia", "Брадикардия", "cardiovascular", "moderate"),
  symptom("cv-hypotension", "Гипотензия", "cardiovascular", "moderate", [["no-vasopressors", "Не требуется введение вазопрессоров", "moderate"], ["vasopressors", "Требуется введение вазопрессоров", "severe"], ["infant", "Любой вариант гипотензии у младенца", "severe"]]),
  symptom("cv-mottling", "Мраморность", "cardiovascular", "moderate"),
  symptom("cv-cyanosis", "Цианоз", "cardiovascular", "moderate"),
  symptom("cv-capillary", "Симптом бледного пятна более 3 сек", "cardiovascular", "moderate"),
  symptom("cv-collapse", "Коллапс", "cardiovascular", "severe"),
  symptom("cv-arrest", "Остановка сердца", "cardiovascular", "severe"),
  symptom("cv-shock", "Анафилактический шок", "cardiovascular", "severe"),
  symptom("cv-severe-bradycardia", "Выраженная брадикардия", "cardiovascular", "severe"),

  symptom("neuro-confusion", "Спутанность сознания", "neurological", "light"),
  symptom("neuro-anxiety", "Чувство тревоги, страх смерти", "neurological", "light"),
  symptom("neuro-sleepy", "Сонливость/летаргия", "neurological", "light"),
  symptom("neuro-agitation", "Возбуждение, раздражительность, безутешность", "neurological", "light"),
  symptom("neuro-infant", "Потеря интереса к игре, общению, снижение активности у младенца", "neurological", "moderate"),
  symptom("neuro-seizure", "Судороги", "neurological", "severe"),
  symptom("neuro-hypotonia", "Снижение мышечного тонуса, «обмякание»", "neurological", "severe"),
  symptom("neuro-syncope", "Обморок", "neurological", "severe"),
  symptom("neuro-incontinence-urine", "Недержание мочи", "neurological", "severe"),
  symptom("neuro-incontinence-fecal", "Недержание кала", "neurological", "severe"),

  symptom("resp-inhale", "Чувство затруднения вдоха", "respiratory", "light"),
  symptom("resp-exhale", "Чувство затруднения выдоха", "respiratory", "light"),
  symptom("resp-tightness", "Чувство стеснения в груди", "respiratory", "light"),
  symptom("resp-throat", "Першение в горле или дискомфорт", "respiratory", "light"),
  symptom("resp-dysphonia", "Дисфония", "respiratory", "light"),
  symptom("resp-barking", "Лающий кашель", "respiratory", "light"),
  symptom("resp-dyspnea", "Одышка", "respiratory", "light", [["no-prd", "Без ПРД", "light"], ["with-prd", "С ПРД", "moderate"], ["silent-lung", "«Немое лёгкое»", "severe"]]),
  symptom("resp-cough", "Кашель", "respiratory", "light", [["new", "Вновь появившийся", "light"], ["persistent", "Персистирующий", "moderate"]]),
  symptom("resp-stridor", "Стридор", "respiratory", "moderate", [["no-prd", "Без ПРД", "moderate"], ["with-prd", "С ПРД", "severe"]]),
  symptom("resp-wheeze", "Свистящее дыхание", "respiratory", "moderate"),
  symptom("resp-grunting", "Кряхтение/хрюканье", "respiratory", "moderate"),
  symptom("resp-work", "Работа вспомогательной мускулатуры", "respiratory", "moderate"),
  symptom("resp-flaring", "Раздувание крыльев носа", "respiratory", "moderate"),
  symptom("resp-spo2", "SaO₂ < 92%", "respiratory", "moderate"),
  symptom("resp-failure", "ДН (дотация O₂)", "respiratory", "severe"),
];

export function resolveSymptom(id: string, optionId?: string): SymptomDefinition | null {
  const definition = symptomCatalog.find((item) => item.id === id);
  if (!definition) return null;
  if (!definition.options?.length) return optionId ? null : { id: definition.id, name: definition.name, system: definition.system, subgrade: definition.subgrade };
  const selected = definition.options.find((item) => item.id === optionId);
  if (!selected) return null;
  return { id: definition.id, name: definition.name, system: definition.system, subgrade: selected.subgrade, selectedOptionId: selected.id, selectedOptionLabel: selected.label };
}

const legacySelections: Record<string, { id: string; optionId: string }> = {
  "gi-nausea-light": { id: "gi-nausea", optionId: "episodic" },
  "gi-vomit-light": { id: "gi-vomit", optionId: "one-two" },
  "gi-diarrhea-light": { id: "gi-diarrhea", optionId: "one-two" },
  "gi-pain-light": { id: "gi-pain", optionId: "episodic" },
  "resp-new-cough": { id: "resp-cough", optionId: "new" },
  "resp-persistent": { id: "resp-cough", optionId: "persistent" },
  "resp-stridor-prd": { id: "resp-stridor", optionId: "with-prd" },
  "resp-silent": { id: "resp-dyspnea", optionId: "silent-lung" },
};

export function selectionFromStoredSymptom(stored: SymptomDefinition): { id: string; optionId?: string } | null {
  const legacy = legacySelections[stored.id];
  if (legacy) return legacy;
  const definition = symptomCatalog.find((item) => item.id === stored.id);
  if (!definition) return null;
  if (!definition.options?.length) return { id: definition.id };
  const selected = definition.options.find((item) => item.id === stored.selectedOptionId)
    ?? definition.options.find((item) => item.subgrade === stored.subgrade);
  return selected ? { id: definition.id, optionId: selected.id } : null;
}
