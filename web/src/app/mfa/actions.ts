"use server";
import {redirect} from "next/navigation";
import {readSession,createSession,landingPath,destroySession} from "@/server/auth/session";
import {prepareMfa,confirmMfa,requiresMfa} from "@/server/auth/mfa";
import {consumeRateLimit} from "@/server/security/rate-limit";
import {getLocale} from "@/i18n/server";
export type MfaState={error?:string;secret?:string;enabled?:boolean;recoveryCodes?:string[];nextPath?:string};
export async function mfaAction(_state:MfaState,form:FormData):Promise<MfaState>{
 const session=await readSession(true);if(!session)redirect("/login");
 if(!requiresMfa(session.user.role))redirect(landingPath(session.user));
 const e=(await getLocale())==="en";
 if(!(await consumeRateLimit("mfa",session.user.id,5,5*60_000)))return {enabled:true,error:e?"Too many attempts. Try again in five minutes.":"Слишком много попыток. Повторите через пять минут."};
 if(form.get("operation")==="setup")return prepareMfa(session);
 const result=await confirmMfa(session,String(form.get("code")??"").trim());
 if(!result.ok)return {...await prepareMfa(session),error:e?"Invalid or already used code.":"Код неверный или уже использован."};
 await destroySession();await createSession(session.user,true);
 const nextPath=session.user.mustChangePassword?"/change-password":landingPath(session.user);
 if(result.recoveryCodes)return {recoveryCodes:result.recoveryCodes,nextPath};
 redirect(nextPath);
}
