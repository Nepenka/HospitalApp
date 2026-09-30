"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { AccountRecord } from "@/server/identity/store";
import { createClinicianAction, resetClinicianPasswordAction, type TeamActionState } from "./actions";
import styles from "./organization.module.css";
import { useTranslations } from "@/i18n/provider";

type PublicAccount = Omit<AccountRecord, "passwordHash">;
const initialState: TeamActionState = {};

export function TeamConsole({ members }: { members: PublicAccount[] }) {
  const { locale } = useTranslations(); const e = locale === "en";
  const router = useRouter();
  const [state, action, pending] = useActionState(createClinicianAction, initialState);
  useEffect(() => { if (state.credentials) router.refresh(); }, [router, state.credentials]);
  return <>
    <section className={styles.grid}>
      <article className={styles.card}><h2>{e?"Add clinician":"Добавить врача"}</h2><p>{e?"Each employee receives an individual login so actions remain attributable and auditable.":"Для каждого сотрудника создаётся отдельный логин, чтобы действия оставались персонально аудируемыми."}</p><form action={action}><label><span>{e?"Clinician name":"ФИО врача"}</span><input name="displayName" minLength={3} maxLength={160} required /></label>{state.error && <div className={styles.error}>{state.error}</div>}<button disabled={pending}>{pending ? (e?"Creating…":"Создание…") : (e?"Generate credentials":"Сгенерировать доступ")}</button></form></article>
      <CredentialPanel state={state} />
    </section>
    <section className={styles.card}><div className={styles.tableHeader}><div><p>{e?"Staff":"Сотрудники"}</p><h2>{e?"Accounts":"Учётные записи"}</h2></div><strong>{members.length}</strong></div><div className={styles.tableWrap}><table><thead><tr><th>{e?"Employee":"Сотрудник"}</th><th>{e?"Login":"Логин"}</th><th>{e?"Role":"Роль"}</th><th>{e?"Last sign-in":"Последний вход"}</th><th>{e?"Access":"Доступ"}</th></tr></thead><tbody>{members.map((member) => <MemberRow member={member} key={member.id} />)}</tbody></table></div></section>
  </>;
}

function MemberRow({ member }: { member: PublicAccount }) {
  const { locale } = useTranslations(); const e = locale === "en";
  const [state, action, pending] = useActionState(resetClinicianPasswordAction, initialState);
  return <><tr><td><strong>{member.displayName}</strong></td><td><code>{member.login}</code></td><td>{member.role === "organization_owner" ? (e?"Administrator":"Администратор") : (e?"Clinician":"Врач")}</td><td>{member.lastLoginAt ? new Intl.DateTimeFormat(e?"en-GB":"ru-RU", { dateStyle: "short", timeStyle: "short" }).format(new Date(member.lastLoginAt)) : (e?"Never signed in":"Ещё не входил")}</td><td>{member.role === "clinician" && <form action={action}><input type="hidden" name="accountId" value={member.id} /><input type="hidden" name="displayName" value={member.displayName} /><button className={styles.textButton} disabled={pending}>{pending ? (e?"Resetting…":"Сброс…") : (e?"New password":"Новый пароль")}</button></form>}</td></tr>{(state.credentials || state.error) && <tr><td colSpan={5}><CredentialPanel state={state} compact /></td></tr>}</>;
}

function CredentialPanel({ state, compact = false }: { state: TeamActionState; compact?: boolean }) {
  const { locale } = useTranslations(); const e = locale === "en";
  return <article className={`${styles.credentials} ${compact ? styles.compact : ""}`} data-ready={Boolean(state.credentials)}><h2>{state.credentials?.displayName ?? (e?"One-time credentials":"Одноразовые реквизиты")}</h2>{state.credentials ? <><dl><div><dt>{e?"Login":"Логин"}</dt><dd><code>{state.credentials.login}</code></dd></div><div><dt>{e?"Temporary password":"Временный пароль"}</dt><dd><code>{state.credentials.password}</code></dd></div></dl><p>{state.success}</p></> : <p>{e?"The login and password will be shown only once.":"Логин и пароль будут показаны только один раз."}</p>}</article>;
}
