"use client";
import { useActionState } from "react";
import { loginAction, type LoginState } from "./actions";
import styles from "./login.module.css";
import { useTranslations } from "@/i18n/provider";
const initialState: LoginState = {};
export function LoginForm({ developmentHint }: { developmentHint: { login: string; password: string } | null }) {
  const { locale, t } = useTranslations();
  const [state, action, pending] = useActionState(loginAction, initialState);
  return <form action={action} className={styles.form}>
    <label><span>{t("Логин")}</span><input name="login" type="text" autoComplete="username" pattern="[a-z0-9-]{4,64}" required /></label>
    <label><span>{t("Пароль")}</span><input name="password" type="password" autoComplete="current-password" minLength={12} required /></label>
    {state.error && <div className={styles.error} role="alert">{state.error}</div>}
    <button type="submit" disabled={pending}>{pending ? (locale === "en" ? "Checking…" : "Проверяем…") : t("Войти")}</button>
    {developmentHint && <aside><strong>{locale === "en" ? "Local access" : "Локальный доступ"}</strong><span>{developmentHint.login}</span><code>{developmentHint.password}</code></aside>}
  </form>;
}
