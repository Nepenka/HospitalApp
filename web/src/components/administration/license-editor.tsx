"use client";
import { useActionState, useState } from "react";
import { updateLicenseAction } from "@/app/administration-actions";
import { useTranslations } from "@/i18n/provider";
import type { OrganizationLicense } from "@/domain/administration/license";
import styles from "./administration.module.css";
import { DateRangePicker } from "@/app/history/date-range-picker";
export function LicenseEditor({ organizationId, license }: { organizationId: string; license: OrganizationLicense }) {
  const [state, action, pending] = useActionState(updateLicenseAction, {});
  const { locale } = useTranslations(); const e = locale === "en";
  const [startsOn, setStartsOn] = useState(license.startsOn ?? "");
  const [endsOn, setEndsOn] = useState(license.endsOn ?? "");
  return <article className={styles.card}><h2>{e ? "License and offline settings" : "Лицензия и offline-настройки"}</h2><p>{e ? "Leave unknown values blank. Expiration restricts clinicians, not the hospital administrator. License changes never delete records or create payments." : "Неизвестные значения оставляйте пустыми. Истечение срока ограничивает врачей, но не кабинет администратора больницы. Изменения не удаляют записи и не создают платежи."}</p><form action={action} className={styles.form}>
    <input type="hidden" name="organizationId" value={organizationId} />
    <input type="hidden" name="startsOn" value={startsOn} /><input type="hidden" name="endsOn" value={endsOn} />
    <DateRangePicker mode="single" value={startsOn} onChange={setStartsOn} locale={locale} label={e ? "Start date" : "Начало лицензии"} />
    <DateRangePicker mode="single" value={endsOn} onChange={setEndsOn} locale={locale} label={e ? "End date (inclusive)" : "Окончание (включительно)"} />
    <label>{e ? "Active clinician limit" : "Лимит активных врачей"}<input name="maxClinicians" inputMode="numeric" defaultValue={license.maxClinicians ?? ""} placeholder={e ? "Not configured" : "Не задан"} /></label>
    <label>{e ? "Agreed price" : "Согласованная стоимость"}<input name="price" inputMode="decimal" defaultValue={license.priceMinor === null ? "" : (license.priceMinor / 100).toFixed(2)} /></label>
    <label>{e ? "Currency" : "Валюта"}<select name="currency" defaultValue={license.currency ?? "BYN"}><option>BYN</option><option>USD</option><option>RUB</option></select></label>
    <label>{e ? "Offline access duration, hours" : "Срок offline-доступа, часы"}<input name="offlineHours" inputMode="numeric" defaultValue={license.offlineHours ?? ""} placeholder="1–168" /></label>
    <label className={`${styles.check} ${styles.wide}`}><input name="offlineAllowed" type="checkbox" defaultChecked={license.offlineAllowed} />{e ? "Allow offline access on hospital computers after duration approval" : "Разрешить offline на компьютерах больницы после согласования срока"}</label>
    <label className={styles.wide}>{e ? "Change reason (no patient information)" : "Причина изменения (без данных пациентов)"}<input name="reason" required minLength={3} maxLength={200} /></label>
    {state.error && <div className={`${styles.error} ${styles.wide}`} role="alert">{state.error}</div>}{state.success && <div className={`${styles.success} ${styles.wide}`} role="status">{state.success}</div>}
    <button className={`${styles.primary} ${styles.wide}`} disabled={pending}>{pending ? (e ? "Saving…" : "Сохранение…") : (e ? "Save license" : "Сохранить лицензию")}</button>
  </form></article>;
}
