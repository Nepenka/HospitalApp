import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/server/auth/session";
import { getOrganization, listBillingEntries } from "@/server/identity/store";
import {memberList,memberSummary} from "@/server/admin/member-list";
import {ListPagination} from "@/components/administration/list-pagination";
import { summarizeBilling } from "@/server/admin/billing";
import styles from "../../admin.module.css";
import { BillingConsole } from "./billing-console";
import { RetentionConsole } from "./retention-console";
import {ManagementConsole} from "./management-console";
import { getLocale } from "@/i18n/server";
import { AdminSidebar } from "../../admin-sidebar";
import { LicenseEditor } from "@/components/administration/license-editor";
import { LicenseView } from "@/components/administration/license-view";
import { AccessControl } from "@/components/administration/access-control";
import ui from "@/components/administration/administration.module.css";

export const dynamic = "force-dynamic";

export default async function AdminOrganizationPage({ params,searchParams }: { params: Promise<{ id: string }>;searchParams:Promise<{q?:string;page?:string}> }) {
  const [session, locale] = await Promise.all([requireRole("platform_admin"), getLocale()]); const e = locale === "en";
  const { id } = await params;
  const query=await searchParams;
  const [organization, memberPage,summary,billingEntries] = await Promise.all([getOrganization(id), memberList(id,query.q,Number(query.page??1)),memberSummary(id),listBillingEntries(id)]);
  const members=memberPage.items;
  if (!organization) notFound();
  const owner = summary.owner;
  return <main className={styles.page}>
    <AdminSidebar active="/admin/organizations" locale={locale} />
    <section className={styles.main}><header><div><p>{e?"Organization profile":"Карточка организации"}</p><h1>{organization.name}</h1></div><div className={styles.account}><span>{session.user.displayName}</span><b>PA</b></div></header><div className={styles.content}>
      <Link className={styles.backLink} href="/admin/organizations">← {e?"All organizations":"Все организации"}</Link>
      <section className={styles.metrics}><Metric label={e?"Users":"Пользователи"} value={String(summary.total)} note={e?"All accounts":"Все учётные записи"} /><Metric label={e?"Active":"Активные"} value={String(organization.status==="active"?summary.active:0)} note={e?"Access enabled":"Доступ разрешён"} /><Metric label={e?"Status":"Статус"} value={organization.archivedAt?(e?"Archived":"Архив"):organization.status === "active" ? (e?"Active":"Активна") : (e?"Suspended":"Приостановлена")} note={`${e?"Code":"Код"}: ${organization.code}`} /><Metric label={e?"Owner":"Владелец"} value={owner?.login ?? "—"} note={e?"Hospital administrator login":"Логин администратора больницы"} /></section>
      <ManagementConsole id={organization.id} name={organization.name} archived={Boolean(organization.archivedAt)}/>
      {!organization.archivedAt && <section className={ui.card}><h2>{e ? "Organization access" : "Доступ организации"}</h2><p>{e ? "Suspension revokes online sessions without deleting patients or ledger entries. Disconnected local vaults cannot be remotely erased." : "Приостановка отзывает онлайн-сеансы, но не удаляет пациентов и финансовые операции. Отключённые от сети локальные хранилища нельзя стереть удалённо."}</p><AccessControl label={organization.status === "active" ? (e ? "Suspend organization" : "Приостановить организацию") : (e ? "Restore organization" : "Восстановить организацию")} target="organization" operation={organization.status === "active" ? "suspend" : "activate"} id={organization.id} organizationId={organization.id} /></section>}
      <LicenseView license={organization.license} locale={locale} />{!organization.archivedAt && <LicenseEditor organizationId={organization.id} license={organization.license} />}
      <section className={ui.card}><h2>{e ? "License change history" : "История изменений лицензии"}</h2>{organization.licenseHistory?.length ? <div className={ui.scroll}><table className={ui.table}><thead><tr><th>{e ? "Date" : "Дата"}</th><th>{e ? "Reason" : "Причина"}</th><th>{e ? "Validity" : "Срок"}</th><th>{e ? "Clinician limit" : "Лимит врачей"}</th><th>{e ? "Price" : "Стоимость"}</th></tr></thead><tbody>{[...organization.licenseHistory].reverse().map((change,index) => <tr key={index}><td>{formatDate(change.at,locale)}<small>{change.actorId}</small></td><td>{change.reason}</td><td>{change.license.startsOn ?? "—"} → {change.license.endsOn ?? "—"}<small>{e ? "Previously" : "Ранее"}: {change.previous.startsOn ?? "—"} → {change.previous.endsOn ?? "—"}</small></td><td>{change.license.maxClinicians ?? "—"}</td><td>{change.license.priceMinor === null ? "—" : `${(change.license.priceMinor / 100).toFixed(2)} ${change.license.currency}`}</td></tr>)}</tbody></table></div> : <p>{e ? "No recorded changes" : "Изменений пока нет"}</p>}</section>
      <BillingConsole organizationId={organization.id} entries={billingEntries} summary={summarizeBilling(billingEntries)} today={new Date().toISOString().slice(0, 10)} />
      <RetentionConsole organizationId={organization.id} years={organization.deletedRecordRetentionYears} />
      <section className={styles.tableCard}><div className={styles.tableHeader}><div><p>{e?"Access":"Доступ"}</p><h2>{e?"Accounts":"Учётные записи"}</h2></div><form action={`/admin/organizations/${id}`} className={ui.search}><input name="q" defaultValue={memberPage.query} maxLength={200} placeholder={e?"Name or login":"ФИО или логин"}/><button className={ui.primary}>{e?"Find":"Найти"}</button></form></div>{members.length ? <div className={styles.tableScroll}><table><thead><tr><th>{e?"Employee":"Сотрудник"}</th><th>{e?"Login":"Логин"}</th><th>{e?"Role":"Роль"}</th><th>{e?"Status":"Статус"}</th><th>{e?"Last sign-in":"Последний вход"}</th></tr></thead><tbody>{members.map((member) => <tr key={member.id}><td><strong>{member.displayName}</strong><span>{e?"Created":"Создан"} {formatDate(member.createdAt, locale)}</span></td><td><code>{member.login}</code></td><td>{member.role === "organization_owner" ? (e?"Organization administrator":"Администратор организации") : (e?"Clinician":"Врач")}</td><td><span className={styles.status}>{member.status === "active" ? (e?"Active":"Активен") : (e?"Suspended":"Приостановлен")}</span></td><td>{member.lastLoginAt ? formatDate(member.lastLoginAt, locale) : (e?"Never signed in":"Ещё не входил")}</td></tr>)}</tbody></table></div> : <div className={styles.emptyState}><strong>{e?"No accounts":"Учётных записей нет"}</strong></div>}<footer><ListPagination {...memberPage} locale={locale} href={`/admin/organizations/${id}?${new URLSearchParams({q:memberPage.query})}`}/></footer></section>
    </div></section>
  </main>;
}

function formatDate(value: string, locale: "ru"|"en"): string { return new Intl.DateTimeFormat(locale==="en"?"en-GB":"ru-RU", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Minsk" }).format(new Date(value)); }
function Metric({ label, value, note }: { label: string; value: string; note: string }) { return <article><p>{label}</p><strong>{value}</strong><span>{note}</span></article>; }
