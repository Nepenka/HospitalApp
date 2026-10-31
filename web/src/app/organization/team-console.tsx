"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { AccountRecord } from "@/server/identity/store";
import { createClinicianAction, resetClinicianPasswordAction, type TeamActionState } from "./actions";
import styles from "./organization.module.css";
import { useTranslations } from "@/i18n/provider";
import { AccessControl } from "@/components/administration/access-control";
import ui from "@/components/administration/administration.module.css";
import type {MemberListPage} from "@/server/admin/member-list";
import {ListPagination} from "@/components/administration/list-pagination";

type PublicAccount = Omit<AccountRecord, "passwordHash">;
const initialState: TeamActionState = {};

export function TeamConsole({ data }: { data:MemberListPage }) {
  const { locale } = useTranslations(); const e = locale === "en";
  const router = useRouter();
  const [state, action, pending] = useActionState(createClinicianAction, initialState);
  const query=data.query,filtered=data.items;
  useEffect(() => { if (state.credentials) router.refresh(); }, [router, state.credentials]);
  return <>
    <section className={styles.grid}>
      <article className={styles.card}><h2>{e?"Add clinician":"Добавить врача"}</h2><p>{e?"Each employee receives an individual login so actions remain attributable and auditable.":"Для каждого сотрудника создаётся отдельный логин, чтобы действия оставались персонально аудируемыми."}</p><form action={action}><label><span>{e?"Clinician name":"ФИО врача"}</span><input name="displayName" minLength={3} maxLength={160} required /></label>{state.error && <div className={styles.error}>{state.error}</div>}<button disabled={pending}>{pending ? (e?"Creating…":"Создание…") : (e?"Generate credentials":"Сгенерировать доступ")}</button></form></article>
      <CredentialPanel state={state} />
    </section>
    <section className={styles.card}><div className={styles.tableHeader}><div><p>{e?"Staff":"Сотрудники"}</p><h2>{e?"Accounts":"Учётные записи"}</h2></div><strong>{data.total}</strong></div><form className={ui.search} action="/organization"><input type="hidden" name="tab" value="staff"/><label><span>{e ? "Search" : "Поиск"}</span><input name="q" defaultValue={query} maxLength={200} placeholder={e ? "Name or login" : "ФИО или логин"} /></label><button className={ui.primary}>{e?"Find":"Найти"}</button></form><div className={styles.tableWrap}><table><thead><tr><th>{e?"Employee":"Сотрудник"}</th><th>{e?"Login":"Логин"}</th><th>{e?"Role / status":"Роль / статус"}</th><th>{e?"Last sign-in":"Последний вход"}</th><th>{e?"Access":"Доступ"}</th></tr></thead><tbody>{filtered.map((member) => <MemberRow member={member} key={member.id} />)}</tbody></table></div>{!filtered.length && <div className={ui.empty}>{e ? "No matching accounts" : "Учётные записи не найдены"}</div>}<ListPagination {...data} href={`/organization?${new URLSearchParams({tab:"staff",q:query})}`} locale={locale}/></section>
  </>;
}

function MemberRow({ member }: { member: PublicAccount }) {
  const { locale } = useTranslations(); const e = locale === "en";
  const [state, action, pending] = useActionState(resetClinicianPasswordAction, initialState);
  return <><tr><td><strong>{member.displayName}</strong></td><td><code>{member.login}</code></td><td>{member.role === "organization_owner" ? (e?"Administrator":"Администратор") : (e?"Clinician":"Врач")}<small className={ui.badge} data-warning={member.status !== "active"}>{member.status === "active" ? (e ? "Active" : "Активен") : (e ? "Suspended" : "Заблокирован")}</small></td><td>{member.lastLoginAt ? new Intl.DateTimeFormat(e?"en-GB":"ru-RU", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Minsk" }).format(new Date(member.lastLoginAt)) : (e?"Never signed in":"Ещё не входил")}</td><td>{member.role === "clinician" && <><form action={action}><input type="hidden" name="accountId" value={member.id} /><input type="hidden" name="displayName" value={member.displayName} /><button className={styles.textButton} disabled={pending}>{pending ? (e?"Resetting…":"Сброс…") : (e?"New password":"Новый пароль")}</button></form><div className={ui.actions}>
    <AccessControl label={e ? "Edit name" : "Исправить ФИО"} target="account" operation="rename" id={member.id}><label>{e ? "Name" : "ФИО"}<input name="displayName" minLength={3} maxLength={160} defaultValue={member.displayName} required /></label></AccessControl>
    <AccessControl label={member.status === "active" ? (e ? "Block" : "Заблокировать") : (e ? "Restore" : "Восстановить")} target="account" operation={member.status === "active" ? "suspend" : "activate"} id={member.id} />
    <AccessControl label={e ? "Revoke all access" : "Отозвать сеансы"} target="account" operation="revoke" id={member.id} />
    </div></>}</td></tr>{(state.credentials || state.error) && <tr><td colSpan={5}><CredentialPanel state={state} compact /></td></tr>}</>;
}

function CredentialPanel({ state, compact = false }: { state: TeamActionState; compact?: boolean }) {
  const { locale } = useTranslations(); const e = locale === "en";
  return <article className={`${styles.credentials} ${compact ? styles.compact : ""}`} data-ready={Boolean(state.credentials)}><h2>{state.credentials?.displayName ?? (e?"One-time credentials":"Одноразовые реквизиты")}</h2>{state.credentials ? <><dl><div><dt>{e?"Login":"Логин"}</dt><dd><code>{state.credentials.login}</code></dd></div><div><dt>{e?"Temporary password":"Временный пароль"}</dt><dd><code>{state.credentials.password}</code></dd></div></dl><p>{state.success}</p></> : <p>{e?"The login and password will be shown only once.":"Логин и пароль будут показаны только один раз."}</p>}</article>;
}
