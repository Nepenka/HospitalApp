import assert from "node:assert/strict";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import pg from "pg";
import {totp} from "../src/domain/security/totp.ts";

const tempDir = await mkdtemp(path.join(os.tmpdir(), "anafix-export-smoke-"));
const policyPending = process.argv.includes("--offline-policy-pending");
const postgresMode = process.argv.includes("--postgres");
let testDatabase;
if (postgresMode) {
  if (!process.env.DATABASE_TEST_URL || !decodeURIComponent(new URL(process.env.DATABASE_TEST_URL).pathname).endsWith("_test")) throw new Error("DEDICATED_TEST_DATABASE_REQUIRED");
  testDatabase = new pg.Client({ connectionString: process.env.DATABASE_TEST_URL });
  await testDatabase.connect();
  const empty = await testDatabase.query("SELECT count(*) AS n FROM anafix.identity_record");
  assert.equal(Number(empty.rows[0].n), 0, "HTTP test requires an empty dedicated test DB");
}
const secret = "test-session-secret-at-least-thirty-two-characters";
const dataKey = "test-examination-key-at-least-thirty-two-characters";
const storePath = path.join(tempDir, "examinations.enc");
const auditPath = path.join(tempDir, "export-audit.jsonl");
const identityPath = path.join(tempDir, "identities.enc");
const examinationId = "11111111-1111-4111-8111-111111111111";
const now = new Date().toISOString();
const check = (title) => ({ key: "primary", title, status: "confirmed", summary: "Подтверждена", criteria: [{ id: "one", label: "Синтетический критерий", met: true, details: "Для проверки PDF" }] });
const record = {
  id: examinationId, organizationId: "test-organization", patient: { id: "synthetic-patient", fullName: "Тестовый Пациент" },
  probableAllergen: "Тестовый аллерген", allergenContact: "yes", acuteOnset: "yes", examinedAt: now,
  physicianComment: "Уточнение тестового врача\nОтдельная строка", reactionDate: "2026-09-30", reactionTime: "14:20",
  createdAt: now, createdBy: "test-clinician", updatedAt: now, updatedBy: "test-clinician", rowVersion: 1,
  deletedAt: null, deletedBy: null, algorithmVersion: "test", catalogVersion: "test", selectedSymptoms: [],
  vitals: { age: { years: 18, months: 0 }, systolicBP: 110, diastolicBP: 70, spO2: 98, heartRate: 80, respiratoryRate: 18, gcs: 15 },
  severity: { grade: 1 }, conclusion: { primary: check("АнаФикс"), niaid: check("NIAID"), wao: check("WAO"), anyConfirmed: true, text: "Синтетическое заключение для проверки PDF." },
};
const iv = randomBytes(12);
const cipher = createCipheriv("aes-256-gcm", createHash("sha256").update(dataKey).digest(), iv);
const legacy = { ...record, id: "22222222-2222-4222-8222-222222222222" };
delete legacy.physicianComment;
delete legacy.reactionDate;
delete legacy.reactionTime;
const ciphertext = Buffer.concat([cipher.update(JSON.stringify([record, legacy]), "utf8"), cipher.final()]);
await writeFile(storePath, JSON.stringify({ version: 1, iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), ciphertext: ciphertext.toString("base64") }));
function encryptTestStore(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", createHash("sha256").update(dataKey).digest(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return JSON.stringify({ version: 1, iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), ciphertext: ciphertext.toString("base64") });
}
async function readTestStore(file, complete = false) {
  if (postgresMode) {
    const decrypt = (raw,kind="clinical") => {
      const envelope = JSON.parse(raw), decipher = createDecipheriv("aes-256-gcm", createHash("sha256").update(dataKey).digest(), Buffer.from(envelope.iv,"base64"));
      if(envelope.version===2)decipher.setAAD(Buffer.from(`anafix-envelope-v2:${kind}:${envelope.keyId}`));
      decipher.setAuthTag(Buffer.from(envelope.tag,"base64"));
      return JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext,"base64")),decipher.final()]).toString("utf8"));
    };
    if (file === identityPath) {
      const value = { version: 1, organizations: [], accounts: [], sessions: [], billingEntries: [], devices: [] };
      for (const row of (await testDatabase.query("SELECT kind,payload FROM anafix.identity_record ORDER BY id")).rows) value[row.kind].push(decrypt(row.payload,"identity"));
      // Preserve fixture order for assertions; newly created accounts follow fixtures.
      for (const [kind, order] of [["organizations",["test-organization","other-organization"]],["accounts",testAccounts.map(a=>a.id)]]) value[kind].sort((a,b)=>(order.indexOf(a.id)<0?999:order.indexOf(a.id))-(order.indexOf(b.id)<0?999:order.indexOf(b.id)));
      return value;
    }
    const records = (await testDatabase.query("SELECT payload FROM anafix.examination ORDER BY id")).rows.map(row=>decrypt(row.payload,"clinical"));
    if (!complete) return records;
    return { version: 2, records, receipts: (await testDatabase.query("SELECT payload FROM anafix.offline_receipt ORDER BY operation_id")).rows.map(row=>row.payload), conflicts: (await testDatabase.query("SELECT payload FROM anafix.offline_conflict ORDER BY id")).rows.map(row=>decrypt(row.payload)) };
  }
  const envelope = JSON.parse(await readFile(file, "utf8"));
  const decipher = createDecipheriv("aes-256-gcm", createHash("sha256").update(dataKey).digest(), Buffer.from(envelope.iv, "base64"));
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
  const parsed = JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, "base64")), decipher.final()]).toString("utf8"));
  return !complete && parsed.version === 2 && Array.isArray(parsed.records) ? parsed.records : parsed;
}
async function writeIdentityFixture(value) {
  if (!postgresMode) return writeFile(identityPath,encryptTestStore(value));
  for (const [kind,rows] of Object.entries(value)) if (Array.isArray(rows)) for (const row of rows) await testDatabase.query("UPDATE anafix.identity_record SET payload=$3 WHERE kind=$1 AND id=$2",[kind,row.id,encryptTestStore(row)]);
}
async function auditText(file) {
  if (!postgresMode) return readFile(file,"utf8");
  const category=file === auditPath ? "export" : "security";
  return (await testDatabase.query("SELECT metadata FROM anafix.audit_event WHERE category=$1 ORDER BY occurred_at,id",[category])).rows.map(row=>JSON.stringify(row.metadata)).join("\n");
}
// Deliberately omit the policy field to verify default migration of existing hospitals.
const testAccounts = [
  ["test-clinician", "test-organization", "clinician", "Synthetic doctor"],
  ["test-owner", "test-organization", "organization_owner", "Synthetic owner"],
  ["other-clinician", "other-organization", "clinician", "Foreign doctor"],
  ["test-billing", "test-organization", "billing_admin", "Synthetic billing"],
  ["managed-clinician", "test-organization", "clinician", "Managed doctor"],
].map(([id,organizationId,role,displayName]) => ({ id, organizationId, role, displayName, login: id, status: "active", createdAt: now, lastLoginAt: null, passwordHash: "synthetic-not-used", mustChangePassword: false }));
const testSessions = [...testAccounts, { id: "platform-admin", organizationId: null, role: "platform_admin" }].map(user => ({ id: `test-${user.id}`, userId: user.id, organizationId: user.organizationId, role: user.role, createdAt: now, expiresAt: new Date(Date.now() + 3600_000).toISOString(), revokedAt: null, ...(["platform_admin","organization_owner"].includes(user.role)?{mfaVerifiedAt:Math.floor(Date.parse(now)/1000)}:{}) }));
for(let i=1;i<=3;i++)testSessions.push({id:`pending-mfa-${i}`,userId:"platform-admin",organizationId:null,role:"platform_admin",createdAt:now,expiresAt:new Date(Date.now()+600_000).toISOString(),revokedAt:null});
await writeFile(identityPath, encryptTestStore({ version: 1, organizations: [
  { id: "test-organization", name: "Synthetic hospital", code: "test", status: "active", createdAt: now, license: { offlineAllowed: true, offlineHours: 48 } },
  { id: "other-organization", name: "Foreign hospital", code: "other", status: "active", createdAt: now },
], accounts: testAccounts, sessions: testSessions, billingEntries: [] }));
if (postgresMode) {
  const importer=spawn(process.execPath,["--experimental-strip-types","scripts/database.mjs","import-files","--confirm"],{env:{...process.env,DATABASE_URL:process.env.DATABASE_TEST_URL,DATABASE_SSL_MODE:"disable",IDENTITY_DATA_KEY:dataKey,EXAMINATION_DATA_KEY:dataKey,FILE_IDENTITY_DATA_KEY:dataKey,FILE_EXAMINATION_DATA_KEY:dataKey,IDENTITY_STORE_PATH:identityPath,EXAMINATION_STORE_PATH:storePath,EXPORT_AUDIT_PATH:auditPath,SECURITY_AUDIT_PATH:path.join(tempDir,"security.jsonl")},windowsHide:true,stdio:"ignore"});
  await new Promise((resolve,reject)=>{importer.on("error",reject);importer.on("exit",code=>code===0?resolve():reject(new Error("POSTGRES_FIXTURE_IMPORT_FAILED")));});
}
const manifest = JSON.parse(await readFile(".next/server/server-reference-manifest.json", "utf8"));
function actionId(name) {
  const entry = Object.entries(manifest.node).find(([, action]) => action.exportedName === name);
  assert.ok(entry, `Missing action: ${name}`);
  return entry[0];
}

const port = await new Promise((resolve, reject) => {
  const server = createServer();
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => { const address = server.address(); server.close(() => resolve(address.port)); });
});
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(port), "-H", "127.0.0.1"], {
  cwd: process.cwd(), env: { ...process.env, STORAGE_BACKEND: postgresMode ? "postgres" : "files", DATABASE_URL: postgresMode ? (process.env.DATABASE_TEST_APP_URL || process.env.DATABASE_TEST_URL) : "", DATABASE_SSL_MODE:"disable", NODE_ENV: "production", AUTH_SESSION_SECRET: secret, EXAMINATION_DATA_KEY: dataKey, EXAMINATION_STORE_PATH: storePath, IDENTITY_DATA_KEY: dataKey, IDENTITY_STORE_PATH: identityPath, EXPORT_AUDIT_PATH: auditPath, SECURITY_AUDIT_PATH: path.join(tempDir, "security.jsonl"), MFA_STORE_PATH:path.join(tempDir,"mfa.enc"), BACKUP_STATUS_PATH: "", OFFLINE_ENABLED: "true", OFFLINE_ACCESS_HOURS: policyPending ? "" : "48", APP_ORIGIN: `http://127.0.0.1:${port}` },
  stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
});
let serverOutput = "";
server.stdout.on("data", (chunk) => { serverOutput += chunk.toString(); });
server.stderr.on("data", (chunk) => { serverOutput += chunk.toString(); });
const secondPort=postgresMode ? await new Promise(resolve=>{const s=createServer();s.listen(0,"127.0.0.1",()=>{const p=s.address().port;s.close(()=>resolve(p));});}) : port;
const secondServer=postgresMode ? spawn(process.execPath,["node_modules/next/dist/bin/next","start","-p",String(secondPort),"-H","127.0.0.1"],{cwd:process.cwd(),env:{...process.env,STORAGE_BACKEND:"postgres",DATABASE_URL:process.env.DATABASE_TEST_APP_URL || process.env.DATABASE_TEST_URL,DATABASE_SSL_MODE:"disable",NODE_ENV:"production",AUTH_SESSION_SECRET:secret,EXAMINATION_DATA_KEY:dataKey,IDENTITY_DATA_KEY:dataKey,OFFLINE_ENABLED:"true",OFFLINE_ACCESS_HOURS:"48",APP_ORIGIN:`http://127.0.0.1:${secondPort}`},windowsHide:true,stdio:"ignore"}) : null;
let actionSequence=0;

function cookie(organizationId, role = "clinician", credentialVersion = 1, accountId) {
  const id = accountId ?? (role === "platform_admin" ? "platform-admin" : role === "organization_owner" ? "test-owner" : role === "billing_admin" ? "test-billing" : organizationId === "other-organization" ? "other-clinician" : "test-clinician");
  if (role === "billing_admin") organizationId = "test-organization";
  const payload = { user: { id, role, organizationId, credentialVersion, displayName: "Тест", mustChangePassword: false }, sessionId: `test-${id}`, issuedAt: Math.floor(Date.now() / 1000), expiresAt: Math.floor(Date.now() / 1000) + 3600, ...(["platform_admin","organization_owner"].includes(role)?{mfaVerifiedAt:Math.floor(Date.parse(now)/1000)}:{}) };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret).update(body).digest("base64url");
  return `__Host-anafix-session=${body}.${signature}`;
}

async function callAction(name, args, route = "/", sessionCookie = cookie("test-organization")) {
  // Alternate independent HTTP processes, including both concurrent comment changes.
  const origin = `http://127.0.0.1:${postgresMode && actionSequence++ % 2 ? secondPort : port}`;
  const response = await fetch(`${origin}${route}`, {
    method: "POST", redirect: "manual",
    headers: { "Next-Action": actionId(name), Accept: "text/x-component", Cookie: sessionCookie, Origin: origin, ...(args instanceof FormData ? {} : { "Content-Type": "text/plain;charset=UTF-8" }) },
    body: args instanceof FormData ? args : JSON.stringify(args),
  });
  const raw = await response.text();
  assert.ok(response.status < 500, `Action ${name} failed: ${raw}`);
  const values = raw.split("\n").flatMap((line) => { try { return [JSON.parse(line.slice(line.indexOf(":") + 1))]; } catch { return []; } });
  const value = values.find((item) => item && typeof item === "object" && ("ok" in item || "success" in item || "error" in item || "enabled" in item || "recoveryCodes" in item));
  return { response, value, raw };
}

function retentionArgs(years) {
  const args = new FormData();
  args.set("_1_organizationId", "test-organization");
  args.set("_1_retentionYears", String(years));
  // Nested fields precede the root model when decoded from a streaming multipart request.
  args.set("0", JSON.stringify([{}, "$K1"]));
  return args;
}
function formArgs(fields) {
  const form = new FormData();
  for (const [key,value] of Object.entries(fields)) form.set(`_1_${key}`, String(value));
  form.set("0", JSON.stringify([{}, "$K1"]));
  return form;
}
function pendingMfaCookie(number){
 const payload={user:{id:"platform-admin",role:"platform_admin",organizationId:null,displayName:"Synthetic",mustChangePassword:false},sessionId:`pending-mfa-${number}`,issuedAt:Math.floor(Date.now()/1000),expiresAt:Math.floor(Date.now()/1000)+600};
 const body=Buffer.from(JSON.stringify(payload)).toString("base64url");return `__Host-anafix-session=${body}.${createHmac("sha256",secret).update(body).digest("base64url")}`;
}

try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error(`Server exited: ${serverOutput}`);
    try { const response = await fetch(`http://127.0.0.1:${port}/login`, { redirect: "manual" }); if (response.status < 500) { ready = true; break; } } catch { /* server starting */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(ready, `Server did not start: ${serverOutput}`);
  if(secondServer) {
    let ready2=false;
    for(let i=0;i<100;i++){try{const r=await fetch(`http://127.0.0.1:${secondPort}/login`);if(r.status<500){ready2=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
    assert.ok(ready2,"Second independent server did not start");
  }
  if(process.argv.includes("--browser"))await import("./browser-checks.mjs").then(m=>m.browserChecks({port,cookie,examinationId}));
  const pendingAdmin=await fetch(`http://127.0.0.1:${port}/admin`,{headers:{Cookie:pendingMfaCookie(1)},redirect:"manual"});
  assert.equal(pendingAdmin.headers.get("location"),"/mfa","Password-only administrator must not enter administration");
  const setup=await callAction("mfaAction",formArgs({operation:"setup"}),"/mfa",pendingMfaCookie(1));
  assert.match(setup.value.secret,/^[A-Z2-7]{32}$/);
  assert.ok(!("factor" in setup.value),"Internal factor state must not reach the client");
  const code=totp(setup.value.secret,Math.floor(Date.now()/30_000));
  const confirmed=await callAction("mfaAction",formArgs({operation:"verify",code}),"/mfa",pendingMfaCookie(1));
  assert.equal(confirmed.value.recoveryCodes.length,10);
  const replay=await callAction("mfaAction",formArgs({operation:"verify",code}),"/mfa",pendingMfaCookie(2));
  assert.ok(replay.value.error,"TOTP cannot be replayed in another session/process");
  const recovery=confirmed.value.recoveryCodes[0];
  const reused=await Promise.all([2,3].map(n=>callAction("mfaAction",formArgs({operation:"verify",code:recovery}),"/mfa",pendingMfaCookie(n))));
  assert.equal(reused.filter(r=>Boolean(r.value?.error)).length,1,"A recovery code can be consumed only once, even concurrently");
  const passwords=[];
  for(let n=0;n<6;n++)passwords.push(await callAction("loginAction",formArgs({login:"rate-test",password:"synthetic-wrong-password"}),"/login",""));
  assert.match(passwords[5].value.error,/Слишком много|Too many/);
  if(postgresMode){
    const before=Number((await testDatabase.query("SELECT count(*) AS n FROM anafix.audit_event")).rows[0].n);
    await testDatabase.query("BEGIN");
    await testDatabase.query("UPDATE anafix.examination SET row_version=row_version+1 WHERE id=$1",[examinationId]);
    await testDatabase.query("ROLLBACK");
    assert.equal(Number((await testDatabase.query("SELECT count(*) AS n FROM anafix.audit_event")).rows[0].n),before,"Audit rolls back with the business change");
    const restricted=new pg.Client({connectionString:process.env.DATABASE_TEST_APP_URL});await restricted.connect();
    try{
      await assert.rejects(restricted.query("UPDATE anafix.audit_event SET event='tampered'"));
      await assert.rejects(restricted.query("DELETE FROM anafix.examination_revision"));
      await assert.rejects(restricted.query("DELETE FROM anafix.examination"));
      await assert.rejects(restricted.query("UPDATE anafix.index_state SET ready=false"));
    }finally{await restricted.end();}
    const chain=await testDatabase.query("SELECT count(*) AS n FROM (SELECT previous_hash,lag(entry_hash,1,'genesis') OVER (ORDER BY sequence_id) AS expected FROM anafix.audit_event) t WHERE previous_hash<>expected OR previous_hash IS NULL");
    assert.equal(Number(chain.rows[0].n),0,"Concurrent events retain valid audit chain order");
  }
  console.log("Mandatory administrator MFA, one-time TOTP/recovery codes, shared login throttling, transactional rollback and append-only permissions: OK");
  const privateArgs=new FormData();privateArgs.set("_1_q","Тестовый аллерген");privateArgs.set("0",JSON.stringify(["$K1"]));
  const privateSearch=await callAction("searchHistoryAction",privateArgs,"/history");
  const searchCookie=privateSearch.response.headers.getSetCookie().find(c=>c.startsWith("__Host-anafix-history-search="));
  assert.ok(searchCookie&&searchCookie.includes("HttpOnly")&&searchCookie.includes("Secure"));
  assert.ok(!searchCookie.includes("Тестовый"));assert.ok(!privateSearch.response.headers.get("x-action-redirect")?.includes("q="));
  const searchResult=await fetch(`http://127.0.0.1:${port}/history`,{headers:{Cookie:`${cookie("test-organization")}; ${searchCookie.split(";")[0]}`}});
  assert.equal(searchResult.status,200);assert.match(await searchResult.text(),/Тестовый Пациент/);
  const resetSearch=await callAction("resetHistoryAction",[],"/history");
  assert.ok(resetSearch.response.headers.getSetCookie().some(c=>c.startsWith("__Host-anafix-history-search=")&&c.includes("Secure")&&c.includes("Max-Age=0")));
  console.log("Private POST history search and secure cookie reset: OK");
  for (const [route, role, locale, expectedLinks, activeLink] of [
    ["/", "clinician", "ru", ["/", "/history", "/offline"], "/"],
    ["/organization", "organization_owner", "en", ["/organization"], "/organization"],
    ["/forbidden", "billing_admin", "ru", [], null],
    ["/login", null, "en", [], null],
  ]) {
    const sessionCookie = role ? cookie(role === "platform_admin" || role === "billing_admin" ? null : "test-organization", role) : "";
    const response = await fetch(`http://127.0.0.1:${port}${route}`, { headers: { Cookie: `${sessionCookie}; anafix-locale=${locale}` }, redirect: "manual" });
    assert.equal(response.status, 200, `Header page ${route}`);
    const html = await response.text();
    const headers = [...html.matchAll(/<header\b[^>]*data-site-header="true"[^>]*>([\s\S]*?)<\/header>/g)];
    assert.equal(headers.length, 1, "Online pages have one shared site header");
    const header = headers[0][1];
    const navigation = header.match(/<nav\b[^>]*>([\s\S]*?)<\/nav>/)?.[1] ?? "";
    const links = [...navigation.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>/g)];
    assert.deepEqual(links.map((link) => link[1]), expectedLinks, `Navigation respects role ${role}`);
    assert.deepEqual(links.filter((link) => link[0].includes('aria-current="page"')).map((link) => link[1]), activeLink ? [activeLink] : [], "Only the current section is highlighted");
    assert.equal(header.includes('data-header-account="true"'), Boolean(role), "Only authenticated users have an account menu");
    if (role) assert.ok(header.includes(locale === "en" ? "Sign out" : "Выйти из системы"));
    assert.ok(header.includes("RU") && header.includes("EN"), "Language controls are integrated in the header");
    if (locale === "en" && expectedLinks.includes("/history")) assert.ok(header.includes("Patient history"));
  }
  for (const locale of ["ru", "en"]) {
    for (const route of ["/admin", "/admin/organizations", "/admin/organizations/test-organization", "/admin/licenses", "/admin/finances", "/admin/security", "/admin/system"]) {
      const response = await fetch(`http://127.0.0.1:${port}${route}`, { headers: { Cookie: `${cookie(null, "platform_admin")}; anafix-locale=${locale}` }, redirect: "manual" });
      assert.equal(response.status, 200, `Admin page ${route}`);
      const html = await response.text();
      assert.ok(!/<header\b[^>]*data-site-header="true"/.test(html), "Management has no duplicated top navigation");
      const sidebar = html.match(/<aside\b[^>]*>([\s\S]*?)<\/aside>/)?.[1];
      assert.ok(sidebar, "Admin sidebar is preserved");
      const navigation = sidebar.match(/<nav\b[^>]*>([\s\S]*?)<\/nav>/)?.[1] ?? "";
      assert.deepEqual([...navigation.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>/g)].map((link) => link[1]), ["/admin", "/admin/organizations", "/admin/licenses", "/admin/finances", "/admin/security", "/admin/system"]);
      assert.ok(sidebar.includes("RU") && sidebar.includes("EN"), "Admin language controls remain accessible in sidebar");
      assert.ok(sidebar.includes(locale === "en" ? "Sign out" : "Выйти"), "Admin can still sign out");
      assert.ok(!html.includes("Тестовый Пациент") && !html.includes("Синтетическое заключение"), "Platform pages contain no medical content");
    }
  }
  for (const tab of ["overview", "staff", "billing", "security", "settings"]) {
    const response = await fetch(`http://127.0.0.1:${port}/organization?tab=${tab}&organizationId=other-organization`, { headers: { Cookie: cookie("test-organization", "organization_owner") } });
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.ok(html.includes("Synthetic hospital"));
    assert.ok(!html.includes("Foreign hospital") && !html.includes("Foreign doctor") && !html.includes("Тестовый Пациент"), "Organization dashboard is tenant scoped and contains no medical data");
  }
  for (const role of ["organization_owner", "platform_admin"]) {
    const auth = cookie(role === "platform_admin" ? null : "test-organization", role);
    for (const route of ["/history", `/history/${examinationId}`, `/history/${examinationId}/edit`]) {
      const response = await fetch(`http://127.0.0.1:${port}${route}`, { headers: { Cookie: auth }, redirect: "manual" });
      assert.equal(response.status, 307);
      assert.equal(response.headers.get("location"), "/forbidden");
    }
    assert.equal((await fetch(`http://127.0.0.1:${port}/history/${examinationId}/pdf`, { headers: { Cookie: auth } })).status, 404);
    assert.equal((await fetch(`http://127.0.0.1:${port}/api/offline`, { headers: { Cookie: auth } })).status, 401);
    const deniedSave = await callAction("saveExamination", [{}], "/", auth);
    assert.ok(deniedSave.response.headers.get("x-action-redirect")?.includes("/forbidden"));
  }
  for (const [route, expectedTime, locale] of [["/", "", "ru"], [`/history/${examinationId}/edit`, "14:20", "ru"], [`/history/${examinationId}/edit`, "14:20", "en"]]) {
    const page = await fetch(`http://127.0.0.1:${port}${route}`, { headers: { Cookie: `${cookie("test-organization")}; anafix-locale=${locale}` }, redirect: "manual" });
    assert.equal(page.status, 200);
    const html = await page.text();
    const stepForm = html.match(/<form[^>]*data-examination-steps="true"[^>]*>([\s\S]*?)<\/form>/)?.[0];
    assert.ok(stepForm, "Step navigation has an explicit form owner");
    assert.ok(/<form[^>]*autoComplete="off"/i.test(stepForm), "Firefox must not restore stale disabled step states");
    const stepButtons = [...stepForm.matchAll(/<button\b[^>]*>/g)].map((match) => match[0]);
    assert.equal(stepButtons.length, 4);
    stepButtons.forEach((button, index) => {
      assert.ok(button.includes('type="button"'), "Navigation must not submit the form");
      assert.equal(/\bdisabled(?:=|\s|>)/.test(button), index > 0, "SSR always starts at the patient step");
    });
    assert.ok(html.includes('data-appearance="form"'), "Reaction date uses the shared site calendar");
    assert.ok(!/<input[^>]*type="(?:date|time)"/.test(html), "No browser-native reaction date/time controls");
    const timeField = html.match(/<input[^>]*aria-describedby="reaction-time-format"[^>]*>/)?.[0];
    assert.ok(timeField, "Keyboard time field is present");
    assert.ok(timeField.includes('type="text"'));
    assert.ok(timeField.includes(`value="${expectedTime}"`));
    assert.ok(!timeField.includes("disabled"), "Time is editable even before selecting a date");
    assert.ok(html.includes(locale === "en" ? "Reaction onset date" : "Дата начала реакции"));
  }
  const url = `http://127.0.0.1:${port}/history/${examinationId}/pdf`;
  const denied = await fetch(url, { headers: { Cookie: cookie("other-organization") }, redirect: "manual" });
  assert.equal(denied.status, 404);
  const platformAdmin = await fetch(url, { headers: { Cookie: cookie(null, "platform_admin") }, redirect: "manual" });
  assert.equal(platformAdmin.status, 404);
  const response = await fetch(url, { headers: { Cookie: cookie("test-organization") }, redirect: "manual" });
  assert.equal(response.status, 200, response.status === 200 ? "" : await response.text());
  assert.match(response.headers.get("content-type") ?? "", /application\/pdf/);
  assert.equal(Buffer.from(await response.arrayBuffer()).subarray(0, 4).toString(), "%PDF");
  const details = await fetch(`http://127.0.0.1:${port}/history/${examinationId}`, { headers: { Cookie: cookie("test-organization") }, redirect: "manual" });
  assert.equal(details.status, 200);
  const html = await details.text();
  assert.ok(html.includes("Уточнение тестового врача"));
  assert.ok(html.includes("30.09.2026, 14:20"));
  assert.ok(html.includes("Редактировать комментарий"));
  assert.ok(html.includes("data-physician-comment-editor"));
  const oldDetails = await fetch(`http://127.0.0.1:${port}/history/${legacy.id}`, { headers: { Cookie: cookie("test-organization") }, redirect: "manual" });
  assert.equal(oldDetails.status, 200);
  assert.ok((await oldDetails.text()).includes("Не указана"));
  const englishDetails = await fetch(`http://127.0.0.1:${port}/history/${examinationId}`, { headers: { Cookie: `${cookie("test-organization")}; anafix-locale=en` } });
  assert.equal(englishDetails.status, 200);
  const englishDetailsHtml = await englishDetails.text();
  assert.ok(englishDetailsHtml.includes("Physician comment / clarification"));
  assert.ok(englishDetailsHtml.includes("Edit comment"));
  const audit = (await auditText(auditPath)).trim().split("\n").map((line) => JSON.parse(line));
  assert.equal(audit.length, 1);
  assert.equal(audit[0].event, "examination.export.pdf");
  assert.equal(audit[0].examinationId, examinationId);
  assert.ok(!JSON.stringify(audit).includes("Тестовый Пациент"));

  const input = { fullName: "Синтетический Пациент", probableAllergen: "", allergenContact: "unknown", acuteOnset: "unknown", selectedSymptoms: [{ id: "skin-discomfort" }], vitals: record.vitals, physicianComment: "  Уточнение\nВторая строка  ", reactionDate: "2026-09-29", reactionTime: "", severity: { grade: 5 }, conclusion: { text: "FORGED" } };
  const created = await callAction("saveExamination", [input]);
  assert.equal(created.value?.ok, true, created.raw);
  const saved = (await readTestStore(storePath)).find((item) => item.id === created.value.examinationId);
  assert.equal(saved.physicianComment, "Уточнение\nВторая строка");
  assert.equal(saved.reactionDate, "2026-09-29");
  assert.equal(saved.reactionTime, null);
  assert.equal(saved.severity.grade, 1);
  assert.notEqual(saved.conclusion.text, "FORGED");
  const updated = await callAction("updateExamination", [{ ...input, examinationId: saved.id, expectedVersion: 1, physicianComment: "Новый комментарий", reactionTime: "13:45" }]);
  assert.equal(updated.value?.ok, true, updated.raw);
  const edited = (await readTestStore(storePath)).find((item) => item.id === saved.id);
  assert.equal(edited.rowVersion, 2);
  assert.equal(edited.examinedAt, saved.examinedAt);
  assert.equal(edited.patient.id, saved.patient.id);
  assert.equal(edited.physicianComment, "Новый комментарий");
  assert.equal(edited.reactionTime, "13:45");
  assert.deepEqual(edited.severity, saved.severity);
  assert.deepEqual(edited.conclusion, saved.conclusion);
  const conflict = await callAction("updateExamination", [{ ...input, examinationId: saved.id, expectedVersion: 1 }]);
  assert.equal(conflict.value?.ok, false, conflict.raw);
  const invalid = await callAction("saveExamination", [{ ...input, reactionDate: "2026-02-29" }]);
  assert.equal(invalid.value?.ok, false, invalid.raw);
  const foreign = await callAction("updateExamination", [{ ...input, examinationId: saved.id, expectedVersion: 2 }], "/", cookie("other-organization"));
  assert.equal(foreign.value?.ok, false, foreign.raw);
  assert.deepEqual((await readTestStore(storePath)).find((item) => item.id === saved.id), edited);
  const copied = await callAction("requestExaminationExport", [saved.id, "copy"], `/history/${saved.id}`);
  assert.equal(copied.value?.ok, true, copied.raw);
  assert.ok(copied.value.conclusion.includes("Новый комментарий"));
  assert.ok(copied.value.conclusion.includes("29.09.2026, 13:45"));

  // Comment-only editing preserves the saved clinical snapshot, including legacy algorithms.
  const commentRoute = `/history/${examinationId}`;
  const beforeComment = (await readTestStore(storePath)).find(item => item.id === examinationId);
  const clinicalSnapshot = value => Object.fromEntries(Object.entries(value).filter(([key]) => !["physicianComment", "rowVersion", "updatedAt", "updatedBy"].includes(key)));
  const commentInput = { examinationId, expectedVersion: 1, physicianComment: "  Уточнение после осмотра\n<b>Только текст</b>  ", conclusion: { text: "FORGED COMMENT DIAGNOSIS" }, reactionDate: "2000-01-01" };
  const commentChange = await callAction("updatePhysicianComment", [commentInput], commentRoute);
  assert.equal(commentChange.value?.ok, true, commentChange.raw);
  let afterComment = (await readTestStore(storePath)).find(item => item.id === examinationId);
  assert.equal(afterComment.rowVersion, 2);
  assert.equal(afterComment.physicianComment, "Уточнение после осмотра\n<b>Только текст</b>");
  assert.equal(afterComment.updatedBy, "test-clinician");
  assert.deepEqual(clinicalSnapshot(afterComment), clinicalSnapshot(beforeComment), "No clinical data, dates or algorithm versions change");
  const commentDetails = await fetch(`http://127.0.0.1:${port}${commentRoute}`, { headers: { Cookie: cookie("test-organization") } });
  const commentHtml = await commentDetails.text();
  assert.ok(commentHtml.includes("&lt;b&gt;Только текст&lt;/b&gt;"), "Comments are escaped, not rendered as HTML");
  const commentCopy = await callAction("requestExaminationExport", [examinationId, "copy"], commentRoute);
  assert.ok(commentCopy.value?.conclusion.includes(afterComment.physicianComment), "Copy uses the saved updated comment");
  const staleComment = await callAction("updatePhysicianComment", [commentInput], commentRoute);
  assert.equal(staleComment.value?.conflict, true, staleComment.raw);
  for (const physicianComment of ["я".repeat(4001), null, { text: "invalid" }]) {
    const invalidComment = await callAction("updatePhysicianComment", [{ examinationId, expectedVersion: 2, physicianComment }], commentRoute);
    assert.equal(invalidComment.value?.ok, false, invalidComment.raw);
  }
  const foreignComment = await callAction("updatePhysicianComment", [{ ...commentInput, expectedVersion: 2 }], commentRoute, cookie("other-organization"));
  assert.equal(foreignComment.value?.ok, false, foreignComment.raw);
  for (const role of ["platform_admin", "organization_owner", "billing_admin"]) {
    const deniedComment = await callAction("updatePhysicianComment", [{ ...commentInput, expectedVersion: 2 }], commentRoute, cookie(role === "platform_admin" ? null : "test-organization", role));
    assert.equal(deniedComment.value, undefined);
    assert.ok(deniedComment.response.headers.get("x-action-redirect")?.includes("/forbidden"), "Administrative roles cannot change physician comments");
  }
  assert.deepEqual((await readTestStore(storePath)).find(item => item.id === examinationId), afterComment, "Failed changes leave the record intact");
  const concurrentComments = await Promise.all(["Первая правка", "Вторая правка"].map(physicianComment => callAction("updatePhysicianComment", [{ examinationId, expectedVersion: 2, physicianComment }], commentRoute)));
  assert.equal(concurrentComments.filter(result => result.value?.ok).length, 1);
  assert.equal(concurrentComments.filter(result => result.value?.conflict).length, 1);
  afterComment = (await readTestStore(storePath)).find(item => item.id === examinationId);
  assert.equal(afterComment.rowVersion, 3);
  assert.deepEqual(clinicalSnapshot(afterComment), clinicalSnapshot(beforeComment));
  const clearedComment = await callAction("updatePhysicianComment", [{ examinationId, expectedVersion: 3, physicianComment: " \n " }], commentRoute);
  assert.equal(clearedComment.value?.ok, true, clearedComment.raw);
  assert.equal(clearedComment.value.physicianComment, null);
  assert.equal(clearedComment.value.rowVersion, 4);
  const historical=await fetch(`http://127.0.0.1:${port}${commentRoute}?version=1`,{headers:{Cookie:cookie("test-organization")}});
  const oldVersionHtml=await historical.text();assert.equal(historical.status,200);assert.ok(oldVersionHtml.includes("Уточнение тестового врача"));assert.ok(oldVersionHtml.includes("только просмотр"));assert.ok(!oldVersionHtml.includes("data-physician-comment-editor"),"Historical comment cannot be edited");
  const foreignVersion=await fetch(`http://127.0.0.1:${port}${commentRoute}?version=1`,{headers:{Cookie:cookie("other-organization")},redirect:"manual"});assert.equal(foreignVersion.status,404);
  if(postgresMode){const versions=(await testDatabase.query("SELECT row_version FROM anafix.examination_revision WHERE examination_id=$1 ORDER BY row_version",[examinationId])).rows.map(r=>r.row_version);assert.deepEqual(versions,[1,2,3,4],"Every committed comment version is retained, not failed concurrent edits");}
  const noConfirmation=await callAction("markTestAction",formArgs({id:examinationId,rowVersion:4,isTest:"yes"}),commentRoute);assert.ok(noConfirmation.value?.error);
  const testMark=await callAction("markTestAction",formArgs({id:examinationId,rowVersion:4,isTest:"yes",confirm:"yes"}),commentRoute);assert.ok(!testMark.value?.error);assert.equal((await readTestStore(storePath)).find(r=>r.id===examinationId).isTest,true);
  const missingComment = await callAction("updatePhysicianComment", [{ examinationId: randomUUID(), expectedVersion: 1, physicianComment: "Missing" }], commentRoute);
  assert.equal(missingComment.value?.ok, false, missingComment.raw);
  await callAction("deleteExaminationAction", (() => { const form = new FormData(); form.set("_1_examinationId", legacy.id); form.set("0", JSON.stringify(["$K1"])); return form; })(), `/history/${legacy.id}`);
  const deletedComment = await callAction("updatePhysicianComment", [{ examinationId: legacy.id, expectedVersion: 2, physicianComment: "Deleted" }], commentRoute);
  assert.equal(deletedComment.value?.ok, false, deletedComment.raw);
  assert.ok((await readTestStore(storePath)).find(item => item.id === legacy.id).deletedAt, "Soft-deleted records cannot be edited");
  const commentAudit = (await auditText(path.join(tempDir, "security.jsonl"))).split("\n").filter(Boolean).map(line => JSON.parse(line)).filter(event => event.event === "examination.comment_updated");
  assert.ok(commentAudit.some(event => event.outcome === "success" && event.resourceId === examinationId));
  assert.ok(!JSON.stringify(commentAudit).includes("Уточнение после осмотра") && !JSON.stringify(commentAudit).includes("Тестовый Пациент"), "Comment audit contains metadata only");

  const adminRoute = "/admin/organizations/test-organization";
  const adminCookie = cookie(null, "platform_admin");
  const adminProfile = await fetch(`http://127.0.0.1:${port}${adminRoute}`, { headers: { Cookie: adminCookie } });
  assert.equal(adminProfile.status, 200);
  assert.ok((await adminProfile.text()).includes('value="5"'));
  const deniedPolicy = await callAction("updateRetentionAction", retentionArgs(10), adminRoute);
  assert.equal(deniedPolicy.value, undefined);
  assert.ok(deniedPolicy.response.headers.get("x-action-redirect")?.includes("/forbidden"));
  const policy = await callAction("updateRetentionAction", retentionArgs(10), adminRoute, adminCookie);
  assert.ok(policy.value?.success, policy.raw);
  assert.equal((await readTestStore(identityPath)).organizations[0].deletedRecordRetentionYears, 10);
  assert.deepEqual((await readTestStore(storePath)).find((item) => item.id === saved.id), edited);
  const invalidPolicy = await callAction("updateRetentionAction", retentionArgs(0), adminRoute, adminCookie);
  assert.ok(invalidPolicy.value?.error, invalidPolicy.raw);
  assert.equal((await readTestStore(identityPath)).organizations[0].deletedRecordRetentionYears, 10);
  const offlineUrl = `http://127.0.0.1:${port}/api/offline`;
  async function offline(body, sessionCookie = cookie("test-organization"), origin = `http://127.0.0.1:${port}`) {
    const response = await fetch(offlineUrl, { method: "POST", headers: { "Content-Type": "application/json", Cookie: sessionCookie, Origin: origin }, body: JSON.stringify(body) });
    return { response, data: await response.json() };
  }
  const publicShell = await fetch(`http://127.0.0.1:${port}/offline`);
  assert.equal(publicShell.status, 200);
  assert.equal(publicShell.headers.get("x-anafix-offline-shell"), "1");
  const shellHtml = await publicShell.text();
  assert.ok(!shellHtml.includes("Тестовый Пациент"));
  assert.ok(!shellHtml.includes("Synthetic doctor"));
  assert.ok(!shellHtml.includes('data-site-header="true"'));
  const signedInShell = await fetch(`http://127.0.0.1:${port}/offline`, { headers: { Cookie: cookie("test-organization") } });
  assert.equal(signedInShell.status, 200);
  const signedInShellHtml = await signedInShell.text();
  assert.ok(!signedInShellHtml.includes('data-site-header="true"'), "Cached offline shell must not include a personalized header");
  assert.ok(!signedInShellHtml.includes('data-header-account="true"'));
  assert.ok(!signedInShellHtml.includes("Synthetic doctor"));
  const nonce = publicShell.headers.get("content-security-policy").match(/'nonce-([^']+)'/)[1];
  assert.ok(shellHtml.includes(`nonce="${nonce}"`));
  const workerScript = await fetch(`http://127.0.0.1:${port}/offline-worker`);
  const offlineFont = await fetch(`http://127.0.0.1:${port}/fonts/NotoSans.ttf`,{redirect:"manual"});
  assert.equal(offlineFont.status,200,"Public PDF font must be available without a session for offline preparation");
  const fontBytes=new Uint8Array(await offlineFont.arrayBuffer());
  assert.ok(fontBytes.length>100_000);assert.deepEqual([...fontBytes.slice(0,4)],[0,1,0,0]);
  assert.equal(workerScript.status, 200);
  assert.equal(workerScript.headers.get("service-worker-allowed"), "/");
  assert.match(await workerScript.text(), /anafix-public-shell-[0-9a-f]{20}/);
  assert.equal((await fetch(offlineUrl)).status, 401);
  if (policyPending) {
    const before = (await readTestStore(storePath)).length;
    const policyRead = await fetch(offlineUrl, { headers: { Cookie: cookie("test-organization") } });
    assert.equal(policyRead.status, 403);
    assert.equal((await policyRead.json()).code, "OFFLINE_POLICY_PENDING");
    const deniedGrant = await offline({ action: "grant", deviceId: randomUUID(), hospitalComputerConfirmed: true });
    assert.equal(deniedGrant.response.status, 403);
    assert.equal(deniedGrant.data.code, "OFFLINE_POLICY_PENDING");
    assert.equal((await readTestStore(storePath)).length, before);
    process.stdout.write("Offline storage enrollment/download are denied until access duration is configured: OK\n");
  } else {
  const deviceId = randomUUID();
  assert.equal((await offline({ action: "grant", deviceId, hospitalComputerConfirmed: true }, cookie(null, "platform_admin"))).response.status, 401);
  assert.equal((await offline({ action: "grant", deviceId, hospitalComputerConfirmed: true }, cookie("test-organization"), "https://untrusted.example")).response.status, 403);
  assert.equal((await offline({ action: "grant", deviceId, hospitalComputerConfirmed: false })).response.status, 400);
  const enrollment = await offline({ action: "grant", deviceId, hospitalComputerConfirmed: true });
  assert.equal(enrollment.response.status, 200);
  assert.equal(enrollment.data.access.expiresAt - enrollment.data.access.issuedAt, 48 * 3600_000);
  assert.equal(enrollment.data.access.localRetentionDays, 7);
  const command = { operationId: randomUUID(), examinationId: randomUUID(), kind: "create", expectedVersion: 0, examinedAt: new Date().toISOString(), algorithmVersion: saved.algorithmVersion, catalogVersion: saved.catalogVersion, input, grant: enrollment.data.grant };
  const upload = await offline({ action: "sync", operation: command });
  assert.equal(upload.response.status, 200, JSON.stringify(upload.data));
  assert.equal(upload.data.record.severity.grade, 1);
  const count = (await readTestStore(storePath)).length;
  const retry = await offline({ action: "sync", operation: command });
  assert.equal(retry.response.status, 200);
  assert.equal(retry.data.duplicate, true);
  assert.equal((await readTestStore(storePath)).length, count);
  const reused = await offline({ action: "sync", operation: { ...command, input: { ...input, physicianComment: "different" } } });
  assert.equal(reused.response.status, 409);
  assert.equal(reused.data.code, "OPERATION_REUSED");
  const onlineEdit = await callAction("updateExamination", [{ ...input, examinationId: command.examinationId, expectedVersion: 1, physicianComment: "Concurrent online edit" }]);
  assert.equal(onlineEdit.value?.ok, true);
  const staleUpdate = { ...command, kind: "update", operationId: randomUUID(), expectedVersion: 1, input: { ...input, physicianComment: "Local offline edit" } };
  const syncConflict = await offline({ action: "sync", operation: staleUpdate });
  assert.equal(syncConflict.response.status, 409);
  assert.equal(syncConflict.data.status, "conflict");
  assert.equal(syncConflict.data.record.physicianComment, "Concurrent online edit");
  assert.ok(syncConflict.data.conflictId);
  const duplicateConflict=await offline({action:"sync",operation:staleUpdate});
  assert.equal(duplicateConflict.data.conflictId,syncConflict.data.conflictId);
  assert.equal((await readTestStore(storePath,true)).conflicts.length,1);
  assert.ok(!(await readFile(storePath,"utf8")).includes("Local offline edit"));
  const archiveResponse=await fetch(`${offlineUrl}?conflicts=1`,{headers:{Cookie:cookie("test-organization"),"X-Anafix-Offline-Grant":enrollment.data.grant}});
  assert.equal(archiveResponse.status,200);assert.match(archiveResponse.headers.get("cache-control"),/no-store/);
  const archived=(await archiveResponse.json()).conflicts[0];
  assert.equal(archived.local.physicianComment,"Local offline edit");
  assert.equal(archived.server.physicianComment,"Concurrent online edit");
  const otherGrant=await offline({action:"grant",deviceId:randomUUID(),hospitalComputerConfirmed:true},cookie("test-organization","clinician",1,"managed-clinician"));
  const otherArchive=await fetch(`${offlineUrl}?conflicts=1`,{headers:{Cookie:cookie("test-organization","clinician",1,"managed-clinician"),"X-Anafix-Offline-Grant":otherGrant.data.grant}});
  assert.deepEqual((await otherArchive.json()).conflicts,[]);
  assert.equal((await offline({action:"conflict-decision",conflictId:archived.id,decision:"local",grant:otherGrant.data.grant},cookie("test-organization","clinician",1,"managed-clinician"))).response.status,404);
  const rebase = await offline({ action: "sync", operation: { ...staleUpdate, operationId: randomUUID(), expectedVersion: 2 } });
  assert.equal(rebase.response.status, 200);
  assert.equal(rebase.data.record.rowVersion, 3);
  const decision={action:"conflict-decision",conflictId:archived.id,decision:"local",grant:enrollment.data.grant};
  assert.equal((await offline(decision)).response.status,200);
  assert.equal((await offline(decision)).response.status,200);
  assert.equal((await offline({...decision,decision:"server"})).response.status,409);
  const serverArchive=(await readTestStore(storePath,true)).conflicts[0];
  assert.equal(serverArchive.decision,"local");assert.equal(serverArchive.server.rowVersion,2);
  const exportIntents=[];
  for(const kind of ["copy","print","pdf"]) {
    const event={id:randomUUID(),examinationId:command.examinationId,kind,occurredAt:Date.now(),rowVersion:kind === "pdf" ? 0 : 3,grant:enrollment.data.grant};
    exportIntents.push(event);
    assert.equal((await offline({action:"export-audit",export:event})).response.status,200);
    assert.equal((await offline({action:"export-audit",export:event})).response.status,200);
    assert.equal((await offline({action:"export-audit",export:{...event,kind:kind === "pdf" ? "copy" : "pdf"}})).response.status,409);
    assert.equal((await offline({action:"export-audit",export:event},cookie("test-organization","organization_owner"))).response.status,401);
  }
  const offlineAudit=(await auditText(auditPath)).split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line)).filter(row=>row.origin === "offline-client");
  assert.equal(offlineAudit.length,3);assert.equal(new Set(offlineAudit.map(row=>row.id)).size,3);
  assert.ok(!JSON.stringify(offlineAudit).includes("Local offline edit"));
  assert.equal((await offline({action:"export-audit",export:{...exportIntents[0],id:randomUUID(),examinationId:randomUUID()}})).response.status,404);
  assert.equal((await offline({action:"export-audit",export:{...exportIntents[0],id:randomUUID(),occurredAt:enrollment.data.access.expiresAt}})).response.status,400);
  const deletion = { ...command, operationId: randomUUID(), kind: "delete", expectedVersion: 3 };
  const deleted = await offline({ action: "sync", operation: deletion });
  assert.equal(deleted.response.status, 200);
  assert.ok(deleted.data.record.deletedAt);
  assert.equal((await offline({ action: "sync", operation: deletion })).data.record.rowVersion, 4);
  const downloaded = await fetch(offlineUrl, { headers: { Cookie: cookie("test-organization"), "X-Anafix-Offline-Grant": enrollment.data.grant } });
  assert.equal(downloaded.status, 200);
  assert.match(downloaded.headers.get("cache-control"), /no-store/);
  assert.ok((await downloaded.json()).records.some((r) => r.id === command.examinationId && r.deletedAt));
  const expired = { ...enrollment.data.access, issuedAt: Date.now() - 7200_000, expiresAt: Date.now() - 3600_000 };
  const expiredBody = Buffer.from(JSON.stringify(expired)).toString("base64url");
  const expiredToken = `${expiredBody}.${createHmac("sha256", secret).update(`anafix-offline-v1:${expiredBody}`).digest("base64url")}`;
  const expiredRead = await fetch(offlineUrl, { headers: { Cookie: cookie("test-organization"), "X-Anafix-Offline-Grant": expiredToken } });
  assert.equal(expiredRead.status, 403);
  const recovered = await offline({ action: "sync", operation: { ...command, operationId: randomUUID(), examinationId: randomUUID(), examinedAt: new Date(expired.issuedAt + 1000).toISOString(), grant: expiredToken } });
  assert.equal(recovered.response.status, 200);
  const staleAlgorithm = await offline({ action: "sync", operation: { ...command, operationId: randomUUID(), algorithmVersion: "old-unapproved-version" } });
  assert.equal(staleAlgorithm.response.status, 409);
  assert.equal(staleAlgorithm.data.code, "ALGORITHM_REVIEW_REQUIRED");
  const identities = await readTestStore(identityPath);
  identities.accounts[0].credentialVersion = 2;
  await writeIdentityFixture(identities);
  assert.equal((await offline({ action: "sync", operation: command })).response.status, 401);
  process.stdout.write("Clinical metadata/PDF, comment-only edits/clearing/concurrent conflicts/role isolation, offline enrollment/CSRF/no-store, idempotent create/update/delete, conflict/rebase, account revalidation, and audit: OK\n");
  }
  const ownerCookie = cookie("test-organization", "organization_owner");
  const platformCookie = cookie(null, "platform_admin");
  const beforeMedical = await readTestStore(storePath);
  const beforeForeign = (await readTestStore(identityPath)).accounts.find(a => a.id === "other-clinician");
  const accessArgs = (target, operation, id, extras = {}) => formArgs({ target, operation, id, organizationId: "test-organization", confirm: "yes", ...extras });
  const crossAccount = await callAction("manageAccessAction", accessArgs("account", "suspend", "other-clinician", { organizationId: "other-organization" }), "/organization", ownerCookie);
  assert.ok(crossAccount.value?.error);
  assert.deepEqual((await readTestStore(identityPath)).accounts.find(a => a.id === "other-clinician"), beforeForeign);
  const ownerSelfReset = await callAction("resetClinicianPasswordAction", formArgs({ accountId: "test-owner", displayName: "Forged name" }), "/organization", ownerCookie);
  assert.ok(ownerSelfReset.value?.error, "Hospital administrator cannot use clinician reset to change an administrator account");
  const crossSession = await callAction("manageAccessAction", accessArgs("session", "revoke", "test-other-clinician"), "/organization", ownerCookie);
  assert.ok(crossSession.value?.error);
  assert.equal((await readTestStore(identityPath)).sessions.find(s => s.id === "test-other-clinician").revokedAt, null);
  const doctorAdmin = await callAction("manageAccessAction", accessArgs("account", "suspend", "managed-clinician"), "/", cookie("test-organization", "clinician", policyPending ? 1 : 2));
  assert.ok(doctorAdmin.response.headers.get("x-action-redirect")?.includes("/forbidden"));
  const changedName = await callAction("manageAccessAction", accessArgs("account", "rename", "managed-clinician", { displayName: "Updated doctor" }), "/organization", ownerCookie);
  assert.ok(changedName.value?.success, changedName.raw);
  const licenseFields = { organizationId: "test-organization", startsOn: "", endsOn: "", maxClinicians: "2", price: "120.50", currency: "USD", offlineHours: "", reason: "Synthetic contract change" };
  const forbiddenLicense = await callAction("updateLicenseAction", formArgs(licenseFields), "/organization", ownerCookie);
  assert.ok(forbiddenLicense.response.headers.get("x-action-redirect")?.includes("/forbidden"));
  const invalidLicense = await callAction("updateLicenseAction", formArgs({ ...licenseFields, offlineAllowed: "on" }), "/admin/licenses", platformCookie);
  assert.ok(invalidLicense.value?.error, "Offline permission cannot silently assume a duration");
  const licensed = await callAction("updateLicenseAction", formArgs(licenseFields), "/admin/licenses", platformCookie);
  assert.ok(licensed.value?.success, licensed.raw);
  let identity = await readTestStore(identityPath);
  assert.equal(identity.organizations[0].license.priceMinor, 12050);
  assert.equal(identity.organizations[0].licenseHistory.length, 1);
  assert.equal(identity.billingEntries.length, 0, "License price does not silently create charges");
  const limited = await callAction("createClinicianAction", formArgs({ displayName: "Additional doctor" }), "/organization", ownerCookie);
  assert.ok(limited.value?.error);
  const suspended = await callAction("manageAccessAction", accessArgs("account", "suspend", "managed-clinician"), "/organization", ownerCookie);
  assert.ok(suspended.value?.success, suspended.raw);
  const blockedPage = await fetch(`http://127.0.0.1:${port}/history`, { headers: { Cookie: cookie("test-organization", "clinician", 1, "managed-clinician") }, redirect: "manual" });
  assert.equal(blockedPage.headers.get("location"), "/login");
  const additions=await Promise.all(Array.from({length:postgresMode?2:1},()=>callAction("createClinicianAction", formArgs({ displayName: "Additional doctor", role: "platform_admin", organizationId: "other-organization" }), "/organization", ownerCookie)));
  assert.equal(additions.filter(result=>result.value?.success).length,1,"A single remaining licensed seat cannot be claimed twice across servers");
  const added = additions.find(result=>result.value?.success);
  assert.ok(added.value?.success, added.raw);
  identity = await readTestStore(identityPath);
  const addedAccount = identity.accounts.find(a => a.login === added.value.credentials.login);
  assert.equal(addedAccount.role, "clinician", "Hospital administrator cannot escalate roles");
  assert.equal(addedAccount.organizationId, "test-organization", "Client organization fields cannot change account scope");
  assert.equal(addedAccount.mustChangePassword, true);
  const doctorLogin = await callAction("loginAction", formArgs({ login: added.value.credentials.login, password: added.value.credentials.password }), "/login", "");
  assert.ok(doctorLogin.response.headers.get("x-action-redirect")?.includes("/change-password"), "New clinician must change the temporary password");
  const realDoctorCookie = doctorLogin.response.headers.getSetCookie().find(value => value.startsWith("__Host-anafix-session="))?.split(";")[0];
  assert.ok(realDoctorCookie);
  const initialDoctorPage = await fetch(`http://127.0.0.1:${port}/`, { headers: { Cookie: realDoctorCookie }, redirect: "manual" });
  assert.equal(initialDoctorPage.headers.get("location"), "/change-password");
  const newPassword = "Synthetic-Changed-Password-2026!";
  const passwordChanged = await callAction("changePasswordAction", formArgs({ password: newPassword, confirmation: newPassword }), "/change-password", realDoctorCookie);
  assert.ok(passwordChanged.response.headers.get("x-action-redirect")?.includes("/;"), passwordChanged.raw);
  const changedDoctorCookie = passwordChanged.response.headers.getSetCookie().find(value => value.startsWith("__Host-anafix-session="))?.split(";")[0];
  assert.ok(changedDoctorCookie);
  assert.equal((await fetch(`http://127.0.0.1:${port}/history`, { headers: { Cookie: changedDoctorCookie }, redirect: "manual" })).status, 200);
  assert.equal((await fetch(`http://127.0.0.1:${port}/history`, { headers: { Cookie: realDoctorCookie }, redirect: "manual" })).headers.get("location"), "/login", "Password change invalidates the initial session");
  const doctorPasswordReset = await callAction("resetClinicianPasswordAction", formArgs({ accountId: addedAccount.id, displayName: addedAccount.displayName }), "/organization", ownerCookie);
  assert.ok(doctorPasswordReset.value?.success);
  assert.equal((await fetch(`http://127.0.0.1:${port}/history`, { headers: { Cookie: changedDoctorCookie }, redirect: "manual" })).headers.get("location"), "/login", "Administrative password reset revokes existing online access");
  const restoreBeyondLimit = await callAction("manageAccessAction", accessArgs("account", "activate", "managed-clinician"), "/organization", ownerCookie);
  assert.ok(restoreBeyondLimit.value?.error);
  const expiredLicense = await callAction("updateLicenseAction", formArgs({ ...licenseFields, endsOn: "2000-01-01" }), "/admin/licenses", platformCookie);
  assert.ok(expiredLicense.value?.success);
  const expiredDoctor = await fetch(`http://127.0.0.1:${port}/history`, { headers: { Cookie: cookie("test-organization", "clinician", policyPending ? 1 : 2) }, redirect: "manual" });
  assert.equal(expiredDoctor.headers.get("location"), "/login");
  assert.equal((await fetch(`http://127.0.0.1:${port}/organization`, { headers: { Cookie: ownerCookie }, redirect: "manual" })).status, 200, "Administrator can view billing when clinical license expires");
  assert.ok((await callAction("updateLicenseAction", formArgs(licenseFields), "/admin/licenses", platformCookie)).value?.success);
  const billFields = { organizationId: "test-organization", type: "charge", currency: "BYN", amount: "90.00", effectiveDate: "2026-10-01", note: "Synthetic invoice" };
  const forbiddenBill = await callAction("createBillingEntryAction", formArgs(billFields), "/organization", ownerCookie);
  assert.ok(forbiddenBill.response.headers.get("x-action-redirect")?.includes("/forbidden"));
  const bill = await callAction("createBillingEntryAction", formArgs(billFields), "/admin/finances", platformCookie);
  assert.ok(bill.value?.success, bill.raw);
  identity = await readTestStore(identityPath);
  const billId = identity.billingEntries[0].id;
  const missingReason = await callAction("voidBillingEntryAction", formArgs({ organizationId: "test-organization", entryId: billId }), "/admin/finances", platformCookie);
  assert.ok(missingReason.value?.error);
  const correction = await callAction("voidBillingEntryAction", formArgs({ organizationId: "test-organization", entryId: billId, reason: "Synthetic correction" }), "/admin/finances", platformCookie);
  assert.ok(correction.value?.success, correction.raw);
  identity = await readTestStore(identityPath);
  assert.equal(identity.billingEntries[0].voidReason, "Synthetic correction");
  assert.ok(identity.billingEntries[0].voidedAt, "Original entry remains in history");
  assert.ok((await callAction("createBillingEntryAction", formArgs({ ...billFields, organizationId: "other-organization", amount: "80.00", note: "Foreign synthetic invoice" }), "/admin/finances", platformCookie)).value?.success);
  assert.ok((await callAction("createBillingEntryAction", formArgs({ ...billFields, type: "payment", amount: "100.00" }), "/admin/finances", platformCookie)).value?.success);
  const financialDashboard = await fetch(`http://127.0.0.1:${port}/admin`, { headers: { Cookie: platformCookie } });
  assert.match(await financialDashboard.text(), /<strong data-debt="true">80,00/, "One hospital's advance cannot cancel another hospital's debt");
  const ownLedger = await fetch(`http://127.0.0.1:${port}/organization?tab=billing`, { headers: { Cookie: ownerCookie } });
  assert.ok(!(await ownLedger.text()).includes("Foreign synthetic invoice"));
  if (identity.devices.some(d=>d.accountId==="test-clinician")) {
    const device = identity.devices.find(d=>d.accountId==="test-clinician");
    assert.ok((await callAction("manageAccessAction", accessArgs("device", "suspend", device.id, { accountId: device.accountId }), "/organization", ownerCookie)).value?.success);
    assert.equal((await readTestStore(identityPath)).devices.find(d=>d.id===device.id).status, "suspended");
    assert.ok((await callAction("updateLicenseAction", formArgs({ ...licenseFields, offlineAllowed: "on", offlineHours: "1" }), "/admin/licenses", platformCookie)).value?.success);
    const validDoctor = cookie("test-organization", "clinician", policyPending ? 1 : 2);
    const blockedRenewal = await fetch(offlineUrl, { method: "POST", headers: { Cookie: validDoctor, Origin: `http://127.0.0.1:${port}`, "Content-Type": "application/json" }, body: JSON.stringify({ action: "grant", deviceId: device.id, hospitalComputerConfirmed: true }) });
    assert.equal(blockedRenewal.status, 403);
    assert.equal((await blockedRenewal.json()).code, "DEVICE_BLOCKED");
  }
  const foreignRevocation = await callAction("manageAccessAction", accessArgs("session", "revoke", "test-other-clinician"), "/admin/security", platformCookie);
  assert.ok(foreignRevocation.value?.success);
  const revokedPage = await fetch(`http://127.0.0.1:${port}/history`, { headers: { Cookie: cookie("other-organization") }, redirect: "manual" });
  assert.equal(revokedPage.headers.get("location"), "/login");
  const blockedOrganization = await callAction("manageAccessAction", accessArgs("organization", "suspend", "test-organization"), "/admin/organizations/test-organization", platformCookie);
  assert.ok(blockedOrganization.value?.success, blockedOrganization.raw);
  const blockedOwner = await fetch(`http://127.0.0.1:${port}/organization`, { headers: { Cookie: ownerCookie }, redirect: "manual" });
  assert.equal(blockedOwner.headers.get("location"), "/login");
  assert.ok((await callAction("manageAccessAction", accessArgs("organization", "activate", "test-organization"), "/admin/organizations/test-organization", platformCookie)).value?.success);
  assert.deepEqual(await readTestStore(storePath), beforeMedical, "Administrative mutations never alter clinical records");
  const oldOwner = await fetch(`http://127.0.0.1:${port}/organization`, { headers: { Cookie: ownerCookie }, redirect: "manual" });
  assert.equal(oldOwner.headers.get("location"), "/login", "Restore never reactivates a revoked session");
  const medicalBeforeArchive=await readTestStore(storePath),ledgerBeforeArchive=(await readTestStore(identityPath)).billingEntries;
  const rename=await callAction("manageOrganizationAction",formArgs({organizationId:"test-organization",operation:"rename",name:"Renamed synthetic hospital"}),adminRoute,platformCookie);assert.ok(rename.value?.success,rename.raw);
  const deniedArchive=await callAction("manageOrganizationAction",formArgs({organizationId:"test-organization",operation:"archive",confirm:"yes",confirmationName:"wrong"}),adminRoute,platformCookie);assert.ok(deniedArchive.value?.error);
  const clearUnmarked=await callAction("manageOrganizationAction",formArgs({organizationId:"test-organization",operation:"clear-test",confirm:"yes",confirmationName:"Renamed synthetic hospital"}),adminRoute,platformCookie);assert.ok(clearUnmarked.value?.success);
  const afterTestCleanup=await readTestStore(storePath);assert.ok(afterTestCleanup.find(r=>r.id===examinationId).deletedAt);assert.deepEqual(afterTestCleanup.filter(r=>r.id!==examinationId),medicalBeforeArchive.filter(r=>r.id!==examinationId),"Unmarked records are never treated as test based on their names");
  const archive=await callAction("manageOrganizationAction",formArgs({organizationId:"test-organization",operation:"archive",confirm:"yes",confirmationName:"Renamed synthetic hospital"}),adminRoute,platformCookie);assert.ok(archive.value?.success,archive.raw);
  const archivedIdentity=await readTestStore(identityPath);assert.ok(archivedIdentity.organizations.find(o=>o.id==="test-organization").archivedAt);assert.deepEqual(archivedIdentity.billingEntries,ledgerBeforeArchive);assert.deepEqual(await readTestStore(storePath),afterTestCleanup,"Archive preserves all medical snapshots");
  const reactivateArchive=await callAction("manageAccessAction",accessArgs("organization","activate","test-organization"),adminRoute,platformCookie);assert.ok(reactivateArchive.value?.error,"Archive cannot be accidentally reactivated by a suspension control");
  const securityLog = await auditText(path.join(tempDir,"security.jsonl"));
  assert.ok(!securityLog.includes("Тестовый Пациент") && !securityLog.includes("Synthetic contract change"));
  process.stdout.write("Administrative roles/tenant isolation, account limits, licenses, immutable ledger corrections, session revocation, rename/archive/test-only cleanup and revision preservation: OK\n");
} finally {
  if (server.exitCode === null) await new Promise((resolve) => { server.once("exit", resolve); server.kill(); });
  if (secondServer?.exitCode === null) await new Promise(resolve=>{secondServer.once("exit",resolve);secondServer.kill();});
  await testDatabase?.end();
  if (tempDir.startsWith(path.join(os.tmpdir(), "anafix-export-smoke-"))) await rm(tempDir, { recursive: true, force: true });
}
