"use client";
import {useActionState} from "react";
import Link from "next/link";
import {mfaAction,type MfaState} from "./actions";
import styles from "../login/login.module.css";
export function MfaForm({locale}:{locale:"ru"|"en"}){
 const e=locale==="en",[state,action,pending]=useActionState(mfaAction,{} as MfaState);
 if(state.recoveryCodes)return <div className={styles.form}><p>{e?"Save these one-time recovery codes separately from your password. They are shown only once.":"Сохраните одноразовые резервные коды отдельно от пароля. Они показаны только один раз."}</p><pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{state.recoveryCodes.join("\n")}</pre><Link href={state.nextPath!}>{e?"Saved — continue":"Сохранил — продолжить"}</Link></div>;
 return <form action={action} className={styles.form} autoComplete="off">
  {!state.secret&&state.enabled===undefined&&<button name="operation" value="setup" disabled={pending}>{e?"Continue with authenticator":"Продолжить с аутентификатором"}</button>}
  {state.secret&&<><p>{e?"Add a new account manually in your authenticator app: AnaFix, time-based code (TOTP). Do not share this key.":"Добавьте учётную запись вручную в приложении-аутентификаторе: АнаФикс, код по времени (TOTP). Не передавайте этот ключ другим."}</p><code style={{overflowWrap:"anywhere"}}>{state.secret}</code></>}
  {(state.secret||state.enabled)&&<><label><span>{e?"Authenticator or recovery code":"Код аутентификатора или резервный код"}</span><input name="code" autoComplete="one-time-code" maxLength={40} required autoFocus /></label><button name="operation" value="verify" disabled={pending}>{e?"Verify":"Подтвердить"}</button></>}
  {state.error&&<p role="alert" className={styles.error}>{state.error}</p>}
 </form>;
}
