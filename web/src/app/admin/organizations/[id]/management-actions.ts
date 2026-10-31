"use server";
import {requireRole} from "@/server/auth/session";
import {archiveOrganization,renameOrganization,getOrganization} from "@/server/identity/store";
import {clearTestExaminations} from "@/server/examinations/repository";
import {revalidatePath} from "next/cache";
import {getLocale} from "@/i18n/server";
export type ManagementState={error?:string;success?:string};
export async function manageOrganizationAction(_state:ManagementState,form:FormData):Promise<ManagementState>{
 const session=await requireRole("platform_admin"),e=(await getLocale())==="en";
 const id=String(form.get("organizationId")??""),operation=String(form.get("operation")??"");
 const organization=await getOrganization(id);if(!organization)return {error:e?"Organization not found.":"Организация не найдена."};
 try{
  if(operation==="rename")await renameOrganization(id,String(form.get("name")??""));
  else {
   if(form.get("confirm")!=="yes"||form.get("confirmationName")!==organization.name)throw new Error("CONFIRM_REQUIRED");
   if(operation==="archive")await archiveOrganization(id,session.user.id);
   else if(operation==="clear-test"){
    const count=await clearTestExaminations(id,session.user.id);revalidatePath("/","layout");
    return {success:e?`Test examinations removed from active history: ${count}. Revisions and audit retained.`:`Убрано из активной истории тестовых осмотров: ${count}. Версии и журнал сохранены.`};
   }else throw new Error("INVALID_OPERATION");
  }
  revalidatePath("/","layout");return {success:e?"Saved. Medical history, finances and audit are retained.":"Сохранено. Медицинская история, финансы и журнал сохранены."};
 }catch{return {error:e?"Check the name and confirmation. Duplicate names are not allowed.":"Проверьте название и подтверждение. Повторяющиеся названия не допускаются."};}
}
