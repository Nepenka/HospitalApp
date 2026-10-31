"use client";
import {useActionState} from "react";
import {manageOrganizationAction,type ManagementState} from "./management-actions";
import {useTranslations} from "@/i18n/provider";
import styles from "@/components/administration/administration.module.css";
export function ManagementConsole({id,name,archived}:{id:string;name:string;archived:boolean}){
 const {locale}=useTranslations(),e=locale==="en";
 return <section className={styles.card}><h2>{e?"Organization management":"Управление организацией"}</h2>
  <Operation id={id} name={name} operation="rename" title={e?"Rename hospital":"Переименовать больницу"}/>
  {archived?<p>{e?"Archived: sign-in and licenses disabled. Data retained.":"Архив: вход и лицензии отключены. Данные сохранены."}</p>:<Operation id={id} name={name} operation="archive" title={e?"Archive organization":"Архивировать организацию"}/>}
  <p>{e?"Cleanup affects only examinations explicitly marked as test by a clinician. Real records, finances, revisions and audit are not deleted.":"Очистка убирает из активной истории только осмотры, явно отмеченные врачом как тестовые. Реальные записи, финансы, версии и журнал не удаляются."}</p>
  <Operation id={id} name={name} operation="clear-test" title={e?"Clear test examinations":"Очистить тестовые осмотры"}/>
 </section>;
}
function Operation({id,name,operation,title}:{id:string;name:string;operation:string;title:string}){
 const {locale}=useTranslations(),e=locale==="en",[state,action,pending]=useActionState(manageOrganizationAction,{} as ManagementState);
 return <form action={action} className={styles.form} autoComplete="off"><input type="hidden" name="organizationId" value={id}/><input type="hidden" name="operation" value={operation}/>
  {operation==="rename"?<label>{e?"Hospital name":"Название больницы"}<input name="name" defaultValue={name} minLength={2} maxLength={200} required/></label>:<><label>{e?"Enter the exact hospital name":"Введите точное название больницы"}<input name="confirmationName" maxLength={200} required/></label><label className={styles.check}><input type="checkbox" name="confirm" value="yes" required/>{e?"I confirm this operation":"Подтверждаю операцию"}</label></>}
  <button className={styles.primary} disabled={pending}>{title}</button>{state.error&&<p role="alert" className={styles.error}>{state.error}</p>}{state.success&&<p role="status" className={styles.success}>{state.success}</p>}
 </form>;
}
