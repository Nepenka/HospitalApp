"use client";

import { useId, useState, useTransition } from "react";
import { updatePhysicianComment, type CommentUpdateResult } from "@/app/examinations/actions";
import { PHYSICIAN_COMMENT_MAX_LENGTH } from "@/domain/examinations/annotations";
import { useTranslations } from "@/i18n/provider";
import styles from "../history.module.css";

export function PhysicianCommentEditor({ examinationId, physicianComment, rowVersion }: { examinationId: string; physicianComment: string | null; rowVersion: number }) {
  const { locale, t } = useTranslations();
  const m = (ru: string, en: string) => locale === "en" ? en : ru;
  const fieldId = useId();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [expectedVersion, setExpectedVersion] = useState(rowVersion);
  const [result, setResult] = useState<CommentUpdateResult | null>(null);
  const [pending, startTransition] = useTransition();
  const snapshot = result?.ok && result.rowVersion > rowVersion ? result : { physicianComment, rowVersion };
  function startEditing() {
    setDraft(snapshot.physicianComment ?? "");
    setExpectedVersion(snapshot.rowVersion);
    setResult(null);
    setEditing(true);
  }
  function save() {
    if (pending) return;
    startTransition(async () => {
      try {
        const response = await updatePhysicianComment({ examinationId, expectedVersion, physicianComment: draft });
        setResult(response);
        if (response.ok) setEditing(false);
      } catch {
        setResult({ ok: false, message: m("Не удалось сохранить комментарий. Проверьте подключение и вход в систему. Ваш текст оставлен в поле.", "Could not save the comment. Check your connection and sign-in. Your text remains in the field.") });
      }
    });
  }
  return <div className={styles.commentEditor} data-physician-comment-editor>
    <div className={styles.commentHeading}><h2>{t("Комментарий/уточнение врача")}</h2>{!editing && <button className={styles.secondaryLink} type="button" onClick={startEditing}>{m("Редактировать комментарий", "Edit comment")}</button>}</div>
    <p className={styles.physicianComment} data-editing={editing}>{snapshot.physicianComment ?? t("Не указано")}</p>
    <small className={styles.commentHint}>{t("Необязательно. Не изменяет рассчитанное заключение.")}</small>
    {editing && <form className={styles.commentForm} onSubmit={(event) => { event.preventDefault(); save(); }} aria-busy={pending}>
      <label className="srOnly" htmlFor={fieldId}>{t("Комментарий/уточнение врача")}</label>
      <textarea id={fieldId} autoFocus rows={5} value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={PHYSICIAN_COMMENT_MAX_LENGTH} disabled={pending} aria-describedby={`${fieldId}-hint`} />
      <small id={`${fieldId}-hint`}>{draft.length} / {PHYSICIAN_COMMENT_MAX_LENGTH} · {m("Чтобы удалить комментарий, очистите поле и сохраните.", "To remove the comment, clear the field and save.")}</small>
      <div className={styles.commentActions}><button className={styles.primaryLink} type="submit" disabled={pending}>{m(pending ? "Сохранение…" : "Сохранить комментарий", pending ? "Saving…" : "Save comment")}</button><button className={styles.secondaryLink} type="button" disabled={pending} onClick={() => { setEditing(false); setResult(null); }}>{t("Отмена")}</button></div>
    </form>}
    {result && <div className={result.ok ? styles.successNotice : styles.errorNotice} role={result.ok ? "status" : "alert"}>{result.message}{!result.ok && result.conflict && <a className={styles.commentConflictLink} href={`/history/${examinationId}`} target="_blank" rel="noopener noreferrer">{m("Открыть актуальную запись ↗", "Open current record ↗")}</a>}</div>}
  </div>;
}
