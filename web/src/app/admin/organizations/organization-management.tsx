"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminDashboardData, OrganizationAdminRow } from "@/server/admin/organizations";
import { createOrganizationAction, resetOwnerPasswordAction, type AdminActionState } from "../actions";
import styles from "../admin.module.css";
import { useTranslations } from "@/i18n/provider";

const initialState: AdminActionState = {};

export function OrganizationManagement({ data }: { data: AdminDashboardData }) {
  const { locale } = useTranslations(); const e = locale === "en";
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [createState, createAction, creating] = useActionState(createOrganizationAction, initialState);
  const filtered = useMemo(() => data.organizations.filter((organization) => `${organization.name} ${organization.code} ${organization.ownerLogin}`.toLocaleLowerCase("ru-RU").includes(query.trim().toLocaleLowerCase("ru-RU"))), [data.organizations, query]);
  useEffect(() => { if (createState.credentials) router.refresh(); }, [createState.credentials, router]);

  return <div className={styles.content}>
    <section className={styles.metrics} aria-label={e ? "Organization metrics" : "Показатели организаций"}>
      <Metric label={e?"Organizations":"Организации"} value={String(data.metrics.organizations)} note={e?"Total registered":"Всего зарегистрировано"} />
      <Metric label={e?"Accounts":"Учётные записи"} value={String(data.metrics.users)} note={e?"Owners and clinicians":"Владельцы и врачи"} />
      <Metric label={e?"Active accounts":"Активные учётные записи"} value={String(data.metrics.activeUsers)} note={e?"Access is enabled":"Доступ не приостановлен"} />
      <Metric label={e?"New this month":"Новые за месяц"} value={String(data.metrics.newOrganizationsThisMonth)} note={e?"Since the beginning of the month":"С начала текущего месяца"} />
    </section>

    <section className={styles.onboardingGrid}>
      <article className={styles.card}>
        <div className={styles.cardHeader}><div><p>{e?"Onboarding":"Подключение"}</p><h2>{e?"New organization":"Новая организация"}</h2></div></div>
        <form action={createAction} className={styles.createForm}>
          <label><span>{e?"Hospital or clinic name":"Название больницы или клиники"}</span><input name="organizationName" minLength={2} maxLength={200} required /></label>
          <label><span>{e?"Organization administrator name":"ФИО администратора организации"}</span><input name="ownerName" minLength={3} maxLength={160} required /></label>
          {createState.error && <div className={styles.formError} role="alert">{createState.error}</div>}
          <button type="submit" disabled={creating}>{creating ? (e?"Creating…":"Создание…") : (e?"Create and generate credentials":"Создать и сгенерировать доступ")}</button>
        </form>
      </article>
      <CredentialCard state={createState} emptyText={e?"The login and password will appear here once after creation.":"После создания здесь один раз появятся логин и пароль."} />
    </section>

    <section className={styles.tableCard}>
      <div className={styles.tableHeader}><div><p>{e?"Management":"Управление"}</p><h2>{e?"All organizations":"Все организации"}</h2></div><div className={styles.filters}><label><span className={styles.srOnly}>{e?"Search":"Поиск"}</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={e?"Name, code or login":"Название, код или логин"} /></label>{query && <button className={styles.clearFilter} type="button" onClick={() => setQuery("")}>{e?"Clear":"Очистить"}</button>}</div></div>
      {filtered.length ? <div className={styles.tableScroll}><table><thead><tr><th>{e?"Organization":"Организация"}</th><th>{e?"Owner login":"Логин владельца"}</th><th>{e?"Users":"Пользователи"}</th><th>{e?"Outstanding":"Задолженность"}</th><th>{e?"Status":"Статус"}</th><th>{e?"Last sign-in":"Последний вход"}</th><th>{e?"Access":"Доступ"}</th></tr></thead><tbody>{filtered.map((organization) => <OrganizationRow organization={organization} key={organization.id} />)}</tbody></table></div> : <div className={styles.emptyState}><strong>{data.organizations.length ? (e?"No organizations found":"Организации не найдены") : (e?"No organizations yet":"Организаций пока нет")}</strong><span>{data.organizations.length ? (e?"Clear the search or change the query.":"Очистите поиск или измените запрос.") : (e?"Create the first organization using the form above.":"Создайте первую организацию в форме выше.")}</span>{query && <button className={styles.clearEmpty} type="button" onClick={() => setQuery("")}>{e?"Clear search":"Очистить поиск"}</button>}</div>}
      <footer><span>{e?"Showing":"Показано"} {filtered.length} {e?"of":"из"} {data.organizations.length}</span></footer>
    </section>
  </div>;
}

function OrganizationRow({ organization }: { organization: OrganizationAdminRow }) {
  const { locale } = useTranslations(); const e = locale === "en";
  const [state, action, pending] = useActionState(resetOwnerPasswordAction, initialState);
  return <><tr><td><Link className={styles.organizationLink} href={`/admin/organizations/${organization.id}`}><strong>{organization.name}</strong><span>{organization.code}</span></Link></td><td><code>{organization.ownerLogin}</code></td><td><strong>{organization.users}</strong><span>{organization.activeUsers} {e?"active":"активны"}</span></td><td><div className={styles.moneyStack}>{(["BYN", "USD", "RUB"] as const).map((currency) => organization.finances[currency].debt > 0 && <span key={currency}>{formatMoney(organization.finances[currency].debt, currency, locale)}</span>)}</div>{Object.values(organization.finances).every((item) => item.debt === 0) && <span>{e?"None":"Нет"}</span>}</td><td><span className={styles.status} data-status={organization.status}>{organization.status === "active" ? (e?"Active":"Активна") : (e?"Suspended":"Приостановлена")}</span></td><td>{organization.lastActivityAt ? new Intl.DateTimeFormat(e?"en-GB":"ru-RU", { dateStyle: "short", timeStyle: "short" }).format(new Date(organization.lastActivityAt)) : (e?"Never signed in":"Ещё не входили")}</td><td>{organization.ownerAccountId && <form action={action}><input type="hidden" name="accountId" value={organization.ownerAccountId} /><input type="hidden" name="organizationName" value={organization.name} /><button className={styles.textButton} disabled={pending}>{pending ? (e?"Resetting…":"Сброс…") : (e?"New password":"Новый пароль")}</button></form>}</td></tr>{(state.credentials || state.error) && <tr className={styles.credentialRow}><td colSpan={7}><CredentialCard state={state} emptyText="" /></td></tr>}</>;
}

function CredentialCard({ state, emptyText }: { state: AdminActionState; emptyText: string }) {
  const { locale } = useTranslations(); const e = locale === "en";
  return <article className={styles.credentialsCard} data-ready={Boolean(state.credentials)}><div><p>{e?"Access credentials":"Реквизиты доступа"}</p><h2>{state.credentials?.organizationName ?? (e?"One-time display":"Одноразовая выдача")}</h2></div>{state.credentials ? <><dl><div><dt>{e?"Login":"Логин"}</dt><dd><code>{state.credentials.login}</code></dd></div><div><dt>{e?"Temporary password":"Временный пароль"}</dt><dd><code>{state.credentials.password}</code></dd></div></dl><p className={styles.securityNote}>{state.success}</p></> : <p className={styles.emptyCredential}>{state.error ?? emptyText}</p>}</article>;
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) { return <article><p>{label}</p><strong>{value}</strong><span>{note}</span></article>; }
function formatMoney(amountMinor: number, currency: "USD" | "BYN" | "RUB", locale: "ru" | "en" = "ru"): string { return new Intl.NumberFormat(locale === "en" ? "en-US" : "ru-RU", { style: "currency", currency }).format(amountMinor / 100); }
