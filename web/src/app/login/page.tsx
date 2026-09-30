import { redirect } from "next/navigation";
import { developmentLoginHint } from "@/server/auth/credentials";
import { landingPath, readSession } from "@/server/auth/session";
import { LoginForm } from "./login-form";
import styles from "./login.module.css";
import { getLocale } from "@/i18n/server";
import { translate } from "@/i18n/config";
export default async function LoginPage() {
  const locale = await getLocale();
  const session = await readSession();
  if (session) redirect(session.user.mustChangePassword ? "/change-password" : landingPath(session.user));
  return <main className={styles.page}><section className={styles.card}>
    <div className={styles.brand}><span>АФ</span><div><p>{translate(locale, "Защищённый доступ")}</p><h1>АнаФикс</h1></div></div>
    <div className={styles.intro}><h2>{translate(locale, "Вход в систему")}</h2><p>{translate(locale, "Доступ разрешён только зарегистрированным сотрудникам и администраторам организаций.")}</p></div>
    <LoginForm developmentHint={developmentLoginHint} />
    <footer>{locale === "en" ? "The session uses a protected HttpOnly cookie and expires automatically after 8 hours." : "Сессия защищена HttpOnly-cookie и автоматически завершается через 8 часов."}</footer>
  </section></main>;
}
