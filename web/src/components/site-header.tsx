import Link from "next/link";
import { headers } from "next/headers";
import { readSession } from "@/server/auth/session";
import { logoutAction } from "@/app/login/actions";
import type { Locale } from "@/i18n/config";
import { LanguageSwitcher } from "./language-switcher";
import { HeaderNavigation, type HeaderLink } from "./site-header-navigation";
import { HeaderAccount } from "./site-header-account";
import styles from "./site-header.module.css";

export async function SiteHeader({ locale }: { locale: Locale }) {
  // The cached offline shell must remain anonymous, regardless of a login cookie.
  if ((await headers()).get("x-anafix-pathname") === "/offline") return null;
  const session = await readSession();
  const user = session?.user;
  const e = locale === "en";
  const links: HeaderLink[] = [];
  if (user && !user.mustChangePassword) {
    if (user.role === "platform_admin") {
      links.push({ href: "/admin", label: e ? "Overview" : "Обзор", exact: true }, { href: "/admin/organizations", label: e ? "Organizations" : "Организации" });
    } else if (user.role === "organization_owner") {
      links.push({ href: "/organization", label: e ? "Organization dashboard" : "Кабинет организации" });
    } else if (user.role === "clinician") {
      links.push({ href: "/", label: e ? "Examination" : "Осмотр", exact: true }, { href: "/history", label: e ? "Patient history" : "История пациентов" }, { href: "/offline", label: e ? "Offline" : "Без интернета", fullNavigation: true });
    }
  }
  const destination = !user ? "/login" : user.mustChangePassword ? "/change-password" : user.role === "platform_admin" ? "/admin" : user.role === "organization_owner" ? "/organization" : user.role === "billing_admin" ? "/forbidden" : "/";
  const roleLabels = { clinician: e ? "Clinician" : "Врач", organization_owner: e ? "Organization administrator" : "Администратор организации", platform_admin: e ? "Platform administrator" : "Администратор платформы", billing_admin: e ? "Billing administrator" : "Финансовый администратор" };

  return <header className={styles.bar} data-site-header="true">
    <div className={styles.inner}>
      <Link className={styles.brand} href={destination} aria-label={e ? "AnaFix home" : "АнаФикс — главная"}>
        <span className={styles.logo} aria-hidden="true">АФ</span><span className={styles.brandName}>АнаФикс</span>
      </Link>
      {links.length > 0 && <HeaderNavigation links={links} locale={locale} />}
      <div className={styles.tools}>
        <LanguageSwitcher />
        {user && <HeaderAccount displayName={user.displayName} roleLabel={roleLabels[user.role]} locale={locale}>
          <form action={logoutAction}><button className={styles.signOut} type="submit">{e ? "Sign out" : "Выйти из системы"}</button></form>
        </HeaderAccount>}
      </div>
    </div>
  </header>;
}
