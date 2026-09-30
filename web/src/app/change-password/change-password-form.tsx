"use client";

import { useActionState } from "react";
import { changePasswordAction, type ChangePasswordState } from "./actions";
import styles from "../login/login.module.css";
import { useLocale } from "@/i18n/provider";

const initialState: ChangePasswordState = {};

export function ChangePasswordForm() {
  const e = useLocale() === "en";
  const [state, action, pending] = useActionState(changePasswordAction, initialState);
  return <form action={action} className={styles.form}><label><span>{e?"New password":"Новый пароль"}</span><input name="password" type="password" autoComplete="new-password" minLength={14} required /></label><label><span>{e?"Repeat password":"Повторите пароль"}</span><input name="confirmation" type="password" autoComplete="new-password" minLength={14} required /></label>{state.error && <div className={styles.error} role="alert">{state.error}</div>}<button type="submit" disabled={pending}>{pending ? (e?"Saving…":"Сохраняем…") : (e?"Set password":"Установить пароль")}</button></form>;
}
