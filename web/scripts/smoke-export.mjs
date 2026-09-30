import assert from "node:assert/strict";
import { createCipheriv, createHash, createHmac, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";

const tempDir = await mkdtemp(path.join(os.tmpdir(), "anafix-export-smoke-"));
const secret = "test-session-secret-at-least-thirty-two-characters";
const dataKey = "test-examination-key-at-least-thirty-two-characters";
const storePath = path.join(tempDir, "examinations.enc");
const auditPath = path.join(tempDir, "export-audit.jsonl");
const examinationId = "11111111-1111-4111-8111-111111111111";
const now = new Date().toISOString();
const check = (title) => ({ key: "primary", title, status: "confirmed", summary: "Подтверждена", criteria: [{ id: "one", label: "Синтетический критерий", met: true, details: "Для проверки PDF" }] });
const record = {
  id: examinationId, organizationId: "test-organization", patient: { id: "synthetic-patient", fullName: "Тестовый Пациент" },
  probableAllergen: "Тестовый аллерген", allergenContact: "yes", acuteOnset: "yes", examinedAt: now,
  createdAt: now, createdBy: "test-clinician", updatedAt: now, updatedBy: "test-clinician", rowVersion: 1,
  deletedAt: null, deletedBy: null, algorithmVersion: "test", catalogVersion: "test", selectedSymptoms: [],
  vitals: { age: { years: 18, months: 0 }, systolicBP: 110, diastolicBP: 70, spO2: 98, heartRate: 80, respiratoryRate: 18, gcs: 15 },
  severity: { grade: 1 }, conclusion: { primary: check("АнаФикс"), niaid: check("NIAID"), wao: check("WAO"), anyConfirmed: true, text: "Синтетическое заключение для проверки PDF." },
};
const iv = randomBytes(12);
const cipher = createCipheriv("aes-256-gcm", createHash("sha256").update(dataKey).digest(), iv);
const ciphertext = Buffer.concat([cipher.update(JSON.stringify([record]), "utf8"), cipher.final()]);
await writeFile(storePath, JSON.stringify({ version: 1, iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), ciphertext: ciphertext.toString("base64") }));

const port = await new Promise((resolve, reject) => {
  const server = createServer();
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => { const address = server.address(); server.close(() => resolve(address.port)); });
});
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(port), "-H", "127.0.0.1"], {
  cwd: process.cwd(), env: { ...process.env, NODE_ENV: "production", AUTH_SESSION_SECRET: secret, EXAMINATION_DATA_KEY: dataKey, EXAMINATION_STORE_PATH: storePath, EXPORT_AUDIT_PATH: auditPath },
  stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
});
let serverOutput = "";
server.stdout.on("data", (chunk) => { serverOutput += chunk.toString(); });
server.stderr.on("data", (chunk) => { serverOutput += chunk.toString(); });

function cookie(organizationId, role = "clinician") {
  const payload = { user: { id: "test-clinician", role, organizationId, displayName: "Тест", mustChangePassword: false }, sessionId: "test", issuedAt: Math.floor(Date.now() / 1000), expiresAt: Math.floor(Date.now() / 1000) + 3600 };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret).update(body).digest("base64url");
  return `__Host-anafix-session=${body}.${signature}`;
}

try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error(`Server exited: ${serverOutput}`);
    try { const response = await fetch(`http://127.0.0.1:${port}/login`, { redirect: "manual" }); if (response.status < 500) { ready = true; break; } } catch { /* server starting */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(ready, `Server did not start: ${serverOutput}`);
  const url = `http://127.0.0.1:${port}/history/${examinationId}/pdf`;
  const denied = await fetch(url, { headers: { Cookie: cookie("other-organization") }, redirect: "manual" });
  assert.equal(denied.status, 404);
  const platformAdmin = await fetch(url, { headers: { Cookie: cookie(null, "platform_admin") }, redirect: "manual" });
  assert.equal(platformAdmin.status, 404);
  const response = await fetch(url, { headers: { Cookie: cookie("test-organization") }, redirect: "manual" });
  assert.equal(response.status, 200, response.status === 200 ? "" : await response.text());
  assert.match(response.headers.get("content-type") ?? "", /application\/pdf/);
  assert.equal(Buffer.from(await response.arrayBuffer()).subarray(0, 4).toString(), "%PDF");
  const audit = (await readFile(auditPath, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
  assert.equal(audit.length, 1);
  assert.equal(audit[0].event, "examination.export.pdf");
  assert.equal(audit[0].examinationId, examinationId);
  assert.ok(!JSON.stringify(audit).includes("Тестовый Пациент"));
  process.stdout.write("PDF export, tenant isolation, and audit: OK\n");
} finally {
  if (server.exitCode === null) await new Promise((resolve) => { server.once("exit", resolve); server.kill(); });
  if (tempDir.startsWith(path.join(os.tmpdir(), "anafix-export-smoke-"))) await rm(tempDir, { recursive: true, force: true });
}
