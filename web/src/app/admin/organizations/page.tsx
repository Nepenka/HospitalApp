import { requireRole } from "@/server/auth/session";
import {organizationList} from "@/server/admin/organization-list";
import { OrganizationManagement } from "./organization-management";
import styles from "../admin.module.css";
import { getLocale } from "@/i18n/server";
import { translate } from "@/i18n/config";
import { AdminSidebar } from "../admin-sidebar";

export const dynamic = "force-dynamic";

export default async function OrganizationsPage({searchParams}:{searchParams:Promise<{q?:string;page?:string}>}) {
  const session=await requireRole("platform_admin");
  const query=await searchParams;
  const [data, locale] = await Promise.all([organizationList(query.q,Number(query.page??1)), getLocale()]);
  return <main className={styles.page}>
    <AdminSidebar active="/admin/organizations" locale={locale} />
    <section className={styles.main}><header><div><p>{translate(locale,"Панель администратора")}</p><h1>{translate(locale,"Организации")}</h1></div><div className={styles.account}><span>{session.user.displayName}</span><b>PA</b></div></header><OrganizationManagement data={data} /></section>
  </main>;
}
