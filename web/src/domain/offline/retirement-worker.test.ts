import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { DEVELOPMENT_RETIREMENT_WORKER } from "./retirement-worker.ts";

test("development retirement replaces stale controllers without reload or medical storage deletion", async () => {
  const handlers = new Map<string, (event: { waitUntil: (value: Promise<unknown>) => void }) => void>();
  const events: string[] = [];
  const caches = new Set(["anafix-static-v1", "anafix-public-shell-old", "another-app-cache"]);
  vm.runInNewContext(DEVELOPMENT_RETIREMENT_WORKER, {
    self: {
      addEventListener: (name: string, handler: (event: { waitUntil: (value: Promise<unknown>) => void }) => void) => handlers.set(name, handler),
      skipWaiting: async () => { events.push("skipWaiting"); },
      clients: { claim: async () => { events.push("claim"); } },
      registration: { unregister: async () => { events.push("unregister"); } },
    },
    caches: { keys: async () => [...caches], delete: async (name: string) => { events.push(`delete:${name}`); caches.delete(name); } },
    indexedDB: { deleteDatabase: () => { throw new Error("Medical storage must not be touched"); } },
  });
  for (const name of ["install", "activate"]) {
    let pending: Promise<unknown> | undefined;
    handlers.get(name)!({ waitUntil: (value) => { pending = value; } });
    await pending;
  }
  assert.deepEqual(events, ["skipWaiting", "claim", "delete:anafix-static-v1", "delete:anafix-public-shell-old", "unregister"]);
  assert.deepEqual([...caches], ["another-app-cache"]);
  assert.equal(handlers.has("fetch"), false, "existing clients use network even after unregister");
});
