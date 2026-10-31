import Link from "next/link";
import { requireRole } from "@/server/auth/session";
import { listBillingEntries, listOrganizations } from "@/server/identity/store";
import { getLocale } from "@/i18n/server";
import { AdminSidebar } from "../admin-sidebar";
import { BillingReadOnly } from "@/components/administration/billing-read-only";
import styles from "../admin.module.css";
import ui from "@/components/administration/administration.module.css";
export default async function FinancesPage() {
  await requireRole("platform_admin");
  const locale = await getLocale(); const e = locale === "en";
  const [entries, organizations] = await Promise.all([listBillingEntries(), listOrganizations()]);
  return <main className={styles.page}><AdminSidebar active="/admin/finances" locale={locale} /><section className={styles.main}><header><div><p>{e ? "Platform administration" : "Панель администратора"}</p><h1>{e ? "Finance" : "Финансы"}</h1></div></header><div className={styles.content}><section className={ui.card}><h2>{e ? "Record or correct a transaction" : "Внести или исправить операцию"}</h2><p>{e ? "Select an organization. Corrections void the original entry with a required reason; the original remains in history." : "Выберите организацию. Исправление аннулирует исходную операцию с обязательной причиной; исходная запись остаётся в истории."}</p><div className={ui.actions}>{organizations.map(o => <Link key={o.id} href={`/admin/organizations/${o.id}`}>{o.name}</Link>)}</div></section><BillingReadOnly entries={entries} locale={locale} organizationNames={Object.fromEntries(organizations.map(o => [o.id,o.name]))} /></div></section></main>;
}
