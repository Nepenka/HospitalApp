export const PHYSICIAN_COMMENT_MAX_LENGTH = 4000;

/** Format completed keyboard input only; never fill in missing minutes. */
export function normalizeReactionTimeDraft(value: string): string {
  const text = value.trim();
  const separated = /^(\d{1,2}):(\d{2})$/.exec(text);
  if (separated) return `${separated[1].padStart(2, "0")}:${separated[2]}`;
  if (/^\d{3,4}$/.test(text)) return `${text.slice(0, -2).padStart(2, "0")}:${text.slice(-2)}`;
  return text;
}

export function validReactionDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000")) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export type AnnotationError = "comment" | "date" | "time";
type Annotations = { physicianComment: string | null; reactionDate: string | null; reactionTime: string | null };
export function normalizeAnnotations(input: { physicianComment?: unknown; reactionDate?: unknown; reactionTime?: unknown }):
  { ok: true; value: Annotations } | { ok: false; error: AnnotationError } {
  if (input.physicianComment !== undefined && typeof input.physicianComment !== "string") return { ok: false, error: "comment" };
  if (input.reactionDate !== undefined && typeof input.reactionDate !== "string") return { ok: false, error: "date" };
  if (input.reactionTime !== undefined && typeof input.reactionTime !== "string") return { ok: false, error: "time" };
  const physicianComment = ((input.physicianComment as string | undefined) ?? "").trim();
  const reactionDate = ((input.reactionDate as string | undefined) ?? "").trim();
  const reactionTime = ((input.reactionTime as string | undefined) ?? "").trim();
  if (physicianComment.length > PHYSICIAN_COMMENT_MAX_LENGTH) return { ok: false, error: "comment" };
  if (reactionDate && !validReactionDate(reactionDate)) return { ok: false, error: "date" };
  if (reactionTime && (!reactionDate || !/^([01]\d|2[0-3]):[0-5]\d$/.test(reactionTime))) return { ok: false, error: "time" };
  return { ok: true, value: { physicianComment: physicianComment || null, reactionDate: reactionDate || null, reactionTime: reactionTime || null } };
}

export function annotationErrorMessage(error: AnnotationError, locale: "ru" | "en"): string {
  const messages = {
    comment: ["Комментарий врача должен быть текстом не длиннее 4000 символов.", "The physician comment must be text no longer than 4,000 characters."],
    date: ["Укажите корректную дату начала реакции или оставьте поле пустым.", "Enter a valid reaction onset date or leave the field blank."],
    time: ["Для времени реакции укажите дату и корректное время (чч:мм).", "To record reaction time, enter a date and a valid time (hh:mm)."],
  };
  return messages[error][locale === "en" ? 1 : 0];
}

export function reactionDateLabel(date: string | null | undefined, time: string | null | undefined, locale: "ru" | "en"): string {
  if (!date || !validReactionDate(date)) return locale === "en" ? "Not specified" : "Не указана";
  const [year, month, day] = date.split("-");
  const label = locale === "en" ? `${day}/${month}/${year}` : `${day}.${month}.${year}`;
  return time ? `${label}, ${time} (${locale === "en" ? "Minsk time" : "время Минска"})` : `${label} (${locale === "en" ? "time unknown" : "время неизвестно"})`;
}
