/** Replaces a legacy cache-first worker before unregistering. No reload or PHI deletion. */
export const DEVELOPMENT_RETIREMENT_WORKER = `
self.addEventListener("install", (event) => event.waitUntil(self.skipWaiting()));
self.addEventListener("activate", (event) => event.waitUntil((async () => {
  await self.clients.claim();
  const keys = await caches.keys();
  await Promise.all(keys.filter((key) => key.startsWith("anafix-")).map((key) => caches.delete(key)));
  await self.registration.unregister();
})()));
// Intentionally no fetch handler: even already-open tabs now use the network.
`;
