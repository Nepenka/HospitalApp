import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../../../public/sw.js", import.meta.url), "utf8");
function worker({ missingAsset = false, buildAssets = [] } = {}) {
  const handlers = new Map(), stores = new Map();
  let disconnected = false;
  const origin = "https://hospital.example";
  const key = (request) => new URL(typeof request === "string" ? request : request.url, origin).href;
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const cache = stores.get(name);
      return { match: async (request) => cache.get(key(request))?.clone(), put: async (request, response) => { cache.set(key(request), response.clone()); } };
    },
    keys: async () => [...stores.keys()],
    delete: async (name) => stores.delete(name),
  };
  const calls = [];
  const fetch = async (request) => {
    const url = new URL(typeof request === "string" ? request : request.url, origin);
    calls.push(url.pathname);
    if (disconnected) throw new Error("Network disconnected");
    if (url.pathname === "/offline") return new Response('<html><script src="/_next/static/offline.js"></script><link href="/_next/static/styles.css"><a href="/history/private.pdf">Online PDF</a></html>', { headers: { "X-Anafix-Offline-Shell": "1" } });
    if (url.pathname.startsWith("/_next/static/") || url.pathname === "/fonts/NotoSans.ttf") return new Response("public asset", { status: missingAsset ? 404 : 200 });
    return new Response("private response", { headers: { "Cache-Control": "no-store" } });
  };
  vm.runInNewContext(source.replace("const BUILD_ASSETS = [];", `const BUILD_ASSETS = ${JSON.stringify(buildAssets)};`), { self: { location: { origin }, clients: { claim: async () => undefined }, addEventListener: (name, handler) => handlers.set(name, handler) }, caches, fetch, URL, Response });
  return {
    stores, calls,
    offline: () => { disconnected = true; },
    install: () => { let promise; handlers.get("install")({ waitUntil: (value) => { promise = value; } }); return promise; },
    fetch: (url, mode = "cors", method = "GET") => { let promise; handlers.get("fetch")({ request: { url: `${origin}${url}`, mode, method }, respondWith: (value) => { promise = value; } }); return promise; },
  };
}
test("worker precaches only generic shell and public build assets", async () => {
  const w = worker(); await w.install();
  assert.deepEqual(w.calls.sort(), ["/_next/static/offline.js", "/_next/static/styles.css", "/offline"].sort());
  assert.equal([...w.stores.values()][0].size, 3);
  for (const url of ["/api/offline", "/history/private.pdf", "/history?_rsc=test"]) assert.equal(w.fetch(url), undefined);
  assert.equal(w.fetch("/api/offline", "cors", "POST"), undefined);
});
test("offline navigation redirects to matching public route and reload uses cached shell", async () => {
  const w = worker(); await w.install(); w.offline();
  const redirect = await w.fetch("/history/clinical-id", "navigate");
  assert.equal(redirect.status, 302);
  assert.equal(redirect.headers.get("location"), "https://hospital.example/offline");
  const shell = await w.fetch("/offline", "navigate");
  assert.equal(shell.status, 200);
  assert.ok((await shell.text()).includes("offline.js"));
  assert.equal(await (await w.fetch("/_next/static/offline.js")).text(), "public asset");
});
test("missing asset aborts preparation rather than publishing a broken offline shell", async () => {
  const w = worker({ missingAsset: true });
  await assert.rejects(w.install(), /Offline asset unavailable/);
  assert.ok(![...w.stores.values()][0].has("https://hospital.example/offline"));
});
test("public build inventory prepares lazy chunks, ignoring private and cross-origin entries", async () => {
  const w = worker({ buildAssets: ["/_next/static/lazy-wizard.js", "/api/offline", "https://other.example/_next/static/untrusted.js"] });
  await w.install(); w.offline();
  assert.equal(await (await w.fetch("/_next/static/lazy-wizard.js")).text(), "public asset");
  assert.ok(!w.calls.includes("/api/offline"));
  assert.ok(!w.calls.includes("/_next/static/untrusted.js"));
});
test("PDF font is available offline, but no other public file or generated PDF is cached",async()=>{
  const w=worker({buildAssets:["/fonts/NotoSans.ttf","/fonts/patient-private.ttf","/history/exam.pdf"]});
  await w.install();w.offline();
  assert.equal(await(await w.fetch("/fonts/NotoSans.ttf")).text(),"public asset");
  assert.equal(w.fetch("/fonts/patient-private.ttf"),undefined);
  assert.equal(w.fetch("/history/exam.pdf"),undefined);
  assert.ok(!w.calls.includes("/history/exam.pdf"));
});
