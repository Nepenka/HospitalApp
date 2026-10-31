import { requireRole } from "@/server/auth/session";
import { listOnlineSessions, listOfflineDevices, listOrganizations, listOrganizationMembers } from "@/server/identity/store";
import { readSecurityAudit } from "@/server/security/audit";
import { getLocale } from "@/i18n/server";
import { AdminSidebar } from "../admin-sidebar";
import { SecurityView } from "@/components/administration/security-view";
import { AccessControl } from "@/components/administration/access-control";
import styles from "../admin.module.css";
import ui from "@/components/administration/administration.module.css";
export default async function PlatformSecurityPage() {
  const session = await requireRole("platform_admin");
  const locale = await getLocale(); const e = locale === "en";
  const organizations = await listOrganizations();
  const members = (await Promise.all(organizations.map(async organization => (await listOrganizationMembers(organization.id)).map(member => ({ ...member, organizationName: organization.name }))))).flat();
  return <main className={styles.page}><AdminSidebar active="/admin/security" locale={locale} /><section className={styles.main}><header><div><p>{e ? "Platform administration" : "Панель администратора"}</p><h1>{e ? "Security" : "Безопасность"}</h1></div></header><div className={styles.content}>
    <section className={ui.card}><h2>{e ? "Account access" : "Доступ сотрудников"}</h2><div className={ui.scroll}><table className={ui.table}><thead><tr><th>{e ? "Employee" : "Сотрудник"}</th><th>{e ? "Organization" : "Организация"}</th><th>{e ? "Status" : "Статус"}</th><th>{e ? "Access" : "Доступ"}</th></tr></thead><tbody>{members.map(m => <tr key={m.id}><td>{m.displayName}<small>{m.login} · {m.role === "organization_owner" ? (e ? "Administrator" : "Администратор") : (e ? "Clinician" : "Врач")}</small></td><td>{m.organizationName}</td><td>{m.status === "active" ? (e ? "Active" : "Активен") : (e ? "Suspended" : "Заблокирован")}</td><td><div className={ui.actions}><AccessControl label={m.status === "active" ? (e ? "Block" : "Заблокировать") : (e ? "Restore" : "Восстановить")} target="account" operation={m.status === "active" ? "suspend" : "activate"} id={m.id} organizationId={m.organizationId} /><AccessControl label={e ? "Revoke all sessions" : "Отозвать все сеансы"} target="account" operation="revoke" id={m.id} organizationId={m.organizationId} /></div></td></tr>)}</tbody></table></div>{!members.length && <p>{e ? "No accounts yet" : "Учётных записей пока нет"}</p>}</section>
    <SecurityView sessions={await listOnlineSessions()} devices={await listOfflineDevices()} events={await readSecurityAudit()} currentSessionId={session.sessionId} locale={locale} />
  </div></section></main>;
}
