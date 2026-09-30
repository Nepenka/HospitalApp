import type { ClinicalSystem, DiagnosticCheck, SeverityResult, Subgrade, SymptomDefinition } from "@/domain/clinical/types";
import type { Locale } from "./config";

const systemEn: Record<ClinicalSystem, string> = { skin: "Skin", mucous: "Mucous membranes / angioedema", gastrointestinal: "Gastrointestinal", cardiovascular: "Cardiovascular", neurological: "Neurological", respiratory: "Respiratory" };
const subgradeEn: Record<Subgrade, string> = { none: "None", light: "Mild", moderate: "Moderate", severe: "Severe" };
const symptomEn: Record<string, string> = {
  "skin-urticaria":"Urticaria", "skin-erythema":"Erythema", "skin-itching":"Pruritus", "skin-discomfort":"Skin discomfort", "skin-tingling":"Generalized tingling", "skin-excoriation":"Excoriations", "skin-angioedema":"Angioedema outside mucous membranes",
  "mucous-conjunctivitis":"Conjunctivitis", "mucous-chemosis":"Chemosis", "mucous-eye-itch":"Sudden eye itching", "mucous-eyelid":"Eyelid edema", "mucous-tongue-protrusion":"Repeated tongue protrusion", "mucous-throat":"Throat discomfort, itching, soreness, pain or lump sensation", "mucous-oas":"Oral allergy syndrome: itching, tingling or metallic taste", "mucous-swallow":"Difficulty swallowing", "mucous-rubbing":"Repeated rubbing of lips, ears or eyes", "mucous-nasal":"Nasal congestion", "mucous-nose-itch":"Sudden nasal itching", "mucous-rhinorrhea":"Rhinorrhea", "mucous-sneeze":"Sneezing", "mucous-lips":"Lip edema", "mucous-salivation":"New or increased salivation", "mucous-tongue":"Edema of tongue, soft palate or uvula",
  "gi-nausea":"Nausea", "gi-regurgitation":"Regurgitation", "gi-infant":"Infants: hiccups, back arching, regurgitation", "gi-vomit":"Vomiting", "gi-diarrhea":"Diarrhea", "gi-pain":"Abdominal pain", "gi-vomit-diarrhea":"Vomiting and diarrhea, two episodes each",
  "cv-tachycardia":"Tachycardia", "cv-pallor":"Pallor", "cv-blurred-vision":"Blurred vision", "cv-weakness":"Weakness or lethargy", "cv-dizziness":"Dizziness", "cv-presyncope":"Presyncope", "cv-bradycardia":"Bradycardia", "cv-hypotension":"Hypotension", "cv-mottling":"Mottling", "cv-cyanosis":"Cyanosis", "cv-capillary":"Capillary refill over 3 seconds", "cv-collapse":"Collapse", "cv-arrest":"Cardiac arrest", "cv-shock":"Anaphylactic shock", "cv-severe-bradycardia":"Severe bradycardia",
  "neuro-confusion":"Confusion", "neuro-anxiety":"Anxiety or fear of death", "neuro-sleepy":"Somnolence or lethargy", "neuro-agitation":"Agitation, irritability or inconsolability", "neuro-infant":"Infant loss of interest in play or interaction and reduced activity", "neuro-seizure":"Seizure", "neuro-hypotonia":"Reduced muscle tone or limpness", "neuro-syncope":"Syncope", "neuro-incontinence-urine":"Urinary incontinence", "neuro-incontinence-fecal":"Fecal incontinence",
  "resp-inhale":"Difficulty breathing in", "resp-exhale":"Difficulty breathing out", "resp-tightness":"Chest tightness", "resp-throat":"Throat irritation or discomfort", "resp-dysphonia":"Dysphonia", "resp-barking":"Barking cough", "resp-dyspnea":"Dyspnea", "resp-cough":"Cough", "resp-stridor":"Stridor", "resp-wheeze":"Wheezing", "resp-grunting":"Grunting", "resp-work":"Use of accessory respiratory muscles", "resp-flaring":"Nasal flaring", "resp-spo2":"SaO₂ < 92%", "resp-failure":"Respiratory failure requiring O₂",
};
const optionEn: Record<string, string> = {
  "Локализованная (<50% ППТ)":"Localized (<50% BSA)", "Генерализованная (≥50% ППТ)":"Generalized (≥50% BSA)", "Периодический (<50% ППТ)":"Intermittent (<50% BSA)", "Локализованный (<50% ППТ)":"Localized (<50% BSA)", "Постоянный":"Persistent", "Генерализованный (≥50% ППТ)":"Generalized (≥50% BSA)",
  "Анатомические ориентиры сохранены":"Anatomical landmarks preserved", "Анатомические ориентиры сглажены":"Anatomical landmarks obscured", "Анатомические ориентиры не видны":"Anatomical landmarks not visible", "Эпизодичная":"Episodic", "Постоянная":"Persistent", "1–2 раза":"1–2 episodes", "Более 2-х раз":"More than 2 episodes", "Постоянная, сильная":"Persistent, severe", "Без ПРД":"Without increased work of breathing", "С ПРД":"With increased work of breathing", "«Немое лёгкое»":"Silent chest", "Вновь появившийся":"New onset", "Персистирующий":"Persistent", "Не требуется введение вазопрессоров":"No vasopressors required", "Требуется введение вазопрессоров":"Vasopressors required", "Любой вариант гипотензии у младенца":"Any hypotension in an infant",
};
const criterionEn: Record<string, string> = {
  "grade-4":"OAR grade 4–5", "grade-3-multisystem":"Grade 3 involving at least 2 systems", "isolated-hypotension":"Isolated hypotension", "respiratory":"Moderate or severe respiratory involvement",
  "niaid-1":"1. Acute onset + skin/mucosa + respiratory compromise or reduced BP/end-organ dysfunction", "niaid-2":"2. Likely allergen exposure + at least 2 clinical categories", "niaid-3":"3. Reduced BP after exposure to a known allergen",
  "wao-1":"1. Acute onset + skin/mucosa + respiratory compromise, reduced BP/end-organ dysfunction or severe GI symptoms", "wao-2":"2. Acute hypotension, bronchospasm or laryngeal involvement after likely allergen exposure",
};

export const clinicalSystemLabel = (locale: Locale, system: ClinicalSystem) => locale === "en" ? systemEn[system] : ({ skin:"Кожа", mucous:"Слизистые / АНО", gastrointestinal:"ЖКТ", cardiovascular:"Сердечно-сосудистая", neurological:"Неврологическая", respiratory:"Респираторная" } as Record<ClinicalSystem,string>)[system];
export const clinicalSubgradeLabel = (locale: Locale, value: Subgrade) => locale === "en" ? subgradeEn[value] : ({ none:"Нет", light:"Л", moderate:"У", severe:"Т" } as Record<Subgrade,string>)[value];
export const symptomLabel = (locale: Locale, symptom: Pick<SymptomDefinition,"id"|"name">) => locale === "en" ? symptomEn[symptom.id] ?? symptom.name : symptom.name;
export const optionLabel = (locale: Locale, label: string) => locale === "en" ? optionEn[label] ?? label : label;

export function severityReasonLabel(locale: Locale, reason: string): string {
  if (locale === "ru") return reason;
  const vital = reason.replace("Гипотензия у взрослого", "Adult hypotension").replace("Гипотензия у ребёнка", "Pediatric hypotension").replace("Тахикардия", "Tachycardia").replace("Учащённое дыхание", "Tachypnea").replace("SpO₂ менее 92%", "SpO₂ below 92%");
  if (vital !== reason) return vital;
  const systems: Record<string, string> = { "Кожа": "Skin", "Слизистые / АНО": "Mucous membranes / angioedema", "ЖКТ": "Gastrointestinal", "Сердечно-сосудистая": "Cardiovascular", "Неврологическая": "Neurological", "Респираторная": "Respiratory" };
  const grades: Record<string, string> = { "лёгкая": "mild", "умеренная": "moderate", "тяжёлая": "severe" };
  const match = reason.match(/^(.+): (лёгкая|умеренная|тяжёлая)$/);
  return match ? `${systems[match[1]] ?? match[1]}: ${grades[match[2]]}` : reason;
}

export function conclusionLabel(locale: Locale, severity: SeverityResult, confirmed: boolean): string {
  if (locale === "ru") {
    const name = severity.grade === 3 ? "анафилаксия лёгкой степени" : severity.grade === 4 ? "анафилаксия среднетяжёлой степени" : severity.grade === 5 ? "тяжёлая анафилаксия / анафилактический шок" : "анафилаксия";
    return confirmed ? `ОАР ${severity.grade} степени тяжести (${name})` : `ОАР ${severity.grade} степени тяжести`;
  }
  const name = severity.grade === 3 ? "mild anaphylaxis" : severity.grade === 4 ? "moderately severe anaphylaxis" : severity.grade === 5 ? "severe anaphylaxis / anaphylactic shock" : "anaphylaxis";
  return confirmed ? `Acute allergic reaction, grade ${severity.grade} (${name})` : `Acute allergic reaction, grade ${severity.grade}`;
}

export function diagnosticPresentation(locale: Locale, check: DiagnosticCheck): DiagnosticCheck {
  if (locale === "ru") return check;
  return { ...check, title: check.key === "primary" ? "AnaFix algorithm" : check.title, summary: check.status === "confirmed" ? "Criteria met" : check.status === "insufficient_data" ? "Insufficient data" : "Criteria not met", criteria: check.criteria.map((item) => ({ ...item, label: criterionEn[item.id] ?? item.label, details: translateDetails(item.details) })) };
}

function translateDetails(text: string): string {
  return text
    .replace(/^Рассчитана степень (\d+)$/, "Calculated grade $1")
    .replace(/^Активных систем: (\d+)$/, "Active systems: $1")
    .replace("Гипотензия выявлена", "Hypotension detected").replace("Гипотензия не выявлена", "Hypotension not detected")
    .replace(/^Субградация: none$/, "Severity: none").replace(/^Субградация: light$/, "Severity: mild").replace(/^Субградация: moderate$/, "Severity: moderate").replace(/^Субградация: severe$/, "Severity: severe")
    .replace("Не указано, было ли начало острым", "Acute onset was not specified").replace("Клиническое сочетание есть", "Required clinical combination is present").replace("Нет нужного сочетания", "Required combination is absent")
    .replace(/^Категорий: (\d+) из 4$/, "$1 of 4 categories")
    .replace("Возрастной критерий АД выполнен", "Age specific BP criterion met").replace("Возрастной критерий АД не выполнен", "Age specific BP criterion not met")
    .replace("Есть целевое респираторное/гемодинамическое проявление", "Target respiratory or hemodynamic sign is present").replace("Нет целевого проявления", "Target sign is absent");
}
