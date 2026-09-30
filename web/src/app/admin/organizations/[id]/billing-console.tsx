"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createBillingEntryAction, voidBillingEntryAction, type BillingActionState } from "../../actions";
import styles from "../../admin.module.css";
import { useTranslations } from "@/i18n/provider";

type Currency = "USD" | "BYN" | "RUB";
type BillingEntryView = { id: string; type: "charge" | "payment"; currency: Currency; amountMinor: number; effectiveDate: string; note: string | null; createdAt: string; voidedAt: string | null };
type CurrencySummary = { charged: number; received: number; debt: number; advance: number; scheduled: number };

const initialState: BillingActionState = {};

export function BillingConsole({ organizationId, entries, summary, today }: { organizationId: string; entries: BillingEntryView[]; summary: Record<Currency, CurrencySummary>; today: string }) {
  const { locale } = useTranslations(); const e = locale === "en";
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(createBillingEntryAction, initialState);
  useEffect(() => { if (state.success) { formRef.current?.reset(); router.refresh(); } }, [router, state.success]);
  return <>
    <section className={styles.financeMetrics}>{(["BYN", "USD", "RUB"] as const).map((currency) => <article key={currency}><header><strong>{currency}</strong><span>{summary[currency].debt > 0 ? (e?"Outstanding balance":"Есть задолженность") : (e?"No outstanding balance":"Без задолженности")}</span></header><dl><div><dt>{e?"Received":"Получено"}</dt><dd>{formatMoney(summary[currency].received, currency, locale)}</dd></div><div><dt>{e?"Debt":"Долг"}</dt><dd data-debt={summary[currency].debt > 0}>{formatMoney(summary[currency].debt, currency, locale)}</dd></div><div><dt>{e?"Future charges":"Будущие начисления"}</dt><dd>{formatMoney(summary[currency].scheduled, currency, locale)}</dd></div>{summary[currency].advance > 0 && <div><dt>{e?"Credit":"Аванс"}</dt><dd>{formatMoney(summary[currency].advance, currency, locale)}</dd></div>}</dl></article>)}</section>
    <section className={styles.billingGrid}>
      <article className={styles.card}><div className={styles.cardHeader}><div><p>{e?"Manual ledger":"Ручной учёт"}</p><h2>{e?"Add transaction":"Добавить операцию"}</h2></div></div><form ref={formRef} action={action} className={styles.billingForm}><input type="hidden" name="organizationId" value={organizationId} /><label><span>{e?"Transaction":"Операция"}</span><select name="type" defaultValue="charge"><option value="charge">{e?"Charge":"Начисление"}</option><option value="payment">{e?"Payment":"Оплата"}</option></select></label><label><span>{e?"Currency":"Валюта"}</span><select name="currency" defaultValue="BYN"><option value="BYN">BYN</option><option value="USD">USD</option><option value="RUB">RUB</option></select></label><label><span>{e?"Amount":"Сумма"}</span><input name="amount" inputMode="decimal" placeholder="0.00" required /></label><label><span>{e?"Transaction date / due date":"Дата операции / срок оплаты"}</span><input name="effectiveDate" type="date" defaultValue={today} required /></label><label className={styles.billingWide}><span>{e?"Comment":"Комментарий"}</span><input name="note" maxLength={200} placeholder={e?"For example, October license":"Например, лицензия за октябрь"} /></label>{state.error && <div className={`${styles.formError} ${styles.billingWide}`} role="alert">{state.error}</div>}{state.success && <div className={`${styles.formSuccess} ${styles.billingWide}`} role="status">{state.success}</div>}<button className={styles.billingWide} type="submit" disabled={pending}>{pending ? (e?"Saving…":"Сохранение…") : (e?"Add transaction":"Добавить операцию")}</button></form></article>
      <article className={styles.card}><div className={styles.cardHeader}><div><p>{e?"Calculation rules":"Правила расчёта"}</p><h2>{e?"How debt is calculated":"Как считается задолженность"}</h2></div></div><ul className={styles.billingRules}>{(e?["Charges dated today or earlier increase debt.","Payments reduce debt in their own currency.","Future charges are shown separately until due.","USD, BYN and RUB are neither combined nor converted."]:["Начисления с сегодняшней или прошедшей датой увеличивают долг.","Оплаты уменьшают долг в своей валюте.","Будущие начисления отображаются отдельно до наступления срока.","USD, BYN и RUB не складываются и не конвертируются."]).map(x=><li key={x}>{x}</li>)}</ul></article>
    </section>
    <section className={styles.tableCard}><div className={styles.tableHeader}><div><p>{e?"Finance":"Финансы"}</p><h2>{e?"Transaction history":"История операций"}</h2></div></div>{entries.length ? <div className={styles.tableScroll}><table><thead><tr><th>{e?"Date":"Дата"}</th><th>{e?"Type":"Тип"}</th><th>{e?"Amount":"Сумма"}</th><th>{e?"Comment":"Комментарий"}</th><th>{e?"Status":"Статус"}</th><th>{e?"Action":"Действие"}</th></tr></thead><tbody>{entries.map((entry) => <BillingRow entry={entry} organizationId={organizationId} key={entry.id} />)}</tbody></table></div> : <div className={styles.emptyState}><strong>{e?"No transactions yet":"Операций пока нет"}</strong><span>{e?"Add the first charge or payment.":"Добавьте первое начисление или оплату."}</span></div>}</section>
  </>;
}

function BillingRow({ entry, organizationId }: { entry: BillingEntryView; organizationId: string }) {
  const { locale } = useTranslations(); const e = locale === "en";
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [state, action, pending] = useActionState(voidBillingEntryAction, initialState);
  useEffect(() => { if (state.success) router.refresh(); }, [router, state.success]);
  return <><tr data-voided={Boolean(entry.voidedAt)}><td><strong>{formatDate(entry.effectiveDate, locale)}</strong><span>{e?"Entered":"Внесено"} {formatDateTime(entry.createdAt, locale)}</span></td><td>{entry.type === "charge" ? (e?"Charge":"Начисление") : (e?"Payment":"Оплата")}</td><td><strong>{formatMoney(entry.amountMinor, entry.currency, locale)}</strong></td><td>{entry.note ?? "—"}</td><td><span className={styles.status} data-status={entry.voidedAt ? "canceled" : "active"}>{entry.voidedAt ? (e?"Voided":"Аннулирована") : (e?"Recorded":"Учтена")}</span></td><td>{!entry.voidedAt && (!confirming ? <button className={styles.textDanger} type="button" onClick={() => setConfirming(true)}>{e?"Void":"Аннулировать"}</button> : <form action={action} className={styles.inlineConfirm}><input type="hidden" name="entryId" value={entry.id} /><input type="hidden" name="organizationId" value={organizationId} /><button type="submit" disabled={pending}>{pending ? "…" : (e?"Confirm":"Подтвердить")}</button><button type="button" onClick={() => setConfirming(false)}>{e?"Cancel":"Отмена"}</button></form>)}</td></tr>{state.error && <tr><td colSpan={6}><div className={styles.formError}>{state.error}</div></td></tr>}</>;
}

function formatMoney(amountMinor: number, currency: Currency, locale: "ru"|"en"): string { return new Intl.NumberFormat(locale==="en"?"en-US":"ru-RU", { style: "currency", currency }).format(amountMinor / 100); }
function formatDate(value: string, locale: "ru"|"en"): string { return new Intl.DateTimeFormat(locale==="en"?"en-GB":"ru-RU", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${value}T00:00:00.000Z`)); }
function formatDateTime(value: string, locale: "ru"|"en"): string { return new Intl.DateTimeFormat(locale==="en"?"en-GB":"ru-RU", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)); }
