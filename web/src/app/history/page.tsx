import Link from "next/link";
import { requireRole } from "@/server/auth/session";
import { searchExaminations } from "@/server/examinations/repository";
import { HistoryTable } from "./history-table";
import styles from "./history.module.css";
import { getLocale } from "@/i18n/server";
import { translate } from "@/i18n/config";

export const dynamic = "force-dynamic";

type HistorySearchParams = { deleted?: string; q?: string; diagnosis?: string; from?: string; to?: string; page?: string };
const validDate = (value: string | undefined) => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : "";
};

const minskDateKey = () => {
  const parts = new Intl.DateTimeFormat("en", { timeZone: "Europe/Minsk", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
};

export default async function HistoryPage({ searchParams }: { searchParams: Promise<HistorySearchParams> }) {
  const [session, locale] = await Promise.all([requireRole("clinician", "organization_owner"), getLocale()]);
  const query = await searchParams;
  const filters = {
    search: (query.q ?? "").slice(0, 200),
    diagnosis: (query.diagnosis === "anaphylaxis" || query.diagnosis === "other" ? query.diagnosis : "all") as "all" | "anaphylaxis" | "other",
    from: validDate(query.from),
    to: validDate(query.to),
  };
  const requestedPage = Number(query.page);
  const examinations = await searchExaminations(session.user, {
    ...filters,
    page: Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1,
  });

  return <main className={styles.page}>
    <header className={styles.header}>
      <div><p>АнаФикс</p><h1>{translate(locale, "История пациентов")}</h1><span>{translate(locale, "Сохранённые осмотры в пределах доступной организации")}</span></div>
      <Link className={styles.primaryLink} href="/">{translate(locale, "Новый осмотр")}</Link>
    </header>
    {query.deleted && <div className={styles.successNotice} role="status">{translate(locale, "Запись удалена из истории пациентов.")}</div>}
    <HistoryTable history={examinations} filters={filters} locale={locale} today={minskDateKey()} />
  </main>;
}
