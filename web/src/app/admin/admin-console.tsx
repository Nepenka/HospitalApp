"use client";

import { useState } from "react";
import type { AdminDashboardData } from "@/server/admin/organizations";
import styles from "./admin.module.css";
import { useTranslations } from "@/i18n/provider";

export function AdminConsole({ data }: { data: AdminDashboardData }) {
  const { locale } = useTranslations();
  const e = locale === "en";
  const [financeCurrency, setFinanceCurrency] = useState<"USD" | "BYN" | "RUB">("BYN");

  return <div className={styles.content}>
    <section className={styles.metrics} aria-label={e ? "Key metrics" : "Ключевые показатели"}>
      <Metric label={e ? "Organizations" : "Организации"} value={String(data.metrics.organizations)} note={e ? "Actual system records" : "Реальные записи в системе"} />
      <Metric label={e ? "Accounts" : "Учётные записи"} value={String(data.metrics.users)} note={e ? "Owners and clinicians" : "Владельцы и врачи"} />
      <Metric label={e ? "Active accounts" : "Активные учётные записи"} value={String(data.metrics.activeUsers)} note={e ? "Access is enabled" : "Доступ не приостановлен"} />
      <Metric label={e ? "New this month" : "Новые за месяц"} value={String(data.metrics.newOrganizationsThisMonth)} note={e ? "Since the beginning of the month" : "С начала текущего месяца"} />
    </section>

    <section className={styles.grid} aria-label={e ? "Organization growth and finances" : "Динамика подключений и финансы"}>
      <article className={styles.card}>
        <div className={styles.cardHeader}><div><p>{e ? "Growth" : "Динамика"}</p><h2>{e ? "New organizations" : "Новые организации"}</h2></div><span>{e ? "Last 6 months" : "Последние 6 месяцев"}</span></div>
        <div className={styles.barChart}>{data.organizationGrowth.map((point) => <div className={styles.barColumn} key={point.key}><strong>{point.count}</strong><span style={{ height: `${Math.max(4, point.count / Math.max(1, ...data.organizationGrowth.map((item) => item.count)) * 100)}%` }} /><small>{point.label}</small></div>)}</div>
      </article>
      <article className={styles.card}>
        <div className={styles.cardHeader}><div><p>{e ? "Finance" : "Финансы"}</p><h2>{e ? "Charges and payments" : "Начисления и оплаты"}</h2></div><select className={styles.currencySelect} value={financeCurrency} onChange={(event) => setFinanceCurrency(event.target.value as "USD" | "BYN" | "RUB")}><option>BYN</option><option>USD</option><option>RUB</option></select></div>
        <div className={styles.financeSummary}><div><span>{e ? "Received" : "Получено"}</span><strong>{formatMoney(data.finances.totals[financeCurrency].received, financeCurrency, locale)}</strong></div><div><span>{e ? "Outstanding" : "Задолженность"}</span><strong data-debt={data.finances.totals[financeCurrency].debt > 0}>{formatMoney(data.finances.totals[financeCurrency].debt, financeCurrency, locale)}</strong></div><div><span>{e ? "Scheduled" : "Запланировано"}</span><strong>{formatMoney(data.finances.totals[financeCurrency].scheduled, financeCurrency, locale)}</strong></div></div>
        <div className={styles.billingChart}>{data.finances.charts[financeCurrency].map((point) => { const max = Math.max(1, ...data.finances.charts[financeCurrency].flatMap((item) => [item.charged, item.received])); return <div className={styles.billingColumn} key={point.key}><div><span data-kind="charge" title={`${e ? "Charged" : "Начислено"}: ${formatMoney(point.charged, financeCurrency, locale)}`} style={{ height: `${Math.max(point.charged ? 5 : 0, point.charged / max * 100)}%` }} /><span data-kind="payment" title={`${e ? "Received" : "Получено"}: ${formatMoney(point.received, financeCurrency, locale)}`} style={{ height: `${Math.max(point.received ? 5 : 0, point.received / max * 100)}%` }} /></div><small>{point.label}</small></div>; })}</div>
        <div className={styles.chartLegend}><span data-kind="charge">{e ? "Charged" : "Начислено"}</span><span data-kind="payment">{e ? "Received" : "Получено"}</span></div>
      </article>
    </section>

  </div>;
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) { return <article><p>{label}</p><strong>{value}</strong><span>{note}</span></article>; }

function formatMoney(amountMinor: number, currency: "USD" | "BYN" | "RUB", locale: "ru" | "en" = "ru"): string {
  return new Intl.NumberFormat(locale === "en" ? "en-US" : "ru-RU", { style: "currency", currency }).format(amountMinor / 100);
}
