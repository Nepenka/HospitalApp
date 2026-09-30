import Link from "next/link";
import { logoutAction } from "@/app/login/actions";
import { requireRole } from "@/server/auth/session";
import { getAdminDashboardData } from "@/server/admin/organizations";
import { OrganizationManagement } from "./organization-management";
import styles from "../admin.module.css";
import { getLocale } from "@/i18n/server";
import { translate } from "@/i18n/config";

export const dynamic = "force-dynamic";

export default async function OrganizationsPage() {
  const [session, data, locale] = await Promise.all([requireRole("platform_admin"), getAdminDashboardData(), getLocale()]);
  return <main className={styles.page}>
    <aside className={styles.sidebar}><div className={styles.logo}><span>АФ</span><div><b>АнаФикс</b><small>{translate(locale,"Управление")}</small></div></div><nav><Link href="/admin">{translate(locale,"Обзор")}</Link><Link className={styles.active} href="/admin/organizations">{translate(locale,"Организации")}</Link></nav><div className={styles.sideFooter}><form action={logoutAction}><button>{translate(locale,"Выйти")}</button></form></div></aside>
    <section className={styles.main}><header><div><p>{translate(locale,"Панель администратора")}</p><h1>{translate(locale,"Организации")}</h1></div><div className={styles.account}><span>{session.user.displayName}</span><b>PA</b></div></header><OrganizationManagement data={data} /></section>
  </main>;
}
