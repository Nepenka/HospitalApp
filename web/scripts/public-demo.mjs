// Isolated customer demo. Uses only Node and the existing OpenSSH client.
// Never reads or copies the application's working identities or medical data.
import assert from "node:assert/strict";
import { createCipheriv, createHash, randomBytes, randomUUID, scryptSync } from "node:crypto";
import { spawn } from "node:child_process";
import { access, appendFile, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {verifyDemoSignIns} from "./public-demo-auth.mjs";
import {demoGet,networkFailure} from "./public-demo-http.mjs";
import {DemoTunnel,processExited,retryDemoConnection,stopDemoProcess} from "./public-demo-tunnel.mjs";
import {installDemoControls} from "./public-demo-controls.mjs";

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const demoRoot = path.join(webDir, ".data", "public-demo");
const activePath = path.join(demoRoot, "active.json");
const localCheck = process.argv.includes("--check-local");
const recoveryCheck = process.argv.includes("--check-recovery");
const verificationOnly = localCheck || recoveryCheck || process.argv.includes("--check-public");
assert.ok(!(localCheck && recoveryCheck), "Recovery verification requires a public tunnel.");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const secret = () => randomBytes(48).toString("base64url");
const password = () => randomBytes(18).toString("base64url");
function hashPassword(value) {
  const salt = randomBytes(18).toString("base64url");
  return `scrypt$${salt}$${scryptSync(value, salt, 64).toString("base64url")}`;
}
function encrypt(value, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", createHash("sha256").update(key).digest(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return JSON.stringify({ version: 1, iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), ciphertext: ciphertext.toString("base64") });
}
function ownsRunDir(value) {
  return typeof value === "string" && path.dirname(path.resolve(value)) === demoRoot && path.basename(value).startsWith("run-");
}
if (process.argv.includes("--stop")) {
  const active = JSON.parse(await readFile(activePath, "utf8"));
  assert.ok(ownsRunDir(active.runDir), "Invalid demo directory");
  await writeFile(path.join(active.runDir, "stop.request"), "stop", { mode: 0o600 });
  console.log("Запрошена остановка последней демонстрации. Рабочий сайт не затрагивается.");
  process.exit(0);
}

await access(path.join(webDir, ".next", "BUILD_ID")); // Build beforehand; never install anything.
await mkdir(demoRoot, { recursive: true });
const runDir = await mkdtemp(path.join(demoRoot, "run-"));
const statusPath = path.join(runDir, "status.json");
await writeFile(statusPath, JSON.stringify({ status: "starting", pid: process.pid, startedAt: new Date().toISOString() }), { mode: 0o600 });
const identityKey = secret();
const medicalKey = secret();
const now = new Date().toISOString();
const credentials = [
  { role: "Врач", login: "demo-doctor", password: password(), route: "/" },
  { role: "Администратор организации", login: "demo-hospital", password: password(), route: "/organization" },
  { role: "Администратор платформы", login: "demo-platform", password: password(), route: "/admin" },
];
const organizationId = randomUUID();
const accounts = credentials.slice(0, 2).map((entry, index) => ({
  id: randomUUID(), organizationId, login: entry.login, displayName: index === 0 ? "Демонстрационный врач" : "Демонстрационный администратор",
  role: index === 0 ? "clinician" : "organization_owner", status: "active", passwordHash: hashPassword(entry.password), createdAt: now,
  lastLoginAt: null, mustChangePassword: false, credentialVersion: 1,
}));
const identityPath = path.join(runDir, "identities.enc");
const medicalPath = path.join(runDir, "examinations.enc");
await writeFile(identityPath, encrypt({ version: 1, organizations: [{ id: organizationId, name: "Демонстрационная больница (не настоящая организация)", code: "demo", status: "active", createdAt: now, deletedRecordRetentionYears: 5, license: { startsOn: null, endsOn: null, maxClinicians: null, priceMinor: null, currency: null, offlineAllowed: false, offlineHours: null } }], accounts, billingEntries: [], sessions: [], devices: [] }, identityKey), { mode: 0o600 });
await writeFile(medicalPath, encrypt({ version: 2, records: [], receipts: [] }, medicalKey), { mode: 0o600 });
const port = await new Promise((resolve, reject) => {
  const probe = createServer();
  probe.once("error", reject);
  probe.listen(0, "127.0.0.1", () => { const address = probe.address(); probe.close(() => resolve(address.port)); });
});
const ssh = process.platform === "win32" ? path.join(process.env.SystemRoot || "C:\\Windows", "System32", "OpenSSH", "ssh.exe") : "ssh";
let server;
let serverOrigin;
let serverFailed = false;
let stopping = false;
let stopped = false;
let currentOrigin;
let serverOutput = "";
let stopReason = "unknown";
let stage="tunnel-start";
const expiresAt = null; // No time limit or inactivity shutdown for a customer demonstration.
const authSecret = secret(); // Stable within this isolated run, not regenerated on reconnect.
const tunnel = new DemoTunnel({ssh,port,knownHostsPath:path.join(demoRoot,"known_hosts"),onEvent:event=>{
  appendFile(path.join(runDir,"tunnel-events.jsonl"),JSON.stringify(event)+"\n").catch(()=>{});
}});
const shutdown = () => {
  if (stopped) return;
  stopped = true;
  tunnel.child?.kill();
  server?.kill();
};
const disposeControls=installDemoControls({onNotice:message=>console.log(message),onStop:()=>{
  stopReason="Ctrl+Q: остановка из окна запуска";stopping=true;shutdown();
}});
process.on("exit",disposeControls);
process.on("SIGTERM", () => { stopReason = "SIGTERM: внешний процесс запросил остановку"; stopping = true; shutdown(); });
process.on("exit", shutdown);
async function shouldStop() {
  if (stopping) return true;
  try { await access(path.join(runDir,"stop.request")); stopReason="Запрос demo:stop"; stopping=true; } catch { /* keep serving */ }
  return stopping;
}
async function waitWhileActive(ms) {
  const end=Date.now()+ms;
  while(Date.now()<end && !(await shouldStop()))await delay(Math.min(200,end-Date.now()));
}
const startServer=(origin)=>{
  serverOrigin=origin;serverFailed=false;serverOutput="";
  server = spawn(process.execPath, [path.join(webDir, "node_modules", "next", "dist", "bin", "next"), "start", "-H", "127.0.0.1", "-p", String(port)], {
    cwd: webDir, stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
    env: { ...process.env, ANAFIX_LOCAL_ENV_PATH:"", STORAGE_BACKEND: "files", NODE_ENV: "production", ANAFIX_DEMO_MODE: "true", ANAFIX_DEMO_NO_COOLDOWN:"true", AUTH_SESSION_SECRET: authSecret, IDENTITY_DATA_KEY: identityKey, IDENTITY_DATA_PREVIOUS_KEYS:"[]", IDENTITY_STORE_PATH: identityPath, MFA_STORE_PATH:path.join(runDir,"mfa.enc"), EXAMINATION_DATA_KEY: medicalKey, EXAMINATION_DATA_PREVIOUS_KEYS:"[]", EXAMINATION_STORE_PATH: medicalPath, SECURITY_AUDIT_PATH: path.join(runDir, "security.jsonl"), EXPORT_AUDIT_PATH: path.join(runDir, "exports.jsonl"), BACKUP_STATUS_PATH: "", OFFLINE_ENABLED: "false", OFFLINE_ACCESS_HOURS: "", APP_ORIGIN: origin, PLATFORM_ADMIN_LOGIN: credentials[2].login, PLATFORM_ADMIN_PASSWORD_SCRYPT: hashPassword(credentials[2].password), DATABASE_URL: "", TRUST_PROXY_CLIENT_IP:"false", STRIPE_SECRET_KEY: "", STRIPE_WEBHOOK_SECRET: "", STRIPE_PRICE_PROFESSIONAL: "", STRIPE_PRICE_ENTERPRISE: "" },
  });
  const log = (chunk) => { serverOutput = (serverOutput + chunk.toString()).slice(-8000); appendFile(path.join(runDir, "server.log"), chunk.toString()).catch(() => {}); };
  server.stdout.on("data", log); server.stderr.on("data", log);
  server.on("error", (error) => { serverOutput += error.message; serverFailed = true; });
};
const waitForServer=async()=>{
  let ready = false;
  const deadline=Date.now()+30000;
  while (Date.now()<deadline && !(await shouldStop())) {
    if (serverFailed || processExited(server)) break;
    try { const response = await fetch(`http://127.0.0.1:${port}/login`, { headers:{Connection:"close"},signal: AbortSignal.timeout(2000) }); await response.body?.cancel(); if (response.status === 200) { ready = true; break; } } catch { /* starting */ }
    await delay(100);
  }
  assert.ok(ready, `Сервер не запустился: ${serverOutput}`);
};
async function ensureServer(origin,force=false) {
  if(force || serverFailed || processExited(server) || serverOrigin!==origin) {
    await stopDemoProcess(server);
    assert.ok(!(await shouldStop()),"Демонстрация остановлена.");
    startServer(origin);await waitForServer();
  }
}
async function verifyPublicPage(origin) {
  const loginPage = await demoGet(`${origin}/login`);
  assert.equal(loginPage.status, 200, "Public login page");
  const html = await loginPage.text();
  assert.ok(html.includes("Демонстрация для заказчика"), "Demo warning must be visible");
  assert.ok(!html.includes("Anafix-Dev-2026!"), "Development password must not be exposed");
  assert.ok(loginPage.headers.get("x-robots-tag")?.includes("noindex"));
  const stylesheets = [...html.matchAll(/<link\b[^>]*href="([^"]+\.css(?:\?[^"]*)?)"[^>]*>/g)].map((match) => match[1]);
  assert.ok(stylesheets.length, "Stylesheets exist");
  for (const stylesheet of stylesheets){
    const asset=new URL(stylesheet.replaceAll("&amp;", "&"),origin);
    assert.equal(asset.origin,origin,"Demo stylesheet must be same-origin");
    const response=await demoGet(asset);assert.equal(response.status,200,"Public styles load");await response.arrayBuffer();
  }
}
async function connectAndVerify() {
  return retryDemoConnection({shouldStop,wait:waitWhileActive,
    onRetry:async(attempt,total,error)=>console.log(`Повторное подключение ${attempt}/${total}: ${networkFailure(error)}`),
    onFailure:async()=>{if(!localCheck)await tunnel.stop();},
    connect:async()=>{
      const origin=localCheck?`http://127.0.0.1:${port}`:tunnel.alive&&tunnel.origin?tunnel.origin:await tunnel.open({shouldStop,wait:waitWhileActive});
      await ensureServer(origin);
      await verifyPublicPage(origin);
      assert.ok(localCheck || !tunnel.needsRecovery(origin),"Адрес изменился во время проверки; подключаемся заново.");
      currentOrigin=origin;
      return origin;
    },
  });
}
async function publish(status) {
  const info={status,url:status==="running"?`${currentOrigin}/login`:null,lastUrl:currentOrigin?`${currentOrigin}/login`:null,createdAt:now,expiresAt,runDir,pid:process.pid,credentials};
  await writeFile(path.join(runDir,"access.json"),JSON.stringify(info,null,2),{mode:0o600});
  // Do not steal demo:stop from a newer launch in a different window.
  let active;
  try {active=JSON.parse(await readFile(activePath,"utf8"));}catch{/* first launch */}
  if(!verificationOnly && (!published || active?.runDir===runDir))await writeFile(activePath,JSON.stringify({status,url:info.url,runDir,pid:process.pid,expiresAt}),{mode:0o600});
  await writeFile(statusPath,JSON.stringify({status,pid:process.pid,url:info.url,lastUrl:info.lastUrl,startedAt:now,expiresAt,stage}),{mode:0o600});
  published=true;
}
let published=false;
async function restoreConnection() {
  stage="tunnel-reconnecting";
  if(published)await publish("reconnecting");
  console.log("\nПубличное соединение прервано или адрес изменился. Восстанавливаю; данные демо и пароли сохраняются.");
  await connectAndVerify();
  stage="serving-demo";
  if(published)await publish("running");
  if(!verificationOnly)console.log(`Демонстрация снова доступна: ${currentOrigin}/login\nПередайте заказчику эту ссылку. Логины и пароли прежние; при смене домена потребуется снова войти.\n`);
}
try {
  stage="initial-connection";await connectAndVerify();
  const manifest = JSON.parse(await readFile(path.join(webDir, ".next", "server", "server-reference-manifest.json"), "utf8"));
  stage="role-sign-ins";await verifyDemoSignIns({origin:currentOrigin,transportOrigin:`http://127.0.0.1:${port}`,credentials,manifest,verifyNoCooldown:verificationOnly});
  await access(path.join(runDir,"mfa.enc"));
  // Exercise a fresh demo-only process; persisted data and one-time codes must
  // remain available across restarts without repeating MFA enrollment.
  stage="verification-server-restart";
  await ensureServer(currentOrigin,true);
  stage="public-check-after-restart";await connectAndVerify();
  if(recoveryCheck){
    // Exercise normal URL/status publication in our own run, never active.json.
    stage="serving-demo";await publish("running");
    const initialAccess=JSON.parse(await readFile(path.join(runDir,"access.json"),"utf8"));
    const snapshot=async()=>Promise.all([identityPath,medicalPath,path.join(runDir,"mfa.enc")].map(async file=>createHash("sha256").update(await readFile(file)).digest("hex")));
    const before=await snapshot(),previousChild=tunnel.child,originalExpiry=expiresAt;
    console.log("Проверка восстановления: отключаю только собственный проверочный SSH-туннель.");
    await tunnel.stop();
    await restoreConnection();
    assert.notEqual(tunnel.child,previousChild,"A new SSH process must be created.");
    assert.deepEqual(await snapshot(),before,"Demo data, sessions and MFA must survive reconnect.");
    assert.equal(expiresAt,originalExpiry,"Reconnect must retain the demo lifetime policy.");
    assert.equal(expiresAt,null,"Demo must not have an automatic shutdown deadline.");
    const updatedAccess=JSON.parse(await readFile(path.join(runDir,"access.json"),"utf8"));
    assert.equal(updatedAccess.url,`${currentOrigin}/login`,"The access file must contain the checked URL.");
    assert.equal(updatedAccess.status,"running");assert.equal(updatedAccess.expiresAt,initialAccess.expiresAt);
    assert.ok(JSON.stringify(updatedAccess.credentials)===JSON.stringify(initialAccess.credentials),"Reconnect must not reset demo passwords or second factors.");
    stage="role-sign-ins-after-recovery";
    await verifyDemoSignIns({origin:currentOrigin,transportOrigin:`http://127.0.0.1:${port}`,credentials,manifest,enrolled:true});
  }
  if(verificationOnly){
    stopReason=localCheck?"Local verification completed; no public tunnel was created":"Public verification completed; own test tunnel closed";
    console.log(`${localCheck?"Локальная":"Публичная"} проверка демо прошла: врач, оба администратора с 2FA, стили, выход и доступ после перезапуска.${recoveryCheck?" Восстановление после обрыва проверено; данные и второй фактор сохранены.":""} ${localCheck?"Публичный туннель не создавался.":"Собственный проверочный туннель закрывается."} Доступы не выводились.`);
  }else {
  stage="serving-demo";await publish("running");
  console.log(`Демонстрация готова: ${currentOrigin}/login\nПубличная страница и стили проверены. Вход всех ролей проверен на изолированном демо-сервере.\nДоступы: ${path.join(runDir, "access.json")}\nОграничение длительности и остановка по бездействию отключены. Ожидание после ошибок входа отключено только в этом демо.\nОстановка: Ctrl+Q или pnpm --dir web demo:stop. Ctrl+C не останавливает демо.`);
  console.log("\nНе закрывайте это окно. Компьютер должен оставаться включённым и подключённым к интернету.\nПри обрыве будут попытки восстановления. Если адрес изменится, здесь появится новая ссылка.\nТолько тестовые данные — никаких настоящих пациентов.\n");
  for (const entry of credentials){
    console.log(`${entry.role}\n  Логин: ${entry.login}\n  Пароль: ${entry.password}`);
    if(entry.recoveryCodes)console.log(`  Второй фактор: после пароля нажмите «Продолжить с аутентификатором»\n  и введите один из одноразовых ДЕМО-кодов (каждый только один раз):\n${entry.recoveryCodes.map(code=>`    ${code}`).join("\n")}\n  Для приложения-аутентификатора ключ есть в access.json.`);
    console.log("");
  }
  while (!(await shouldStop())) {
    assert.ok(!serverFailed&&!processExited(server),`Сервер демо остановился: ${serverOutput}`);
    if(tunnel.needsRecovery(currentOrigin)){
      await restoreConnection();
    }
    await waitWhileActive(1000);
  }
  console.log(`Демонстрация остановлена: ${stopReason}. Тестовые данные сохранены отдельно; рабочие данные не изменены.`);
  }
} catch (error) {
  if(!stopping){
    stopReason = networkFailure(error);
    console.error(`Демо не запущено или остановилось. Этап: ${stage}\n${stopReason}\nДиагностика этого запуска: ${statusPath}\nЖурнал сервера: ${path.join(runDir,"server.log")}`); process.exitCode = 1;
  }else console.log(`Демонстрация остановлена: ${stopReason}.`);
} finally {
  await Promise.allSettled([tunnel.stop(),stopDemoProcess(server)]);
  shutdown();
  if(published)await publish("stopped");
  await writeFile(statusPath, JSON.stringify({ status: "stopped", pid: process.pid, url: null, lastUrl: currentOrigin, startedAt: now, stoppedAt: new Date().toISOString(), stage, reason: stopReason }), { mode: 0o600 });
  disposeControls();
}
