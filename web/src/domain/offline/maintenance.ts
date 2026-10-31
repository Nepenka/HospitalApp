import { accessAllowed, type OfflineVault, type LocalDraft, type OfflineExportEvent } from "./types.ts";
export function retainLocalCopies(value: OfflineVault, now: number): void {
  const days = value.access.localRetentionDays;
  if (!days) return; // Legacy grants never silently acquire a deletion policy.
  const cutoff = now - days * 86400_000;
  const protectedIds = new Set([...value.outbox.map(row => row.examinationId), ...(value.drafts ?? []).map(row => row.examinationId)]);
  value.records = value.records.filter(row => row.state !== "synced" || protectedIds.has(row.record.id) || !row.syncedAt || row.syncedAt > cutoff);
  value.resolvedConflicts = value.resolvedConflicts.filter(row => !row.reportedAt || row.reportedAt > cutoff);
}
export function saveLocalDraft(value: OfflineVault, draft: LocalDraft, expectedRevision: number, now: number): void {
  if (!accessAllowed(value, now)) throw new Error("ACCESS_EXPIRED");
  value.drafts ??= [];
  const current = value.drafts.find(row => row.id === draft.id);
  if ((current?.revision ?? 0) !== expectedRevision) throw new Error("DRAFT_CONFLICT");
  if (JSON.stringify(draft.snapshot).length > 64 * 1024) throw new Error("DRAFT_TOO_LARGE");
  const updated = { ...draft, snapshot: structuredClone(draft.snapshot), revision: expectedRevision + 1, updatedAt: now };
  if (current) value.drafts[value.drafts.indexOf(current)] = updated; else value.drafts.push(updated);
}
export function queueOfflineExport(value: OfflineVault, event: OfflineExportEvent, now: number): void {
  if (!accessAllowed(value, now)) throw new Error("ACCESS_EXPIRED");
  if (!value.records.some(row => row.record.id === event.examinationId && !row.record.deletedAt)) throw new Error("EXAMINATION_NOT_FOUND");
  value.exportEvents ??= [];
  if (!value.exportEvents.some(row => row.id === event.id)) value.exportEvents.push(event);
}
