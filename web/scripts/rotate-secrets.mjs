// Explicit maintenance operation. Never rotate keys on application startup.
import {readFile,writeFile,rename} from "node:fs/promises";
import path from "node:path";
import {randomBytes,randomUUID,createHash} from "node:crypto";
import {fileURLToPath} from "node:url";
import {credentials,localRoot,webRoot,run,clientFor,backup,verifyBackup} from "./windows-postgres.mjs";
const powershell=path.join(process.env.SystemRoot||"C:\\Windows","System32","WindowsPowerShell","v1.0","powershell.exe");
const planPath=path.join(localRoot,"secret-rotation.pending.dpapi"),envPath=path.join(localRoot,"website.env"),credentialsPath=path.join(localRoot,"postgres-credentials.dpapi");
export function rotationPlan(c){
 const previousIdentityKeys=[c.identityKey,...(c.previousIdentityKeys??[])],previousClinicalKeys=[c.clinicalKey,...(c.previousClinicalKeys??[])];
 if(previousIdentityKeys.length>8||previousClinicalKeys.length>8)throw new Error("HISTORICAL_KEYS_REQUIRE_REVIEW");
 return {...c,previousIdentityKeys,previousClinicalKeys,identityKey:randomBytes(48).toString("base64url"),clinicalKey:randomBytes(48).toString("base64url"),sessionSecret:randomBytes(48).toString("base64url"),rotatedAt:new Date().toISOString()};
}
async function protectedText(value){return run(powershell,["-NoProfile","-NonInteractive","-ExecutionPolicy","Bypass","-File",path.join(webRoot,"scripts","windows-secrets.ps1"),"protect"],{input:JSON.stringify(value)});}
async function readPlan(){return JSON.parse(await run(powershell,["-NoProfile","-NonInteractive","-ExecutionPolicy","Bypass","-File",path.join(webRoot,"scripts","windows-secrets.ps1"),"unprotect"],{input:await readFile(planPath,"utf8")}));}
function configuration(old,c){
 const settings={IDENTITY_DATA_KEY:c.identityKey,EXAMINATION_DATA_KEY:c.clinicalKey,AUTH_SESSION_SECRET:c.sessionSecret,IDENTITY_DATA_PREVIOUS_KEYS:JSON.stringify(c.previousIdentityKeys),EXAMINATION_DATA_PREVIOUS_KEYS:JSON.stringify(c.previousClinicalKeys)};
 let text=old;for(const [name,value] of Object.entries(settings)){const line=`${name}=${name.endsWith("PREVIOUS_KEYS")?`'${value}'`:value}`,pattern=new RegExp(`^${name}=.*$`,"m");text=pattern.test(text)?text.replace(pattern,line):`${text.trimEnd()}\n${line}\n`;}
 return text;
}
async function atomic(file,text){const temporary=`${file}.${randomUUID()}.tmp`;await writeFile(temporary,text,{flag:"wx",mode:0o600});await rename(temporary,file);}
async function stopped(c){const db=clientFor(c);await db.connect();try{if(Number((await db.query("SELECT count(*) AS n FROM pg_stat_activity WHERE usename='anafix_app' AND datname='anafix'")).rows[0].n)>0)throw new Error("WEBSITE_MUST_BE_STOPPED");}finally{await db.end();}}
export function envelopeKeyId(secret){return createHash("sha256").update(createHash("sha256").update(secret).digest()).digest("hex").slice(0,24);}
async function safeRollback(plan){
 const ids=[envelopeKeyId(plan.next.identityKey),envelopeKeyId(plan.next.clinicalKey)],db=clientFor(plan.old);await db.connect();
 try{for(const table of ["identity_record","auth_factor","examination","examination_revision","offline_conflict"]){
  if((await db.query(`SELECT 1 FROM anafix.${table} WHERE payload::jsonb->>'keyId'=ANY($1::text[]) LIMIT 1`,[ids])).rowCount)throw new Error("NEW_KEY_ALREADY_USED_NO_ROLLBACK");
 }}finally{await db.end();}
}
async function rebuild(c){await run(process.execPath,["--experimental-strip-types","scripts/database.mjs","rebuild-indexes"],{cwd:webRoot,env:{...process.env,DATABASE_URL:`postgresql://anafix_cluster_admin:${encodeURIComponent(c.adminPassword)}@127.0.0.1:55432/anafix`,DATABASE_SSL_MODE:"disable",IDENTITY_DATA_KEY:c.identityKey,EXAMINATION_DATA_KEY:c.clinicalKey,IDENTITY_DATA_PREVIOUS_KEYS:JSON.stringify(c.previousIdentityKeys??[]),EXAMINATION_DATA_PREVIOUS_KEYS:JSON.stringify(c.previousClinicalKeys??[])}});}
async function main(){
 const command=process.argv[2];
 if(command==="finish"){
  const plan=await readPlan(),current=await credentials();
  if(current.identityKey!==plan.next.identityKey)throw new Error("ROTATION_PLAN_DOES_NOT_MATCH");
  // Keep historical protected plans, never erase retained decryption keys.
  await rename(planPath,path.join(localRoot,`secret-rotation-${randomUUID()}.completed.dpapi`));
  console.log("Protected rotation plan archived. Confirm recovery-kit renewal and restart all processes before scheduling the next rotation.");return;
 }
 if(command==="prepare"){
  const old=await credentials(),oldEnvironment=await readFile(envPath,"utf8"),next=rotationPlan(old);
  await writeFile(planPath,await protectedText({version:1,old,next,oldEnvironment,newEnvironment:configuration(oldEnvironment,next)}),{flag:"wx",mode:0o600});
  const verified=await readPlan();if(verified.old.identityKey!==old.identityKey||verified.next.identityKey!==next.identityKey||verified.newEnvironment!==configuration(oldEnvironment,next))throw new Error("PROTECTED_PLAN_VERIFICATION_FAILED");
  console.log("Protected rotation plan prepared. Active keys unchanged. Stop all website processes, then apply during maintenance.");return;
 }
 if(!["apply","rollback"].includes(command)||!process.argv.includes("--confirm-maintenance"))throw new Error("EXPLICIT_MAINTENANCE_CONFIRMATION_REQUIRED");
 const plan=await readPlan();if(plan.version!==1)throw new Error("INVALID_ROTATION_PLAN");
 const current=await credentials();await stopped(current);
 if(command==="rollback"){
  // Permit retry after a partial apply; the protected plan remains available.
  if(![plan.old.identityKey,plan.next.identityKey].includes(current.identityKey))throw new Error("ROTATION_PLAN_DOES_NOT_MATCH");
  await safeRollback(plan);
  await atomic(envPath,plan.oldEnvironment);await atomic(credentialsPath,await protectedText(plan.old));await rebuild(plan.old);
  console.log("Previous configuration restored and search indexes rebuilt. Restart all website processes. Protected plan retained.");return;
 }
 if(current.identityKey!==plan.old.identityKey||await readFile(envPath,"utf8")!==plan.oldEnvironment)throw new Error("ROTATION_PLAN_DOES_NOT_MATCH");
 await backup();await verifyBackup();
 try{
  await atomic(envPath,plan.newEnvironment);await atomic(credentialsPath,await protectedText(plan.next));await rebuild(plan.next);
  const db=clientFor(plan.next);await db.connect();try{await db.query("INSERT INTO anafix.audit_event(id,category,occurred_at,actor_id,event,metadata) VALUES($1,'security',now(),'maintenance','secrets.rotated',$2)",[randomUUID(),JSON.stringify({timestamp:new Date().toISOString(),event:"secrets.rotated",outcome:"success",actorId:"maintenance"})]);}finally{await db.end();}
  console.log("Keys rotated. Historical decryption keys retained. Existing sessions and offline grants require a new online sign-in. Restart every website process. Create a new recovery kit before external backup use.");
 }catch(error){
  // Never restore a configuration that cannot decrypt post-rotation writes.
  await safeRollback(plan);
  await atomic(envPath,plan.oldEnvironment);await atomic(credentialsPath,await protectedText(plan.old));await rebuild(plan.old);
  throw error;
 }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(["HISTORICAL_KEYS_REQUIRE_REVIEW","WEBSITE_MUST_BE_STOPPED","EXPLICIT_MAINTENANCE_CONFIRMATION_REQUIRED","ROTATION_PLAN_DOES_NOT_MATCH","NEW_KEY_ALREADY_USED_NO_ROLLBACK","EEXIST"].includes(error.code||error.message)?error.code||error.message:"Secret rotation failed. Use the protected plan and maintenance rollback; do not share secrets.");process.exitCode=1;});
