// Local-PC PostgreSQL lifecycle. Secrets never appear in arguments or console output.
import { mkdir, readFile, writeFile, copyFile, stat, unlink, rename, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID, createCipheriv, createDecipheriv, createHash, scryptSync } from "node:crypto";
import pg from "pg";
import {encryptArchive,decryptArchive,fileDigest} from "./backup-stream.mjs";

export const webRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
// AppData writes by packaged desktop apps can be virtualized and invisible to Task Scheduler.
// A dedicated non-OneDrive user-profile directory is shared by both execution contexts.
export const localRoot=path.join(process.env.USERPROFILE || "", "AnaFixServer");
export const bin=path.join(localRoot,"PostgreSQL18","pgsql","bin");
export const cluster=path.join(localRoot,"postgres-data-18");
export const backupRoot=path.join(localRoot,"backups");
const credentialsPath=path.join(localRoot,"postgres-credentials.dpapi");
const powershell=path.join(process.env.SystemRoot || "C:\\Windows","System32","WindowsPowerShell","v1.0","powershell.exe");
const port=55432;
export const tables=["identity_record","examination","offline_receipt","offline_conflict","audit_event","schema_migration","auth_factor","rate_limit","examination_revision","search_token","index_state"];
function requireWindows() {if(process.platform !== "win32" || !process.env.LOCALAPPDATA) throw new Error("WINDOWS_LOCAL_PROFILE_REQUIRED");}
export function run(executable,args,{input,env=process.env,cwd=webRoot}={}) {
  return new Promise((resolve,reject)=>{
    // The bundled PowerShell 7 module path is incompatible with Windows PowerShell 5.
    const childEnv=path.basename(executable).toLowerCase()==="powershell.exe" ? {...env,PSModulePath:path.join(process.env.SystemRoot || "C:\\Windows","System32","WindowsPowerShell","v1.0","Modules")} : env;
    const backgroundStart=path.basename(executable).toLowerCase()==="pg_ctl.exe" && args.includes("start");
    const child=spawn(executable,args,{cwd,env:childEnv,windowsHide:true,stdio:backgroundStart?"ignore":["pipe","pipe","pipe"]});
    let output="",errors="";
    child.stdout?.on("data",chunk=>{output+=chunk;});child.stderr?.on("data",chunk=>{errors+=chunk;});
    child.on("error",()=>reject(new Error("PROCESS_START_FAILED")));
    child.on("close",code=>code===0?resolve(output):reject(Object.assign(new Error("DATABASE_COMMAND_FAILED"),{exitCode:code,command:path.basename(executable),diagnostic:errors})));
    child.stdin?.end(input);
  });
}
export async function saveCredentials(value) {
  const protectedText=await run(powershell,["-NoProfile","-NonInteractive","-ExecutionPolicy","Bypass","-File",path.join(webRoot,"scripts","windows-secrets.ps1"),"protect"],{input:JSON.stringify(value)});
  await writeFile(credentialsPath,protectedText,{encoding:"utf8",mode:0o600,flag:"wx"});
}
export async function credentials() {
  requireWindows();
  return JSON.parse(await run(powershell,["-NoProfile","-NonInteractive","-ExecutionPolicy","Bypass","-File",path.join(webRoot,"scripts","windows-secrets.ps1"),"unprotect"],{input:await readFile(credentialsPath,"utf8")}));
}
export function urlFor(c,user="admin",database="anafix") {const password=user === "admin" ? c.adminPassword : user === "app" ? c.appPassword : c.backupPassword;const login=user === "admin" ? "anafix_cluster_admin" : user === "app" ? "anafix_app" : "anafix_backup";return `postgresql://${login}:${encodeURIComponent(password)}@127.0.0.1:${port}/${database}`;}
export function clientFor(c,user="admin",database="anafix") {return new pg.Client({connectionString:urlFor(c,user,database),connectionTimeoutMillis:5000});}
function secret() {return randomBytes(48).toString("base64url");}
function quote(value) {return `'${String(value).replaceAll("'","''")}'`;}
async function sourceConfig() {
  for(const name of [".env.local",".env"]) {try{process.loadEnvFile(path.join(webRoot,name));}catch(error){if(error.code !== "ENOENT")throw error;}}
  if(process.env.ANAFIX_LOCAL_ENV_PATH)process.loadEnvFile(process.env.ANAFIX_LOCAL_ENV_PATH);
  return {identity:process.env.IDENTITY_DATA_KEY || "development-identity-key-change-before-deploy-2026",clinical:process.env.EXAMINATION_DATA_KEY || "development-examination-key-change-before-deploy-2026",identityPath:process.env.IDENTITY_STORE_PATH || path.join(webRoot,".data","identities.enc"),clinicalPath:process.env.EXAMINATION_STORE_PATH || path.join(webRoot,".data","examinations.enc")};
}
async function setup() {
  requireWindows(); await mkdir(localRoot,{recursive:true});
  const identitySid=(await run(powershell,["-NoProfile","-NonInteractive","-Command","[Security.Principal.WindowsIdentity]::GetCurrent().User.Value"])).trim();
  await run("icacls.exe",[localRoot,"/inheritance:r","/grant:r",`*${identitySid}:(OI)(CI)F`,"*S-1-5-18:(OI)(CI)F"]);
  let c;
  try {c=await credentials();}catch(error){
    if(error.code !== "ENOENT") throw error;
    const source=await sourceConfig();
    c={version:1,adminPassword:secret(),appPassword:secret(),backupPassword:secret(),backupKey:secret(),identityKey:secret(),clinicalKey:secret(),sessionSecret:process.env.AUTH_SESSION_SECRET || secret(),sourceIdentityKey:source.identity,sourceClinicalKey:source.clinical,sourceIdentityPath:source.identityPath,sourceClinicalPath:source.clinicalPath,createdAt:new Date().toISOString()};
    await saveCredentials(c);
  }
  try {await stat(path.join(cluster,"PG_VERSION"));}
  catch(error){
    if(error.code !== "ENOENT")throw error;
    const passwordFile=path.join(localRoot,`initdb-${randomUUID()}.password`);
    await writeFile(passwordFile,`${c.adminPassword}\n`,{flag:"wx",mode:0o600});
    try {await run(path.join(bin,"initdb.exe"),["-D",cluster,"-U","anafix_cluster_admin","--pwfile",passwordFile,"--auth=scram-sha-256","--encoding=UTF8","--locale-provider=builtin","--locale=C","--data-checksums","-c","listen_addresses=127.0.0.1","-c",`port=${port}`,"-c","password_encryption=scram-sha-256","-c","max_connections=60","-c","log_statement=none","-c","log_min_error_statement=panic","-c","log_parameter_max_length=0","-c","log_parameter_max_length_on_error=0"]);}
    finally {await unlink(passwordFile);}
  }
  await start();
  const client=clientFor(c,"admin","postgres");await client.connect();
  try {
    for(const [name,password] of [["anafix_app",c.appPassword],["anafix_backup",c.backupPassword]]) {
      const exists=(await client.query("SELECT 1 FROM pg_roles WHERE rolname=$1",[name])).rowCount;
      if(!exists)await client.query(`CREATE ROLE ${name} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD ${quote(password)}`);
    }
    for(const name of ["anafix","anafix_test"]) if(!(await client.query("SELECT 1 FROM pg_database WHERE datname=$1",[name])).rowCount) await client.query(`CREATE DATABASE ${name} OWNER anafix_cluster_admin TEMPLATE template0`);
    for(const name of ["anafix","anafix_test"]) {
      await client.query(`REVOKE ALL ON DATABASE ${name} FROM PUBLIC`);
      await client.query(`GRANT CONNECT ON DATABASE ${name} TO anafix_app,anafix_backup`);
    }
  } finally {await client.end();}
  const database=clientFor(c);await database.connect();
  try {await database.query("REVOKE CREATE ON SCHEMA public FROM PUBLIC");}finally{await database.end();}
  console.log("PostgreSQL cluster and dedicated roles/databases ready (loopback only, SCRAM, checksums). Credentials protected by Windows DPAPI.");
}
export async function start() {
  requireWindows();
  try {await run(path.join(bin,"pg_ctl.exe"),["-D",cluster,"status"]);console.log("PostgreSQL is running.");return;}catch{/* Start only our registered cluster, never an unrelated instance. */}
  await run(path.join(bin,"pg_ctl.exe"),["-D",cluster,"-l",path.join(localRoot,"postgres-server.log"),"-w","-t","30","start"]);
  console.log("PostgreSQL started on 127.0.0.1:55432.");
}
export async function migrate(c) {
    const databaseEnv={...process.env,DATABASE_URL:urlFor(c),DATABASE_SSL_MODE:"disable",IDENTITY_DATA_KEY:c.identityKey,EXAMINATION_DATA_KEY:c.clinicalKey,IDENTITY_DATA_PREVIOUS_KEYS:JSON.stringify(c.previousIdentityKeys??[]),EXAMINATION_DATA_PREVIOUS_KEYS:JSON.stringify(c.previousClinicalKeys??[])};
    await run(process.execPath,["--experimental-strip-types","scripts/database.mjs","migrate"],{env:databaseEnv});
  const client=clientFor(c);await client.connect();
  try {
    await client.query("REVOKE ALL ON SCHEMA anafix FROM PUBLIC");
    await client.query("GRANT USAGE ON SCHEMA anafix TO anafix_app,anafix_backup");
    for(const table of tables.filter(table=>table !== "schema_migration")) {
        const rights=["examination_revision","index_state"].includes(table)?"SELECT":table==="audit_event"?"SELECT,INSERT":table==="examination"?"SELECT,INSERT,UPDATE":"SELECT,INSERT,UPDATE,DELETE";
      await client.query(`REVOKE ALL ON anafix.${table} FROM anafix_app`);
      await client.query(`GRANT ${rights} ON anafix.${table} TO anafix_app`);
    }
    await client.query("GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA anafix TO anafix_app");
    await client.query("GRANT SELECT ON ALL SEQUENCES IN SCHEMA anafix TO anafix_backup");
    await client.query("GRANT SELECT ON ALL TABLES IN SCHEMA anafix TO anafix_backup");
    await client.query("ALTER DEFAULT PRIVILEGES IN SCHEMA anafix GRANT SELECT ON TABLES TO anafix_backup");
  }finally{await client.end();}
    await run(process.execPath,["--experimental-strip-types","scripts/database.mjs","rebuild-indexes"],{env:databaseEnv});
}
async function presentTables(client) {return (await client.query("SELECT tablename FROM pg_tables WHERE schemaname='anafix'")).rows.map(r=>r.tablename).filter(t=>tables.includes(t)).sort();}
export async function counts(client) {const result={};for(const table of await presentTables(client))result[table]=Number((await client.query(`SELECT count(*) AS n FROM anafix.${table}`)).rows[0].n);return result;}
export async function snapshotDigest(client) {
  const result={};
  for(const table of await presentTables(client)) {
    const hash=createHash("sha256"),cursor=`digest_${randomUUID().replaceAll("-","")}`;
    await client.query(`DECLARE ${cursor} NO SCROLL CURSOR WITH HOLD FOR SELECT to_jsonb(t)::text AS row FROM anafix.${table} t ORDER BY to_jsonb(t)::text`);
    try{while(true){const rows=(await client.query(`FETCH 200 FROM ${cursor}`)).rows;if(!rows.length)break;for(const row of rows)hash.update(row.row).update("\n");}}finally{await client.query(`CLOSE ${cursor}`);}
    result[table]=hash.digest("hex");
  }
  return result;
}
export async function verifyAuditChain(client){
  if(!(await client.query("SELECT 1 FROM information_schema.columns WHERE table_schema='anafix' AND table_name='audit_event' AND column_name='entry_hash'")).rowCount)return;
  const invalid=await client.query("SELECT count(*) AS n FROM (SELECT *,lag(entry_hash,1,'genesis') OVER (ORDER BY sequence_id) AS expected_previous FROM anafix.audit_event) t WHERE previous_hash IS DISTINCT FROM expected_previous OR entry_hash IS DISTINCT FROM encode(sha256(convert_to(previous_hash || jsonb_build_object('id',id,'category',category,'at',occurred_at,'organization',organization_id,'actor',actor_id,'event',event,'metadata',metadata)::text,'UTF8')),'hex')");
  if(Number(invalid.rows[0].n)!==0)throw new Error("AUDIT_CHAIN_INVALID");
}
async function connectApplication() {
  const c=await credentials();await start();await migrate(c);
  const client=clientFor(c);await client.connect();
  let before;try{before=await counts(client);}finally{await client.end();}
  const copyDir=path.join(localRoot,"pre-migration",new Date().toISOString().replace(/[:.]/g,"-"));await mkdir(copyDir,{recursive:true});
  const sourceFiles=[c.sourceIdentityPath,c.sourceClinicalPath,process.env.SECURITY_AUDIT_PATH || path.join(webRoot,".data","security-audit.jsonl"),process.env.EXPORT_AUDIT_PATH || path.join(webRoot,".data","examination-export-audit.jsonl")];
  for(const [index,file] of sourceFiles.entries()) {try{await copyFile(file,path.join(copyDir,`${index}-${path.basename(file)}`));}catch(error){if(error.code !== "ENOENT")throw error;}}
  if(tables.filter(table=>table !== "schema_migration").every(table=>before[table]===0)) {
    const env={...process.env,DATABASE_URL:urlFor(c),DATABASE_SSL_MODE:"disable",IDENTITY_DATA_KEY:c.identityKey,EXAMINATION_DATA_KEY:c.clinicalKey,FILE_IDENTITY_DATA_KEY:c.sourceIdentityKey,FILE_EXAMINATION_DATA_KEY:c.sourceClinicalKey,IDENTITY_STORE_PATH:c.sourceIdentityPath,EXAMINATION_STORE_PATH:c.sourceClinicalPath};
    console.log((await run(process.execPath,["--experimental-strip-types","scripts/database.mjs","import-files","--preserve-orphans"],{env})).trim());
    await run(process.execPath,["--experimental-strip-types","scripts/database.mjs","import-files","--preserve-orphans","--confirm"],{env});
  }
  const verify=clientFor(c,"app");await verify.connect();
  try {
    const row=(await verify.query("SELECT payload FROM anafix.identity_record WHERE kind='organizations' LIMIT 1")).rows[0];
    if(!row)throw new Error("EMPTY_IDENTITY_DATABASE");
    const {decryptDatabaseValue}=await import("../src/server/database/postgres.ts");process.env.IDENTITY_DATA_KEY=c.identityKey;process.env.EXAMINATION_DATA_KEY=c.clinicalKey;
    decryptDatabaseValue(row.payload,"identity");
    const record=(await verify.query("SELECT payload FROM anafix.examination LIMIT 1")).rows[0];if(record)decryptDatabaseValue(record.payload,"clinical");
    console.log(`Migrated counts: ${JSON.stringify(await countsAdmin(c))}`);
  }finally{await verify.end();}
  const envPath=path.join(webRoot,".env.local"),privateEnv=path.join(localRoot,"website.env");
  let previous="";try{previous=await readFile(envPath,"utf8");await copyFile(envPath,path.join(copyDir,"previous.env.local"));}catch(error){if(error.code !== "ENOENT")throw error;}
  const settings={STORAGE_BACKEND:"postgres",DATABASE_URL:urlFor(c,"app"),DATABASE_SSL_MODE:"disable",IDENTITY_DATA_KEY:c.identityKey,EXAMINATION_DATA_KEY:c.clinicalKey,AUTH_SESSION_SECRET:c.sessionSecret,BACKUP_STATUS_PATH:path.join(localRoot,"backup-status.json"),POSTGRES_BIN_PATH:bin,OFFLINE_ACCESS_HOURS:"48"};
  // Do not automatically enable offline or invent a production origin/admin password.
  let text="";
  for(const [key,value] of Object.entries(settings)) {
    const expression=new RegExp(`^${key}=.*$`,"m"),line=`${key}=${JSON.stringify(value)}`;
    text=expression.test(text)?text.replace(expression,()=>line):`${text}${text.endsWith("\n")||!text?"":"\n"}${line}\n`;
  }
  if(!/^OFFLINE_ENABLED=/m.test(text))text+="OFFLINE_ENABLED=false\n";
  // Secret configuration must not be synchronized with the project by OneDrive.
  await writeFile(`${privateEnv}.new`,text,{mode:0o600});await rename(`${privateEnv}.new`,privateEnv);
  let publicConfig=previous;
  for(const key of Object.keys(settings))publicConfig=publicConfig.replace(new RegExp(`^${key}=.*(?:\\r?\\n|$)`,"gm"),"");
  publicConfig=publicConfig.replace(/^ANAFIX_LOCAL_ENV_PATH=.*(?:\r?\n|$)/gm,"");
  publicConfig+=`${publicConfig.endsWith("\n")||!publicConfig?"":"\n"}ANAFIX_LOCAL_ENV_PATH=${JSON.stringify(privateEnv)}\n`;
  await writeFile(`${envPath}.new`,publicConfig,{mode:0o600});await rename(`${envPath}.new`,envPath);
  console.log("Application configured for PostgreSQL with a non-superuser runtime role. Original files retained. Restart the website; prior development sessions may require sign-in again.");
}
async function daily(force=false) {
  await start();
  try {
    const report=JSON.parse(await readFile(path.join(localRoot,"backup-status.json"),"utf8"));
    if(!force && report.status === "success" && report.restored === true && new Date(report.completedAt).toDateString()===new Date().toDateString()) {console.log("Verified backup for today exists; daily task skipped.");return;}
  }catch{/* Missing/invalid status requires a new backup. */}
  await backup();await verifyBackup();
}
async function schedule() {
  await run(powershell,["-NoProfile","-NonInteractive","-ExecutionPolicy","Bypass","-File",path.join(webRoot,"scripts","windows-postgres-schedule.ps1"),"-NodePath",process.execPath]);
  console.log("Per-user database autostart and daily backup/restore-check tasks configured. Runs while this Windows user is signed in; missed runs catch up.");
}
async function countsAdmin(c){const client=clientFor(c);await client.connect();try{return await counts(client);}finally{await client.end();}}
function pgEnvironment(c,user="backup",database="anafix") {return {...process.env,PGHOST:"127.0.0.1",PGPORT:String(port),PGDATABASE:database,PGUSER:user === "backup" ? "anafix_backup" : "anafix_cluster_admin",PGPASSWORD:user === "backup" ? c.backupPassword : c.adminPassword,PGSSLMODE:"disable",PGCONNECT_TIMEOUT:"5"};}
async function updateBackupStatus(status,extra={}) {
  const target=path.join(localRoot,"backup-status.json"),temporary=`${target}.${randomUUID()}.tmp`;
  await writeFile(temporary,JSON.stringify({status,completedAt:new Date().toISOString(),...extra}),{mode:0o600});await rename(temporary,target);
}
export async function backup() {
  const c=await credentials();await start();await mkdir(backupRoot,{recursive:true});
  const stamp=new Date().toISOString().replace(/[:.]/g,"-"),raw=path.join(backupRoot,`work-${randomUUID()}.dump`),destination=path.join(backupRoot,`anafix-${stamp}.backup.enc`);
  try {
    const source=clientFor(c,"backup");await source.connect();
    let hashes,totals,auditTimeZone;
    try {
      await source.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      auditTimeZone=(await source.query("SHOW TimeZone")).rows[0].TimeZone;
      const snapshot=(await source.query("SELECT pg_export_snapshot() AS snapshot")).rows[0].snapshot;
      hashes=await snapshotDigest(source);totals=await counts(source);
      await run(path.join(bin,"pg_dump.exe"),["-Fc","--no-owner","--no-acl",`--snapshot=${snapshot}`,"--file",raw],{env:pgEnvironment(c)});
      await source.query("COMMIT");
    }catch(error){await source.query("ROLLBACK").catch(()=>{});throw error;}finally{await source.end();}
    const createdAt=new Date().toISOString();
    await encryptArchive(raw,destination,{createdAt,keys:{identity:c.identityKey,clinical:c.clinicalKey,session:c.sessionSecret,previousIdentity:c.previousIdentityKeys??[],previousClinical:c.previousClinicalKeys??[]},database:"anafix",auditTimeZone,hashes,counts:totals},c.backupKey);
    const checked=path.join(backupRoot,`verify-${randomUUID()}.dump`);
    try{await decryptArchive(destination,checked,c.backupKey);if(await fileDigest(raw)!==await fileDigest(checked))throw new Error("BACKUP_VERIFICATION_FAILED");}finally{await unlink(checked).catch(()=>{});}
    await run(path.join(bin,"pg_restore.exe"),["--list",raw]);
    await updateBackupStatus("success",{completedAt:createdAt,archive:path.basename(destination),bytes:(await stat(destination)).size,offsite:false,restored:false});
    console.log(`Encrypted backup created and archive checked: ${path.basename(destination)}. No automatic deletion.`);
    return destination;
  }catch(error){await updateBackupStatus("failure").catch(()=>{});throw error;}
  finally{await unlink(raw).catch(()=>{});}
}
export async function verifyBackup(recoveredCredentials) {
  const c=recoveredCredentials || await credentials();await start();
  const files=(await readdir(backupRoot)).filter(name=>/^anafix-.*\.backup\.enc$/.test(name)).sort();if(!files.length)throw new Error("BACKUP_REQUIRED");
  const database=`anafix_restore_${randomUUID().replaceAll("-","")}_test`,raw=path.join(backupRoot,`restore-${randomUUID()}.dump`);
  const admin=clientFor(c,"admin","postgres");
  let created=false,payload;
  try {
    payload=await decryptArchive(path.join(backupRoot,files.at(-1)),raw,c.backupKey);
    await admin.connect();
    await admin.query(`CREATE DATABASE ${database} TEMPLATE template0`);
    created=true;
    await admin.query(`REVOKE ALL ON DATABASE ${database} FROM PUBLIC`);
    await run(path.join(bin,"pg_restore.exe"),["--single-transaction","--exit-on-error","--no-owner","--no-acl","--dbname",database,raw],{env:pgEnvironment(c,"admin",database)});
    const restored=clientFor(c,"admin",database);await restored.connect();
    try {
        if(typeof payload.auditTimeZone==="string")await restored.query("SELECT set_config('TimeZone',$1,false)",[payload.auditTimeZone]);
        await verifyAuditChain(restored);
        const digest=await snapshotDigest(restored),expected=payload.hashes;
      if(JSON.stringify(digest)!==JSON.stringify(expected))throw new Error("RESTORE_DIFFERS_FROM_LIVE_SNAPSHOT");
      // Real decryption test of every sensitive row, using keys inside the archive.
      process.env.IDENTITY_DATA_KEY=payload.keys.identity;process.env.EXAMINATION_DATA_KEY=payload.keys.clinical;
      process.env.IDENTITY_DATA_PREVIOUS_KEYS=JSON.stringify(payload.keys.previousIdentity??[]);process.env.EXAMINATION_DATA_PREVIOUS_KEYS=JSON.stringify(payload.keys.previousClinical??[]);
      const {decryptDatabaseValue}=await import("../src/server/database/postgres.ts");
      const available=await presentTables(restored);
      for(const [table,kind] of [["identity_record","identity"],["auth_factor","identity"],["examination","clinical"],["offline_conflict","clinical"],["examination_revision","clinical"]])if(available.includes(table)){
        const cursor=`decrypt_${randomUUID().replaceAll("-","")}`;await restored.query(`DECLARE ${cursor} NO SCROLL CURSOR WITH HOLD FOR SELECT payload FROM anafix.${table}`);
        try{while(true){const rows=(await restored.query(`FETCH 200 FROM ${cursor}`)).rows;if(!rows.length)break;for(const row of rows)decryptDatabaseValue(row.payload,kind);}}finally{await restored.query(`CLOSE ${cursor}`);}
      }
      await updateBackupStatus("success",{completedAt:payload.createdAt,archive:files.at(-1),restored:true,verifiedAt:new Date().toISOString(),offsite:false,counts:await counts(restored)});
      console.log("Backup restored into a separate test database: every table hash matches and all encrypted rows decrypt. Live database unchanged.");
    }finally{await restored.end();}
  }catch(error){
    await updateBackupStatus("failure",{completedAt:payload?.createdAt??null,archive:files.at(-1),restored:false,offsite:false}).catch(()=>{});
    throw error;
  }finally{
    // Exact database created by this operation only; never DROP the live database.
    if(created)await admin.query(`DROP DATABASE ${database}`).catch(()=>console.error("Own temporary restore database needs cleanup."));await admin.end().catch(()=>{});await unlink(raw).catch(()=>{});
  }
}
async function recoveryKit() {
  const c=await credentials(),kitPath=path.join(localRoot,"recovery-kit.enc"),codePath=path.join(localRoot,"recovery-code.txt");
  let envelope,code;
  try {envelope=JSON.parse(await readFile(kitPath,"utf8"));code=(await readFile(codePath,"utf8")).trim();}
  catch(error){
    if(error.code !== "ENOENT")throw error;
    const salt=randomBytes(16),iv=randomBytes(12);code=secret();
    const cipher=createCipheriv("aes-256-gcm",scryptSync(code,salt,32),iv);
    const encrypted=Buffer.concat([cipher.update(JSON.stringify(c),"utf8"),cipher.final()]);
    envelope={version:1,salt:salt.toString("base64"),iv:iv.toString("base64"),tag:cipher.getAuthTag().toString("base64"),ciphertext:encrypted.toString("base64")};
    // Separate recovery code: never put it in the backup directory or print it in chat/logs.
    await writeFile(codePath,`${code}\n`,{flag:"wx",mode:0o600});
    await writeFile(kitPath,JSON.stringify(envelope),{flag:"wx",mode:0o600});
  }
  if(envelope.version !== 1)throw new Error("INVALID_RECOVERY_KIT");
  const decipher=createDecipheriv("aes-256-gcm",scryptSync(code,Buffer.from(envelope.salt,"base64"),32),Buffer.from(envelope.iv,"base64"));decipher.setAuthTag(Buffer.from(envelope.tag,"base64"));
  const restored=JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext,"base64")),decipher.final()]).toString("utf8"));
    if(JSON.stringify(restored)!==JSON.stringify(c)){
      if(!process.argv.includes("--renew"))throw new Error("RECOVERY_KIT_KEYS_MISMATCH_USE_RENEW");
      const salt=randomBytes(16),iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",scryptSync(code,salt,32),iv);
      const encrypted=Buffer.concat([cipher.update(JSON.stringify(c),"utf8"),cipher.final()]);
      const next={version:1,salt:salt.toString("base64"),iv:iv.toString("base64"),tag:cipher.getAuthTag().toString("base64"),ciphertext:encrypted.toString("base64")};
      const check=createDecipheriv("aes-256-gcm",scryptSync(code,salt,32),iv);check.setAuthTag(cipher.getAuthTag());
      if(JSON.stringify(JSON.parse(Buffer.concat([check.update(encrypted),check.final()]).toString("utf8")))!==JSON.stringify(c))throw new Error("RECOVERY_KIT_VERIFICATION_FAILED");
      const staged=path.join(localRoot,`recovery-kit-${randomUUID()}.tmp`);
      await writeFile(staged,JSON.stringify(next),{flag:"wx",mode:0o600});
      const previous=path.join(localRoot,`recovery-kit-${randomUUID()}.previous.enc`);
      await rename(kitPath,previous);
      try{await rename(staged,kitPath);}catch(error){await rename(previous,kitPath);throw error;}
      // Preserve the old encrypted kit and separate recovery code for old archives.
      await verifyBackup(c);
      console.log("Recovery kit renewed and verified; previous encrypted kit retained. Recovery code unchanged and not printed.");return;
    }
  // Restore test gets its keys from the portable kit, not from Windows DPAPI.
  await verifyBackup(restored);
  console.log("Portable encrypted recovery kit verified. Store recovery-code.txt separately/offline; keep recovery-kit.enc with the external backup copy. Neither has been uploaded.");
}
async function testProcesses() {
  const c=await credentials();await start();
  await run(process.execPath,["--experimental-strip-types","scripts/test-postgres.mjs"],{env:{...process.env,DATABASE_TEST_URL:urlFor(c,"admin","anafix_test"),DATABASE_SSL_MODE:"disable"}});
  console.log("Independent PostgreSQL process/version/rollback test passed.");
}
const direct=process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(direct) {
  try {
    const command=process.argv[2];
    if(command === "setup")await setup();else if(command === "start")await start();else if(command === "migrate")await migrate(await credentials());else if(command === "connect")await connectApplication();else if(command === "backup")await backup();else if(command === "verify-backup")await verifyBackup();else if(command === "recovery-kit")await recoveryKit();else if(command === "daily")await daily();else if(command === "daily-force")await daily(true);else if(command === "schedule")await schedule();else if(command === "test")await testProcesses();else if(command === "check"){const c=await credentials();const client=clientFor(c);await client.connect();try{console.log(JSON.stringify({version:(await client.query("SELECT version() AS version")).rows[0].version,counts:await counts(client),settings:(await client.query("SELECT name,setting FROM pg_settings WHERE name IN ('listen_addresses','port','password_encryption','data_checksums')")).rows}));}finally{await client.end();}}else throw new Error("UNKNOWN_COMMAND");
  }catch(error){
    if(error.diagnostic)await writeFile(path.join(localRoot,"last-operation-error.txt"),error.diagnostic,{mode:0o600}).catch(()=>{});
    console.error(`Local PostgreSQL operation failed: ${error.code || error.message || "UNKNOWN"}${error.command ? ` (${error.command}, exit ${error.exitCode})` : ""}`);process.exitCode=1;
  }
}
