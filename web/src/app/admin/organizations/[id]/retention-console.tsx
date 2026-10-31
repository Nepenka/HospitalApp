"use client";

import { useActionState } from "react";
import { updateRetentionAction, type RetentionActionState } from "../../actions";
import { useTranslations } from "@/i18n/provider";
import styles from "../../admin.module.css";

const initialState: RetentionActionState = {};

export function RetentionConsole({ organizationId, years }: { organizationId: string; years: number }) {
  const { locale } = useTranslations();
  const e = locale === "en";
  const [state, action, pending] = useActionState(updateRetentionAction, initialState);
  return <section className={styles.tableCard}>
    <div className={styles.tableHeader}><div><p>{e ? "Data policy" : "Политика данных"}</p><h2>{e ? "Deleted examination retention" : "Хранение удалённых осмотров"}</h2></div></div>
    <div className={styles.retentionBody}>
      <p>{e ? "Default: 5 calendar years from soft deletion. Active examinations are not covered. Change this setting only at the hospital's request." : "По умолчанию — 5 календарных лет с момента мягкого удаления. Активные осмотры под эту политику не попадают. Изменяйте срок по запросу больницы."}</p>
      <form action={action} className={styles.createForm}>
        <input type="hidden" name="organizationId" value={organizationId} />
        <label><span>{e ? "Retention period, years" : "Срок хранения, лет"}</span><input key={years} name="retentionYears" type="number" min="1" max="100" step="1" defaultValue={years} required disabled={pending} /></label>
        <button type="submit" disabled={pending}>{pending ? (e ? "Saving…" : "Сохранение…") : (e ? "Save retention policy" : "Сохранить политику")}</button>
        {state.error && <div className={styles.formError} role="alert">{state.error}</div>}
        {state.success && <div className={styles.formSuccess} role="status">{state.success}</div>}
      </form>
      <p className={styles.securityNote}>{e ? "Changing this setting does not delete records. Automatic permanent deletion is not enabled yet; a maintenance job must be connected before deployment. Backup retention must be configured separately." : "Изменение срока не удаляет записи. Автоматическое окончательное удаление пока не включено: перед внедрением нужно подключить регламентную задачу. Хранение резервных копий настраивается отдельно."}</p>
    </div>
  </section>;
}
