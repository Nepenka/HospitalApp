import Link from "next/link";
import { notFound } from "next/navigation";
import { logoutAction } from "@/app/login/actions";
import { requireRole } from "@/server/auth/session";
import { getOrganization, listBillingEntries, listOrganizationMembers } from "@/server/identity/store";
import { summarizeBilling } from "@/server/admin/billing";
import styles from "../../admin.module.css";
import { BillingConsole } from "./billing-console";
import { getLocale } from "@/i18n/server";

export const dynamic = "force-dynamic";

export default async function AdminOrganizationPage({ params }: { params: Promise<{ id: string }> }) {
  const [session, locale] = await Promise.all([requireRole("platform_admin"), getLocale()]); const e = locale === "en";
  const { id } = await params;
  const [organization, members, billingEntries] = await Promise.all([getOrganization(id), listOrganizationMembers(id), listBillingEntries(id)]);
  if (!organization) notFound();
  const owner = members.find((member) => member.role === "organization_owner");
  return <main className={styles.page}>
    <aside className={styles.sidebar}><div className={styles.logo}><span>АФ</span><div><b>АнаФикс</b><small>{e?"Management":"Управление"}</small></div></div><nav><Link href="/admin">{e?"Overview":"Обзор"}</Link><Link className={styles.active} href="/admin/organizations">{e?"Organizations":"Организации"}</Link></nav><div className={styles.sideFooter}><form action={logoutAction}><button>{e?"Sign out":"Выйти"}</button></form></div></aside>
    <section className={styles.main}><header><div><p>{e?"Organization profile":"Карточка организации"}</p><h1>{organization.name}</h1></div><div className={styles.account}><span>{session.user.displayName}</span><b>PA</b></div></header><div className={styles.content}>
      <Link className={styles.backLink} href="/admin/organizations">← {e?"All organizations":"Все организации"}</Link>
      <section className={styles.metrics}><Metric label={e?"Users":"Пользователи"} value={String(members.length)} note={e?"All accounts":"Все учётные записи"} /><Metric label={e?"Active":"Активные"} value={String(members.filter((member) => member.status === "active").length)} note={e?"Access enabled":"Доступ разрешён"} /><Metric label={e?"Status":"Статус"} value={organization.status === "active" ? (e?"Active":"Активна") : (e?"Suspended":"Приостановлена")} note={`${e?"Code":"Код"}: ${organization.code}`} /><Metric label={e?"Owner":"Владелец"} value={owner?.login ?? "—"} note={e?"Hospital administrator login":"Логин администратора больницы"} /></section>
      <BillingConsole organizationId={organization.id} entries={billingEntries} summary={summarizeBilling(billingEntries)} today={new Date().toISOString().slice(0, 10)} />
      <section className={styles.tableCard}><div className={styles.tableHeader}><div><p>{e?"Access":"Доступ"}</p><h2>{e?"Accounts":"Учётные записи"}</h2></div></div>{members.length ? <div className={styles.tableScroll}><table><thead><tr><th>{e?"Employee":"Сотрудник"}</th><th>{e?"Login":"Логин"}</th><th>{e?"Role":"Роль"}</th><th>{e?"Status":"Статус"}</th><th>{e?"Last sign-in":"Последний вход"}</th></tr></thead><tbody>{members.map((member) => <tr key={member.id}><td><strong>{member.displayName}</strong><span>{e?"Created":"Создан"} {formatDate(member.createdAt, locale)}</span></td><td><code>{member.login}</code></td><td>{member.role === "organization_owner" ? (e?"Organization administrator":"Администратор организации") : (e?"Clinician":"Врач")}</td><td><span className={styles.status}>{member.status === "active" ? (e?"Active":"Активен") : (e?"Suspended":"Приостановлен")}</span></td><td>{member.lastLoginAt ? formatDate(member.lastLoginAt, locale) : (e?"Never signed in":"Ещё не входил")}</td></tr>)}</tbody></table></div> : <div className={styles.emptyState}><strong>{e?"No accounts":"Учётных записей нет"}</strong></div>}</section>
    </div></section>
  </main>;
}

function formatDate(value: string, locale: "ru"|"en"): string { return new Intl.DateTimeFormat(locale==="en"?"en-GB":"ru-RU", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)); }
function Metric({ label, value, note }: { label: string; value: string; note: string }) { return <article><p>{label}</p><strong>{value}</strong><span>{note}</span></article>; }
