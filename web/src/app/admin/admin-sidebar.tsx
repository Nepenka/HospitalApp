import Link from "next/link";
import { logoutAction } from "@/app/login/actions";
import { LanguageSwitcher } from "@/components/language-switcher";
import type { Locale } from "@/i18n/config";
import styles from "./admin.module.css";
export function AdminSidebar({ active, locale }: { active: string; locale: Locale }) {
  const e = locale === "en";
  const links = [["/admin", e ? "Overview" : "Обзор"], ["/admin/organizations", e ? "Organizations" : "Организации"], ["/admin/licenses", e ? "Licenses" : "Лицензии"], ["/admin/finances", e ? "Finance" : "Финансы"], ["/admin/security", e ? "Security" : "Безопасность"], ["/admin/system", e ? "System status" : "Состояние системы"]];
  return <aside className={styles.sidebar}><div className={styles.logo}><span>АФ</span><div><b>АнаФикс</b><small>{e ? "Management" : "Управление"}</small></div></div><nav aria-label={e ? "Platform administration" : "Управление платформой"}>{links.map(([href,label]) => <Link key={href} className={href === active ? styles.active : undefined} href={href} aria-current={href === active ? "page" : undefined}>{label}</Link>)}</nav><div className={styles.sideFooter}><LanguageSwitcher /><form action={logoutAction}><button>{e ? "Sign out" : "Выйти"}</button></form></div></aside>;
}
