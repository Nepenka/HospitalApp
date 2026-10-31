import "server-only";
import {mkdir,readFile,writeFile,rename} from "node:fs/promises";
import path from "node:path";
import {newTotpSecret,verifyTotp,newRecoveryCodes,recoveryHash} from "@/domain/security/totp";
import {databaseClient,pgTransaction,usesPostgres,encryptDatabaseValue,decryptDatabaseValue} from "@/server/database/postgres";
import {insertDatabaseAudit} from "@/server/database/audit";
import type {SessionPayload,UserRole} from "./types";
type Factor={userId:string;secret:string;enabled:boolean;lastCounter:number;recoveryHashes:string[];pendingSessionId:string|null};
const file=process.env.MFA_STORE_PATH || path.join(process.cwd(),".data","mfa.enc");let queue:Promise<unknown>=Promise.resolve();
export function requiresMfa(role:UserRole):boolean{return role==="platform_admin"||role==="organization_owner";}
async function mutate<T>(session:SessionPayload,task:(factor:Factor|null)=>T|Promise<T>):Promise<T>{
  if(usesPostgres())return pgTransaction({kind:"identity"},async()=>{
    const rows=await databaseClient().query("SELECT payload FROM anafix.auth_factor WHERE user_id=$1 FOR UPDATE",[session.user.id]);
    const value=rows.rows[0]?decryptDatabaseValue<Factor>(rows.rows[0].payload,"identity"):null;
    const result=await task(value);
    if(value)await databaseClient().query("UPDATE anafix.auth_factor SET payload=$2 WHERE user_id=$1",[session.user.id,encryptDatabaseValue(value,"identity")]);
    return result;
  });
  const operation=queue.then(async()=>{let rows:Factor[]=[];try{rows=decryptDatabaseValue(await readFile(/* turbopackIgnore: true */ file,"utf8"),"identity");}catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;}
    const value=rows.find(r=>r.userId===session.user.id)??null;
    const result=await task(value);
    if(!value&&result&&typeof result==="object"&&"factor" in result)rows.push((result as {factor:Factor}).factor);
    await mkdir(path.dirname(file),{recursive:true});const temporary=`${file}.${process.pid}.tmp`;await writeFile(temporary,encryptDatabaseValue(rows,"identity"),{mode:0o600});await rename(temporary,file);return result;
  });queue=operation.catch(()=>{});return operation;
}
export async function prepareMfa(session:SessionPayload):Promise<{enabled:boolean;secret?:string}>{
  const result = await mutate(session,async factor=>{
    if(factor?.enabled)return {enabled:true};
    const value:Factor=factor??{userId:session.user.id,secret:newTotpSecret(),enabled:false,lastCounter:-1,recoveryHashes:[],pendingSessionId:session.sessionId};
    if(value.pendingSessionId!==session.sessionId){value.secret=newTotpSecret();value.pendingSessionId=session.sessionId;value.lastCounter=-1;}
    if(!factor&&usesPostgres())await databaseClient().query("INSERT INTO anafix.auth_factor(user_id,payload) VALUES($1,$2)",[session.user.id,encryptDatabaseValue(value,"identity")]);
    return {enabled:false,secret:value.secret,...(!factor&&!usesPostgres()?{factor:value}:{})};
  });
  return {enabled:result.enabled,...("secret" in result ? {secret:result.secret} : {})};
}
export async function confirmMfa(session:SessionPayload,code:string):Promise<{ok:boolean;recoveryCodes?:string[]}>{
  return mutate(session,async factor=>{
    if(!factor)return {ok:false};
    let recoveryCodes:string[]|undefined;
    if(!factor.enabled&&factor.pendingSessionId!==session.sessionId)return {ok:false};
    const counter=verifyTotp(factor.secret,code,factor.lastCounter);
    if(counter!==null){factor.lastCounter=counter;
      if(!factor.enabled){recoveryCodes=newRecoveryCodes();factor.recoveryHashes=recoveryCodes.map(recoveryHash);factor.enabled=true;factor.pendingSessionId=null;}
    }else{
      if(!factor.enabled||!/^([a-f0-9]{8}-){3}[a-f0-9]{8}$|^[a-f0-9]{32}$/i.test(code))return {ok:false};
      const index=factor.recoveryHashes.indexOf(recoveryHash(code));if(index<0)return {ok:false};factor.recoveryHashes.splice(index,1);
    }
    if(usesPostgres())await insertDatabaseAudit("security",{timestamp:new Date().toISOString(),event:recoveryCodes?"authentication.mfa_enabled":"authentication.mfa_verified",outcome:"success",actorId:session.user.id,organizationId:session.user.organizationId});
    return {ok:true,recoveryCodes};
  });
}
