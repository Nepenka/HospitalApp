import Link from "next/link";
import { redirect } from "next/navigation";
import ExaminationWizard from "@/components/clinical/ExaminationWizard";
import { logoutAction } from "@/app/login/actions";
import { requireSession } from "@/server/auth/session";
import styles from "./secure-shell.module.css";
import { getLocale } from "@/i18n/server";
import { translate } from "@/i18n/config";

export default async function HomePage() {
  const session = await requireSession();
  const locale = await getLocale();
  if (session.user.role === "platform_admin") redirect("/admin");
  if (session.user.role === "billing_admin") redirect("/forbidden");
  return <>
    <div className={styles.accountBar}>
      <div><span className={styles.statusDot} />{session.user.displayName}</div>
      <nav aria-label={locale === "en" ? "User menu" : "Пользовательское меню"}>
        <Link href="/history">{translate(locale, "История")}</Link>
        {session.user.role === "organization_owner" && <Link href="/organization">{translate(locale, "Организация")}</Link>}
        <form action={logoutAction}><button type="submit">{translate(locale, "Выйти")}</button></form>
      </nav>
    </div>
    <ExaminationWizard />
  </>;
}
