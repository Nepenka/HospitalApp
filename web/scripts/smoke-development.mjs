import assert from "node:assert/strict";
import { createHmac, createHash, createCipheriv, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";

// Never stop or reuse a user's running development server.
try { await access(".next/dev/lock"); throw new Error("Existing development lock: close your dev server before this isolated check."); }
catch (error) { if (error.code !== "ENOENT") throw error; }
const tempDir = await mkdtemp(path.join(os.tmpdir(), "anafix-dev-smoke-"));
const secret = "synthetic-development-session-secret-not-used-in-production";
const fixtureNow = new Date().toISOString();
const cipherIv = randomBytes(12);
const fixtureCipher = createCipheriv("aes-256-gcm", createHash("sha256").update(secret).digest(), cipherIv);
const fixtureData = { version: 1, organizations: [{ id: "synthetic-hospital", name: "Synthetic hospital", code: "test", status: "active", createdAt: fixtureNow }], accounts: [{ id: "synthetic-doctor", organizationId: "synthetic-hospital", role: "clinician", displayName: "Synthetic doctor", login: "synthetic-doctor", status: "active", mustChangePassword: false }], billingEntries: [], sessions: [{ id: "synthetic-session", userId: "synthetic-doctor", organizationId: "synthetic-hospital", role: "clinician", createdAt: fixtureNow, expiresAt: new Date(Date.now() + 3600_000).toISOString(), revokedAt: null }] };
const fixtureBytes = Buffer.concat([fixtureCipher.update(JSON.stringify(fixtureData)), fixtureCipher.final()]);
await writeFile(path.join(tempDir, "identities.enc"), JSON.stringify({ version: 1, iv: cipherIv.toString("base64"), tag: fixtureCipher.getAuthTag().toString("base64"), ciphertext: fixtureBytes.toString("base64") }));
const port = await new Promise((resolve, reject) => {
  const listener = createServer(); listener.once("error", reject);
  listener.listen(0, "127.0.0.1", () => { const address = listener.address(); listener.close(() => resolve(address.port)); });
});
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-p", String(port), "-H", "127.0.0.1"], {
  cwd: process.cwd(), windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, STORAGE_BACKEND: "files", NODE_ENV: "development", AUTH_SESSION_SECRET: secret, APP_ORIGIN: origin,
    OFFLINE_ENABLED: "false", OFFLINE_ACCESS_HOURS: "", EXAMINATION_DATA_KEY: secret, IDENTITY_DATA_KEY: secret,
    EXAMINATION_STORE_PATH: path.join(tempDir, "examinations.enc"), IDENTITY_STORE_PATH: path.join(tempDir, "identities.enc"), EXPORT_AUDIT_PATH: path.join(tempDir, "audit.jsonl"), SECURITY_AUDIT_PATH: path.join(tempDir, "security.jsonl") },
});
let output = "";
server.stdout.on("data", (chunk) => { output += chunk.toString(); });
server.stderr.on("data", (chunk) => { output += chunk.toString(); });
const payload = { user: { id: "synthetic-doctor", organizationId: "synthetic-hospital", role: "clinician", displayName: "Synthetic doctor", mustChangePassword: false }, sessionId: "synthetic-session", issuedAt: Math.floor(Date.now() / 1000), expiresAt: Math.floor(Date.now() / 1000) + 3600 };
const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
const cookie = `anafix-session=${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`;
try {
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    assert.equal(server.exitCode, null, `Development server stopped: ${output}`);
    try {
      const response = await fetch(`${origin}/login`, { redirect: "manual", signal: AbortSignal.timeout(1000) });
      if (response.status === 200) { ready = true; break; }
    } catch { /* Compiler warming up. */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.ok(ready, `Development server failed to start: ${output}`);
  const assets = new Set();
  for (const locale of ["ru", "en"]) {
    const response = await fetch(`${origin}/`, { headers: { Cookie: `${cookie}; anafix-locale=${locale}` } });
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /<form[^>]*autoComplete="off"[^>]*data-examination-steps="true"/i);
    assert.ok(html.includes('data-appearance="form"'));
    for (const match of html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="([^"<>]+)"[^>]*>/g)) {
      const url = new URL(match[1].replaceAll("&amp;", "&"), origin);
      if (!url.pathname.includes("/_next/static/")) continue;
      assert.ok(url.pathname.startsWith("/__anafix_dev_v2/_next/static/"), "Development URLs must not reuse legacy cached URLs");
      assets.add(url.href);
    }
  }
  assert.ok(assets.size > 0);
  let freshWizard = false;
  for (const url of assets) {
    // Anonymous asset downloads must not redirect to login through the proxy.
    const response = await fetch(url, { redirect: "manual" });
    assert.equal(response.status, 200, `Asset unavailable: ${new URL(url).pathname}`);
    assert.match(response.headers.get("cache-control") ?? "", /no-store|no-cache/);
    const text = await response.text();
    if (text.includes("data-examination-steps")) freshWizard = true;
  }
  assert.ok(freshWizard, "The downloaded client bundle contains the new step form, not the previous nav-only version");
  const worker = await fetch(`${origin}/offline-worker`);
  assert.equal(worker.status, 200);
  assert.match(worker.headers.get("cache-control"), /no-store/);
  const workerScript = await worker.text();
  assert.ok(workerScript.includes("self.skipWaiting()") && workerScript.includes("self.clients.claim()") && workerScript.includes("self.registration.unregister()"));
  assert.ok(!workerScript.includes('addEventListener("fetch"'), "Development retirement must never serve cached bundles");
  console.log("Development RU/EN HTML and all client assets agree; cold asset URLs, anonymous downloads and retirement worker: OK");
} finally {
  if (server.exitCode === null) {
    if (process.platform === "win32") await new Promise((resolve) => {
      const killer = spawn("taskkill", ["/PID", String(server.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
      killer.once("exit", resolve); killer.once("error", resolve);
    });
    else server.kill("SIGTERM");
    if (server.exitCode === null) await new Promise((resolve) => { server.once("exit", resolve); setTimeout(resolve, 3000).unref(); });
  }
  const relative = path.relative(os.tmpdir(), tempDir);
  assert.ok(!relative.startsWith("..") && !path.isAbsolute(relative) && path.basename(tempDir).startsWith("anafix-dev-smoke-"));
  await rm(tempDir, { recursive: true, force: true });
}
