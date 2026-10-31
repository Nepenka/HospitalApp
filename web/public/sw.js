const CACHE_NAME = "anafix-public-shell-v2";
const SHELL = "/offline";
// Replaced by the build-aware endpoint; includes lazy public chunks and fonts.
const BUILD_ASSETS = [];
const staticPath = (url) => url.origin === self.location.origin && (url.pathname.startsWith("/_next/static/") || url.pathname === "/fonts/NotoSans.ttf");

async function prepareShell() {
  const cache = await caches.open(CACHE_NAME);
  const response = await fetch(SHELL, { credentials: "omit", cache: "no-store" });
  if (!response.ok || response.headers.get("X-Anafix-Offline-Shell") !== "1") throw new Error("Offline shell unavailable");
  const html = await response.clone().text();
  const assets = [...new Set([...BUILD_ASSETS, ...[...html.matchAll(/(?:src|href)="([^"<>]+)"/g)].map((m) => m[1].replaceAll("&amp;", "&"))].map((asset) => new URL(asset, self.location.origin)).filter(staticPath).map((url) => url.href))];
  await Promise.all(assets.map(async (url) => {
    const asset = await fetch(url, { credentials: "omit" });
    if (!asset.ok) throw new Error("Offline asset unavailable");
    await cache.put(url, asset);
  }));
  await cache.put(SHELL, response);
}
self.addEventListener("install", (event) => event.waitUntil(prepareShell()));
// Activate when old tabs close; do not mix old and new build bundles.
self.addEventListener("activate", (event) => event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("anafix-") && key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (staticPath(url)) {
    event.respondWith(caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) await cache.put(request, response.clone());
      return response;
    }));
  } else if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(async () => {
      const shell = await (await caches.open(CACHE_NAME)).match(SHELL);
      if (shell && url.pathname !== SHELL) return Response.redirect(new URL(SHELL, self.location.origin).href, 302);
      return shell || new Response("Offline workspace is not installed. Reconnect to prepare it.", { status: 503, headers: { "Content-Type": "text/plain;charset=utf-8" } });
    }));
  }
  // No API replies, RSC responses, protected HTML, PDFs or PHI in Cache Storage.
});
