import Link from "next/link";
import { requireRole } from "@/server/auth/session";
import { getOrganization } from "@/server/identity/store";
import {memberList,memberSummary} from "@/server/admin/member-list";
import { TeamConsole } from "./team-console";
import styles from "./organization.module.css";
import { getLocale } from "@/i18n/server";
import { listBillingEntries, listOnlineSessions, listOfflineDevices } from "@/server/identity/store";
import { readSecurityAudit } from "@/server/security/audit";
import { LicenseView } from "@/components/administration/license-view";
import { BillingReadOnly } from "@/components/administration/billing-read-only";
import { SecurityView } from "@/components/administration/security-view";
import ui from "@/components/administration/administration.module.css";

export const dynamic = "force-dynamic";

export default async function OrganizationPage({ searchParams }: { searchParams: Promise<{ tab?: string;q?:string;page?:string }> }) {
  const [session, locale] = await Promise.all([requireRole("organization_owner"), getLocale()]);
  if (!session.user.organizationId) throw new Error("Organization is missing from the session");
  const [organization, summary] = await Promise.all([getOrganization(session.user.organizationId), memberSummary(session.user.organizationId)]);
  if (!organization) throw new Error("Organization not found");
  const e = locale === "en";
  const tabs = [["overview", e ? "Overview" : "Обзор"], ["staff", e ? "Staff" : "Сотрудники"], ["billing", e ? "License and billing" : "Лицензия и расчёты"], ["security", e ? "Security" : "Безопасность"], ["settings", e ? "Organization" : "Организация"]];
  const query=await searchParams;
  const requested = query.tab ?? "overview";
  const tab = tabs.some(([key]) => key === requested) ? requested : "overview";
  const scope = session.user.organizationId;
  return <main className={styles.page}><header><div><p>АнаФикс · {e ? "Hospital administration" : "Администратор больницы"}</p><h1>{organization.name}</h1><span>{e ? "Staff, access and billing — without patient data" : "Сотрудники, доступ и расчёты — без данных пациентов"}</span></div></header>
    <nav className={ui.tabs} aria-label={e ? "Organization sections" : "Разделы организации"}>{tabs.map(([key,label]) => <Link key={key} href={`/organization?tab=${key}`} aria-current={tab === key ? "page" : undefined}>{label}</Link>)}</nav>
    {tab === "overview" && <><div className={ui.grid}><article className={ui.card}><h3>{e ? "Organization access" : "Доступ организации"}</h3><strong className={ui.metric}>{organization.status === "active" ? (e ? "Enabled" : "Разрешён") : (e ? "Suspended" : "Приостановлен")}</strong></article><article className={ui.card}><h3>{e ? "Active clinicians" : "Активные врачи"}</h3><strong className={ui.metric}>{summary.activeClinicians}</strong></article><article className={ui.card}><h3>{e ? "Suspended clinicians" : "Заблокированные врачи"}</h3><strong className={ui.metric}>{summary.suspendedClinicians}</strong></article></div><LicenseView license={organization.license} locale={locale} /><div className={ui.notice}>{e ? "Each clinician uses an individual account. Administrative accounts cannot create examinations or access patient history." : "Каждый врач использует личную учётную запись. Административная учётная запись не позволяет создавать осмотры или открывать историю пациентов."}</div></>}
    {tab === "staff" && <TeamConsole data={await memberList(scope,query.q,Number(query.page??1))} />}
    {tab === "billing" && <><LicenseView license={organization.license} locale={locale} /><BillingReadOnly entries={await listBillingEntries(scope)} locale={locale} /></>}
    {tab === "security" && <SecurityView sessions={await listOnlineSessions(scope)} devices={await listOfflineDevices(scope)} events={await readSecurityAudit(scope)} currentSessionId={session.sessionId} locale={locale} />}
    {tab === "settings" && <article className={ui.card}><h2>{e ? "Organization settings" : "Настройки организации"}</h2><dl><div><dt>{e ? "Name" : "Название"}</dt><dd>{organization.name}</dd></div><div><dt>{e ? "Code" : "Код"}</dt><dd>{organization.code}</dd></div><div><dt>{e ? "Deleted record retention" : "Хранение удалённых записей"}</dt><dd>{organization.deletedRecordRetentionYears} {e ? "years" : "лет"}</dd></div></dl><p>{e ? "Retention is set by the platform administrator according to hospital policy. Changing the policy does not automatically erase records. License and offline changes are requested from the platform administrator." : "Срок хранения устанавливает администратор платформы по политике больницы. Изменение политики не стирает записи автоматически. Изменения лицензии и offline-доступа согласуются с администратором платформы."}</p></article>}
  </main>;
}
