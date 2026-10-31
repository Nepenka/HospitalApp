import { EncryptedOfflineVault } from "./vault.ts";
import { acknowledge, mergeHistory } from "../../domain/offline/queue.ts";
import { decodeGrant, type OfflineGrant, type OfflineVault, type SyncResult, type ServerConflict } from "../../domain/offline/types.ts";
import type { StoredExamination } from "../../domain/examinations/types.ts";

async function post(body: unknown): Promise<Response> {
  return fetch("/api/offline", { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) });
}
export async function requestGrant(deviceId: string): Promise<{ grant: string; access: OfflineGrant }> {
  const response = await post({ action: "grant", deviceId, hospitalComputerConfirmed: true });
  const data = await response.json();
  if (!response.ok) throw new Error(data.code ?? "SYNC_FAILED");
  const access = decodeGrant(data.grant);
  if (access.deviceId !== deviceId) throw new Error("INVALID_GRANT");
  return { grant: data.grant, access };
}
export async function renewAccess(vault: EncryptedOfflineVault): Promise<OfflineVault> {
  const current = await vault.read(true);
  const granted = await requestGrant(current.access.deviceId);
  if (granted.access.principal.id !== current.access.principal.id || granted.access.principal.organizationId !== current.access.principal.organizationId) throw new Error("DIFFERENT_ACCOUNT");
  return vault.mutate((value) => { value.grant = granted.grant; value.access = granted.access; value.lastSeen = granted.access.issuedAt; }, true);
}
export async function synchronizeVault(vault: EncryptedOfflineVault, progress?: (value: OfflineVault) => void): Promise<OfflineVault> {
  return navigator.locks.request("anafix-offline-sync", async () => {
    let value = await renewAccess(vault);
    progress?.(value);
    while (true) {
      value = await vault.read();
      const queued = value.outbox[0];
      if (!queued) break;
      // Persist the attempt before sending. Lost acknowledgement forbids changing this payload.
      value = await vault.mutate((state) => { const item = state.outbox.find((o) => o.operationId === queued.operationId); if (item) item.attempted = true; });
      const command = value.outbox.find((o) => o.operationId === queued.operationId);
      if (!command) continue; // Another tab edited a command which had never been sent.
      progress?.(value);
      const response = await post({ action: "sync", operation: command });
      const result = await response.json() as SyncResult & { code?: string };
      if (!response.ok && !(response.status === 409 && result.status === "conflict")) throw new Error(result.code ?? "SYNC_FAILED");
      value = await vault.mutate((state) => acknowledge(state, command.operationId, result));
      progress?.(value);
    }
    let after = "";
    for(const event of value.exportEvents ?? []) {
      const response = await post({action:"export-audit",export:event});
      const data = await response.json();
      if(!response.ok) throw new Error(data.code ?? "SYNC_FAILED");
      value = await vault.mutate(state => { state.exportEvents=(state.exportEvents ?? []).filter(row => row.id !== event.id); });
      progress?.(value);
    }
    for (const conflict of value.resolvedConflicts.filter(row => row.conflictId && row.decision && !row.reportedAt)) {
      const response = await post({ action: "conflict-decision", conflictId: conflict.conflictId, decision: conflict.decision, grant: value.grant });
      const data = await response.json();
      if (!response.ok) throw new Error(data.code ?? "SYNC_FAILED");
      value = await vault.mutate(state => { const row = state.resolvedConflicts.find(row => row.conflictId === conflict.conflictId); if(row) row.reportedAt = Date.now(); });
      progress?.(value);
    }
    const cursors = new Set<string>();
    do {
      const response = await fetch(`/api/offline${after ? `?after=${encodeURIComponent(after)}` : ""}`, { credentials: "same-origin", cache: "no-store", headers: { "X-Anafix-Offline-Grant": value.grant }, signal: AbortSignal.timeout(30_000) });
      const page = await response.json() as { records: StoredExamination[]; next: string | null; code?: string };
      if (!response.ok) throw new Error(page.code ?? "SYNC_FAILED");
      if (!Array.isArray(page.records)) throw new Error("INVALID_SYNC_RESPONSE");
      value = await vault.mutate((state) => mergeHistory(state, page.records));
      progress?.(value);
      after = page.next ?? "";
      if (after && cursors.has(after)) throw new Error("INVALID_SYNC_RESPONSE");
      cursors.add(after);
    } while (after);
    return value;
  });
}
export async function loadServerConflicts(grant: string): Promise<ServerConflict[]> {
  const response = await fetch("/api/offline?conflicts=1", { credentials: "same-origin", cache: "no-store", headers: { "X-Anafix-Offline-Grant": grant }, signal: AbortSignal.timeout(30_000) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.code ?? "SYNC_FAILED");
  if (!Array.isArray(data.conflicts)) throw new Error("INVALID_SYNC_RESPONSE");
  return data.conflicts;
}
