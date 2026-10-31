import { prepareExamination } from "../examinations/prepare.ts";
import { selectionFromStoredSymptom } from "../clinical/symptom-catalog.ts";
import type { ExaminationInput, StoredExamination } from "../examinations/types.ts";
import { accessAllowed, type OfflineVault, type SyncResult, type OfflineOperation } from "./types.ts";

export function inputFromRecord(record: StoredExamination): ExaminationInput {
  return { fullName: record.patient.fullName, probableAllergen: record.probableAllergen ?? "", allergenContact: record.allergenContact, acuteOnset: record.acuteOnset, physicianComment: record.physicianComment ?? "", reactionDate: record.reactionDate ?? "", reactionTime: record.reactionTime ?? "", vitals: record.vitals, selectedSymptoms: record.selectedSymptoms.map(selectionFromStoredSymptom).filter((s) => s !== null) };
}
export function queueExamination(vault: OfflineVault, input: ExaminationInput, id: string, operationId: string, now: number, openedVersion?: number): string {
  if (!accessAllowed(vault, now)) throw new Error("ACCESS_EXPIRED");
  const local = vault.records.find((r) => r.record.id === id);
  const pending = vault.outbox.find((o) => o.examinationId === id);
  if (local && (local.state === "conflict" || local.record.deletedAt || (local.state === "pending" && (!pending || pending.attempted || pending.kind === "delete")))) throw new Error("RECORD_PENDING");
  const { fullName, ...clinical } = prepareExamination(input);
  const timestamp = new Date(now).toISOString();
  const previous = local?.record;
  const record: StoredExamination = { ...(previous ?? { id, organizationId: vault.access.principal.organizationId, patient: { id, fullName }, examinedAt: timestamp, createdAt: timestamp, createdBy: vault.access.principal.id, deletedAt: null, deletedBy: null }), ...clinical, patient: { id: previous?.patient.id ?? id, fullName }, updatedAt: timestamp, updatedBy: vault.access.principal.id, rowVersion: previous?.rowVersion ?? 0 };
  const command: OfflineOperation = { operationId, examinationId: id, kind: pending?.kind ?? (previous ? "update" : "create"), expectedVersion: pending?.expectedVersion ?? openedVersion ?? previous?.rowVersion ?? 0, examinedAt: record.examinedAt, algorithmVersion: record.algorithmVersion, catalogVersion: record.catalogVersion, input, grant: pending?.grant ?? vault.grant };
  if (local) { local.record = record; local.state = "pending"; }
  else vault.records.push({ record, state: "pending" });
  if (pending) vault.outbox[vault.outbox.indexOf(pending)] = command;
  else vault.outbox.push(command);
  return id;
}
export function queueDeletion(vault: OfflineVault, id: string, operationId: string, now: number): void {
  if (!accessAllowed(vault, now)) throw new Error("ACCESS_EXPIRED");
  const local = vault.records.find((r) => r.record.id === id);
  if (!local || local.state !== "synced" || local.record.deletedAt) throw new Error("RECORD_PENDING");
  const record = local.record;
  vault.outbox.push({ operationId, examinationId: id, kind: "delete", expectedVersion: record.rowVersion, examinedAt: record.examinedAt, algorithmVersion: record.algorithmVersion, catalogVersion: record.catalogVersion, grant: vault.grant });
  local.state = "pending";
  record.deletedAt = new Date(now).toISOString();
}
export function acknowledge(vault: OfflineVault, operationId: string, result: SyncResult): void {
  const command = vault.outbox.find((o) => o.operationId === operationId);
  if (!command || result.record.id !== command.examinationId || result.record.organizationId !== vault.access.principal.organizationId) throw new Error("INVALID_SYNC_RESPONSE");
  const local = vault.records.find((r) => r.record.id === command.examinationId);
  if (!local) throw new Error("INVALID_SYNC_RESPONSE");
  if (result.status === "conflict") { local.state = "conflict"; local.serverRecord = result.record; local.conflictId = result.conflictId; }
  else { local.record = result.record; local.state = "synced"; local.syncedAt = Date.now(); delete local.serverRecord; delete local.conflictId; }
  vault.outbox = vault.outbox.filter((o) => o.operationId !== operationId);
}
export function mergeHistory(vault: OfflineVault, incoming: StoredExamination[]): void {
  for (const record of incoming) {
    if (record.organizationId !== vault.access.principal.organizationId) throw new Error("INVALID_SYNC_RESPONSE");
    const local = vault.records.find((r) => r.record.id === record.id);
    if (!local) vault.records.push({ record, state: "synced", syncedAt: Date.now() });
    else if (local.state === "synced" && record.rowVersion >= local.record.rowVersion) { local.record = record; local.syncedAt = Date.now(); }
    else if (local.state === "conflict") local.serverRecord = record;
    // Pending local changes must never be silently replaced by a download.
  }
}
export function resolveConflict(vault: OfflineVault, id: string, choice: "server" | "local", operationId: string, now: number): void {
  if (!accessAllowed(vault, now)) throw new Error("ACCESS_EXPIRED");
  const local = vault.records.find((r) => r.record.id === id);
  if (!local || local.state !== "conflict" || !local.serverRecord) throw new Error("CONFLICT_NOT_FOUND");
  const mine = local.record, theirs = local.serverRecord;
  if (choice === "local" && theirs.deletedAt) throw new Error("SERVER_RECORD_DELETED");
  vault.resolvedConflicts.push({ local: structuredClone(mine), server: structuredClone(theirs), resolvedAt: new Date(now).toISOString(), conflictId: local.conflictId, decision: choice });
  local.record = structuredClone(theirs); local.state = "synced"; delete local.serverRecord;
  local.syncedAt = now; delete local.conflictId;
  if (choice === "local") {
    if (mine.deletedAt) queueDeletion(vault, id, operationId, now);
    else queueExamination(vault, inputFromRecord(mine), id, operationId, now);
  }
}
