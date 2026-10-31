import type { ExaminationInput, StoredExamination } from "../examinations/types.ts";
import type { ExaminationDraft } from "../examinations/draft.ts";
export const APPROVED_OFFLINE_HOURS = 48;
export const APPROVED_LOCAL_RETENTION_DAYS = 7;
export interface LocalDraft { id: string; mode: "new" | "edit"; examinationId?: string; expectedVersion?: number; snapshot: ExaminationDraft; revision: number; updatedAt: number }
export interface OfflineExportEvent { id: string; examinationId: string; kind: "copy" | "print" | "pdf"; occurredAt: number; rowVersion: number; grant: string }
export interface ServerConflict { id: string; operationId: string; organizationId: string; actorId: string; examinationId: string; fingerprint: string; local: StoredExamination; server: StoredExamination; createdAt: string; decision?: "local" | "server"; decidedAt?: string }

export interface OfflinePrincipal { id: string; organizationId: string; displayName: string; credentialVersion: number }
export interface OfflineGrant { version: 1; principal: OfflinePrincipal; deviceId: string; issuedAt: number; expiresAt: number; localRetentionDays?: number }
export interface OfflineOperation {
  operationId: string;
  examinationId: string;
  kind: "create" | "update" | "delete";
  expectedVersion: number;
  examinedAt: string;
  algorithmVersion: string;
  catalogVersion: string;
  input?: ExaminationInput;
  /** Original grant survives expiry so an authenticated doctor can recover the outbox. */
  grant: string;
  attempted?: boolean;
}
export interface OfflineReceipt { operationId: string; actorId: string; organizationId: string; fingerprint: string; examinationId: string; appliedVersion: number }
export type SyncResult = { status: "applied"; record: StoredExamination; duplicate: boolean } | { status: "conflict"; record: StoredExamination; conflictId?: string };
export interface LocalExamination { record: StoredExamination; state: "synced" | "pending" | "conflict"; serverRecord?: StoredExamination; conflictId?: string; syncedAt?: number }
export interface OfflineVault {
  version: 1;
  grant: string;
  access: OfflineGrant;
  lastSeen: number;
  records: LocalExamination[];
  outbox: OfflineOperation[];
  /** Both versions retained even after the doctor resolves a conflict. */
  resolvedConflicts: Array<{ local: StoredExamination; server: StoredExamination; resolvedAt: string; conflictId?: string; decision?: "local" | "server"; reportedAt?: number }>;
  drafts?: LocalDraft[];
  exportEvents?: OfflineExportEvent[];
}
export const isUuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export function decodeGrant(token: string): OfflineGrant {
  const encoded = token.split(".")[0];
  const json = new TextDecoder().decode(Uint8Array.from(atob(encoded.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)));
  const grant = JSON.parse(json) as OfflineGrant;
  if (grant.localRetentionDays !== undefined && (!Number.isInteger(grant.localRetentionDays) || grant.localRetentionDays < 1 || grant.localRetentionDays > 3650)) throw new Error("INVALID_GRANT");
  if (grant.version !== 1 || !grant.principal?.id || !grant.principal.organizationId || !isUuid(grant.deviceId) || !Number.isFinite(grant.issuedAt) || !Number.isFinite(grant.expiresAt) || grant.expiresAt <= grant.issuedAt) throw new Error("INVALID_GRANT");
  return grant;
}
export function accessAllowed(vault: OfflineVault, now = Date.now()): boolean {
  return Number.isFinite(now) && now >= vault.lastSeen - 60_000 && now >= vault.access.issuedAt - 60_000 && now < vault.access.expiresAt;
}
