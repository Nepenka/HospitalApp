import Link from "next/link";
import type { ExaminationHistoryPage } from "@/server/examinations/repository";
import styles from "./history.module.css";
import { translate, type Locale } from "@/i18n/config";
import { DateRangePicker } from "./date-range-picker";

type Filters = { search: string; diagnosis: "all" | "anaphylaxis" | "other"; from: string; to: string };

function pageHref(filters: Filters, page: number): string {
  const params = new URLSearchParams();
  if (filters.search) params.set("q", filters.search);
  if (filters.diagnosis !== "all") params.set("diagnosis", filters.diagnosis);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  params.set("page", String(page));
  return `/history?${params}`;
}

export function HistoryTable({ history, filters, locale, today }: { history: ExaminationHistoryPage; filters: Filters; locale: Locale; today: string }) {
  const t = (text: string) => translate(locale, text);
  const hasFilters = Boolean(filters.search || filters.from || filters.to || filters.diagnosis !== "all");
  return <section className={styles.card}>
    <form className={styles.toolbar} action="/history" method="get">
      <label><span>{t("Поиск")}</span><input name="q" defaultValue={filters.search} maxLength={200} placeholder={t("Поиск по ФИО или аллергену")} /></label>
      <label><span>{t("Результат")}</span><select name="diagnosis" defaultValue={filters.diagnosis}><option value="all">{t("Все результаты")}</option><option value="anaphylaxis">{t("Анафилаксия подтверждена")}</option><option value="other">{t("Не подтверждена")}</option></select></label>
      <DateRangePicker initialFrom={filters.from} initialTo={filters.to} locale={locale} today={today} />
      <button className={styles.filterButton} type="submit"><span>{t("Найти")}</span></button>
      {hasFilters && <Link className={styles.clearLink} href="/history">{t("Сбросить")}</Link>}
    </form>
    <p className={styles.count}>{t("Найдено записей")}: {history.total}. {t("Даты указаны по времени Минска.")}</p>
    {history.items.length === 0 ? <div className={styles.empty}><strong>{t(hasFilters ? "Ничего не найдено" : "История пока пуста")}</strong><span>{t(hasFilters ? "Измените условия поиска." : "Завершите и сохраните первый осмотр.")}</span></div> : <div className={styles.tableWrap}>
      <table><thead><tr><th>{t("Пациент")}</th><th>{t("Дата")}</th><th>{t("Аллерген")}</th><th>{t("Степень")}</th><th>{t("Заключение")}</th><th><span className="srOnly">{t("Действие")}</span></th></tr></thead>
      <tbody>{history.items.map((item) => <tr key={item.id}>
        <td><strong>{item.patientName}</strong></td>
        <td>{new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "ru-RU", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Minsk" }).format(new Date(item.examinedAt))}</td>
        <td>{item.probableAllergen ?? t("Не указан")}</td>
        <td><span className={styles.grade} data-grade={item.severityGrade}>{item.severityGrade}</span></td>
        <td><span className={styles.status} data-confirmed={item.anaphylaxisConfirmed}>{t(item.anaphylaxisConfirmed ? "Подтверждена" : "Не подтверждена")}</span></td>
        <td><Link href={`/history/${item.id}`}>{t("Открыть")}</Link></td>
      </tr>)}</tbody></table>
    </div>}
    {history.totalPages > 1 && <nav className={styles.pagination} aria-label={t("Страницы истории")}>
      {history.page > 1 ? <Link href={pageHref(filters, history.page - 1)}>← {t("Назад")}</Link> : <span />}
      <span>{t("Страница")} {history.page} {t("из")} {history.totalPages}</span>
      {history.page < history.totalPages ? <Link href={pageHref(filters, history.page + 1)}>{t("Далее")} →</Link> : <span />}
    </nav>}
  </section>;
}
