"use client";
import {useActionState} from "react";
import {markTestAction} from "./test-marker-actions";
import styles from "../history.module.css";
export function TestMarker({id,rowVersion,isTest,locale}:{id:string;rowVersion:number;isTest:boolean;locale:"ru"|"en"}){
 const [state,action,pending]=useActionState(markTestAction,{} as {error?:string}),e=locale==="en";
 return <form action={action} autoComplete="off"><input type="hidden" name="id" value={id}/><input type="hidden" name="rowVersion" value={rowVersion}/><input type="hidden" name="isTest" value={isTest?"no":"yes"}/>
  <p>{isTest?(e?"Explicitly marked as a test examination. An administrator may clear it from active history.":"Осмотр явно отмечен как тестовый. Администратор может убрать его из активной истории."):(e?"This is a real examination. Test marking must not be used for real patient records.":"Это реальный осмотр. Не помечайте реальные данные пациента как тестовые.")}</p>
  <label><input type="checkbox" name="confirm" value="yes" required/> {e?"I confirm the marking change":"Подтверждаю изменение отметки"}</label><button className={styles.clearLink} disabled={pending}>{isTest?(e?"Mark as real":"Снять тестовую отметку"):(e?"Mark as test":"Пометить как тестовый")}</button>
  {state.error&&<p role="alert">{state.error}</p>}
 </form>;
}
