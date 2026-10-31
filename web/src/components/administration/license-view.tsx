import type { Locale } from "@/i18n/config";
import { licenseState, type OrganizationLicense } from "@/domain/administration/license";
import styles from "./administration.module.css";
export function LicenseView({ license, locale }: { license: OrganizationLicense; locale: Locale }) {
  const e = locale === "en";
  const state = licenseState(license);
  const labels = e ? { unconfigured: "Dates not configured", scheduled: "Scheduled", active: "Active", expired: "Expired" } : { unconfigured: "Сроки не заданы", scheduled: "Начнётся позже", active: "Активна", expired: "Истекла" };
  return <article className={styles.card}><h2>{e ? "License" : "Лицензия"}</h2><span className={styles.badge} data-warning={state !== "active"}>{labels[state]}</span><dl>
    <div><dt>{e ? "Start date" : "Начало"}</dt><dd>{license.startsOn ?? "—"}</dd></div><div><dt>{e ? "Valid through (inclusive)" : "Действует по (включительно)"}</dt><dd>{license.endsOn ?? "—"}</dd></div>
    <div><dt>{e ? "Active clinician limit" : "Лимит активных врачей"}</dt><dd>{license.maxClinicians ?? (e ? "Not configured" : "Не задан")}</dd></div>
    <div><dt>{e ? "Agreed price" : "Согласованная стоимость"}</dt><dd>{license.priceMinor === null ? (e ? "Not configured" : "Не задана") : new Intl.NumberFormat(e ? "en-US" : "ru-RU", { style: "currency", currency: license.currency ?? "BYN" }).format(license.priceMinor / 100)}</dd></div>
    <div><dt>{e ? "Hospital offline permission" : "Разрешение offline для больницы"}</dt><dd>{license.offlineAllowed ? `${license.offlineHours} ${e ? "hours" : "ч."}` : (e ? "Disabled" : "Отключено")}</dd></div>
  </dl><p>{e ? "Price does not create charges automatically. Offline mode also requires approval in server settings. Missing dates preserve existing online access; they do not mean a paid license." : "Стоимость не создаёт начисления автоматически. Offline также требует разрешения в настройках сервера. Если даты не заданы, существующий онлайн-доступ сохраняется; это не означает оплаченную лицензию."}</p></article>;
}
