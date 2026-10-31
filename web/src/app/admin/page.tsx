import { requireRole } from "@/server/auth/session";
import { getAdminDashboardData } from "@/server/admin/organizations";
import { AdminConsole } from "./admin-console";
import styles from "./admin.module.css";
import { getLocale } from "@/i18n/server";
import { translate } from "@/i18n/config";
import { AdminSidebar } from "./admin-sidebar";

export default async function AdminPage() {
  const [session, data, locale] = await Promise.all([requireRole("platform_admin"), getAdminDashboardData(), getLocale()]);
  return <main className={styles.page}>
    <AdminSidebar active="/admin" locale={locale} />
    <section className={styles.main}><header><div><p>{translate(locale,"Панель администратора")}</p><h1>{locale === "en" ? "Access management" : "Управление доступом"}</h1></div><div className={styles.account}><span>{session.user.displayName}</span><b>PA</b></div></header><AdminConsole data={data} /></section>
  </main>;
}
