import Link from "next/link";
import { requireRole } from "@/server/auth/session";
import { listOrganizations } from "@/server/identity/store";
import { licenseState } from "@/domain/administration/license";
import { getLocale } from "@/i18n/server";
import { AdminSidebar } from "../admin-sidebar";
import styles from "../admin.module.css";
import ui from "@/components/administration/administration.module.css";
export default async function LicensesPage() {
  const session = await requireRole("platform_admin");
  const locale = await getLocale(); const e = locale === "en";
  const organizations = await listOrganizations();
  const labels = e ? { unconfigured: "Not configured", scheduled: "Scheduled", active: "Active", expired: "Expired" } : { unconfigured: "Сроки не заданы", scheduled: "Начнётся позже", active: "Активна", expired: "Истекла" };
  return <main className={styles.page}><AdminSidebar active="/admin/licenses" locale={locale} /><section className={styles.main}><header><div><p>{e ? "Platform administration" : "Панель администратора"}</p><h1>{e ? "Licenses" : "Лицензии"}</h1></div><div className={styles.account}>{session.user.displayName}</div></header><div className={styles.content}><div className={ui.notice}>{e ? "Set validity, agreed price and limits in each organization profile. Unknown terms remain blank. Expiration does not delete medical data." : "Сроки, согласованная стоимость и лимиты задаются в карточке организации. Неизвестные условия остаются пустыми. Истечение лицензии не удаляет медицинские данные."}</div><section className={ui.card}><div className={ui.scroll}><table className={ui.table}><thead><tr><th>{e ? "Organization" : "Организация"}</th><th>{e ? "License" : "Лицензия"}</th><th>{e ? "Validity" : "Срок"}</th><th>{e ? "Clinician limit" : "Лимит врачей"}</th><th>{e ? "Price" : "Стоимость"}</th></tr></thead><tbody>{organizations.map(o => <tr key={o.id}><td><Link href={`/admin/organizations/${o.id}`}>{o.name}</Link></td><td>{labels[licenseState(o.license)]}</td><td>{o.license.startsOn ?? "—"} → {o.license.endsOn ?? "—"}</td><td>{o.license.maxClinicians ?? "—"}</td><td>{o.license.priceMinor === null ? "—" : `${(o.license.priceMinor / 100).toFixed(2)} ${o.license.currency}`}</td></tr>)}</tbody></table></div>{!organizations.length && <div className={ui.empty}>{e ? "No organizations yet" : "Организаций пока нет"}</div>}</section></div></section></main>;
}
