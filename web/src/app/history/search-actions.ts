"use server";
import {cookies} from "next/headers";
import {redirect} from "next/navigation";
import {encryptDatabaseValue} from "@/server/database/postgres";
import {requireRole} from "@/server/auth/session";
export async function searchHistoryAction(form:FormData) {
  const session=await requireRole("clinician");
  const query=String(form.get("q")??"").trim().slice(0,200);
  const jar=await cookies(),name=process.env.NODE_ENV==="production"?"__Host-anafix-history-search":"anafix-history-search";
  if(query)jar.set(name,Buffer.from(encryptDatabaseValue({query,userId:session.user.id,organizationId:session.user.organizationId,expiresAt:Date.now()+30*60_000},"clinical")).toString("base64url"),{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"strict",path:"/",maxAge:1800});
  else jar.set(name,"",{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"strict",path:"/",maxAge:0,expires:new Date(0)});
  const params=new URLSearchParams();
  const diagnosis=String(form.get("diagnosis")??"");
  if(["anaphylaxis","other"].includes(diagnosis))params.set("diagnosis",diagnosis);
  for(const key of ["from","to"]){const value=String(form.get(key)??"");if(/^\d{4}-\d{2}-\d{2}$/.test(value))params.set(key,value);}
  redirect(`/history${params.size?`?${params}`:""}`);
}
export async function resetHistoryAction() {
  await requireRole("clinician");
  (await cookies()).set(process.env.NODE_ENV==="production"?"__Host-anafix-history-search":"anafix-history-search","",{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"strict",path:"/",maxAge:0,expires:new Date(0)});
  redirect("/history");
}
