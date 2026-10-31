"use client";
import { useActionState, type ReactNode } from "react";
import { manageAccessAction } from "@/app/administration-actions";
import { useTranslations } from "@/i18n/provider";
import styles from "./administration.module.css";

export function AccessControl({ label, target, operation, id, organizationId, accountId, children }: { label: string; target: string; operation: string; id: string; organizationId?: string; accountId?: string; children?: ReactNode }) {
  const [state, action, pending] = useActionState(manageAccessAction, {});
  const e = useTranslations().locale === "en";
  return <details className={styles.control}><summary>{label}</summary><form className={styles.form} action={action}>
    <input type="hidden" name="target" value={target} /><input type="hidden" name="operation" value={operation} /><input type="hidden" name="id" value={id} />
    <input type="hidden" name="organizationId" value={organizationId ?? ""} /><input type="hidden" name="accountId" value={accountId ?? ""} />
    {children}
    {operation !== "rename" && <label className={styles.check}><input type="checkbox" name="confirm" value="yes" required />{e ? "Confirm access change. Existing medical records remain intact." : "Подтверждаю изменение доступа. Медицинские записи сохраняются."}</label>}
    {state.error && <div role="alert" className={styles.error}>{state.error}</div>}{state.success && <div role="status" className={styles.success}>{state.success}</div>}
    <button className={styles.primary} type="submit" disabled={pending}>{pending ? (e ? "Saving…" : "Сохранение…") : (e ? "Apply" : "Применить")}</button>
  </form></details>;
}
