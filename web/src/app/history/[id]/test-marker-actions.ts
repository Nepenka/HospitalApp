"use server";
import {requireRole} from "@/server/auth/session";
import {setExaminationTest} from "@/server/examinations/repository";
import {revalidatePath} from "next/cache";
import {getLocale} from "@/i18n/server";
export async function markTestAction(_state:{error?:string},form:FormData):Promise<{error?:string}>{
 const session=await requireRole("clinician"),e=(await getLocale())==="en";
 const id=String(form.get("id")??"");
 try{
  if(form.get("confirm")!=="yes"||!["yes","no"].includes(String(form.get("isTest"))))throw new Error("CONFIRM_REQUIRED");
  await setExaminationTest(id,Number(form.get("rowVersion")),session.user,form.get("isTest")==="yes");
  revalidatePath(`/history/${id}`);return {};
 }catch{return {error:e?"Could not change the marking. Refresh the examination and confirm.":"Не удалось изменить отметку. Обновите осмотр и подтвердите действие."};}
}
