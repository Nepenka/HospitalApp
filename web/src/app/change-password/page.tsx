import { redirect } from "next/navigation";
import { landingPath, readSession } from "@/server/auth/session";
import { ChangePasswordForm } from "./change-password-form";
import styles from "../login/login.module.css";
import { getLocale } from "@/i18n/server";

export default async function ChangePasswordPage() {
  const [session, locale] = await Promise.all([readSession(), getLocale()]);
  if (!session) redirect("/login");
  if (!session.user.mustChangePassword) redirect(landingPath(session.user));
  return <main className={styles.page}><section className={styles.card}><div className={styles.brand}><span>АФ</span><div><p>{locale==="en"?"Secure access":"Защищённый доступ"}</p><h1>АнаФикс</h1></div></div><div className={styles.intro}><h2>{locale==="en"?"Replace the temporary password":"Замените временный пароль"}</h2><p>{locale==="en"?"Set a personal password before your first sign-in.":"Перед первым входом нужно установить личный пароль."}</p></div><ChangePasswordForm /><footer>{locale==="en"?"Do not share your password with other employees.":"Пароль не передаётся другим сотрудникам."}</footer></section></main>;
}
