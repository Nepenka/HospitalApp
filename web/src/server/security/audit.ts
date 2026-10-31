import "server-only";
import { appendFile, mkdir } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import path from "node:path";
import { usesPostgres, databaseClient } from "@/server/database/postgres";
import { insertDatabaseAudit } from "@/server/database/audit";
type SecurityEvent = "authentication.password_verified" | "authentication.succeeded" | "authentication.failed" | "authentication.rate_limited" | "session.ended" | "session.revoked" | "authorization.denied" | "examination.created" | "examination.viewed" | "examination.updated" | "examination.comment_updated" | "examination.deleted" | "organization.created" | "organization.retention_updated" | "organization.status_updated" | "organization.license_updated" | "account.created" | "account.updated" | "account.password_reset" | "billing.entry_created" | "billing.entry_voided" | "device.status_updated";
type OfflineEvent = "offline.enrolled" | "offline.history_downloaded" | "offline.synchronized" | "offline.conflict" | "offline.conflict_decision";
export interface SecurityAuditRecord { timestamp: string; event: SecurityEvent | OfflineEvent; outcome: "success" | "failure"; actorId: string; organizationId?: string; resourceId?: string }
const auditPath = process.env.SECURITY_AUDIT_PATH || path.join(process.cwd(), ".data", "security-audit.jsonl");
let queue: Promise<void> = Promise.resolve();
export function auditSecurityEvent(event: SecurityEvent | OfflineEvent, details: { actorId?: string; outcome: "success" | "failure"; resourceId?: string; organizationId?: string }): void {
  const record: SecurityAuditRecord = { timestamp: new Date().toISOString(), event, outcome: details.outcome, actorId: details.actorId ?? "anonymous", resourceId: details.resourceId, organizationId: details.organizationId };
  if (process.env.NODE_ENV !== "test") console.info(JSON.stringify(record));
  queue = queue.then(async () => { if (usesPostgres()) return insertDatabaseAudit("security", record); await mkdir(path.dirname(auditPath), { recursive: true }); await appendFile(auditPath, `${JSON.stringify(record)}\n`, { mode: 0o600 }); }).catch(() => { console.error("Security audit persistence failed"); });
}
export async function readSecurityAudit(organizationId?: string): Promise<SecurityAuditRecord[]> {
  await queue;
  if (usesPostgres()) {
    const records = (await databaseClient().query("SELECT metadata FROM anafix.audit_event WHERE category='security' AND ($1::text IS NULL OR organization_id=$1) AND ($1::text IS NULL OR event ~ '^(account\\.|session\\.|organization\\.|device\\.|authentication\\.|authorization\\.|offline\\.enrolled$)') ORDER BY occurred_at DESC LIMIT 200", [organizationId ?? null])).rows.map(row => row.metadata as SecurityAuditRecord);
    return records.map(({resourceId,...item}) => item.event.startsWith("examination.") ? item : {...item,resourceId});
  }
  const records: SecurityAuditRecord[] = [];
  const stream = createReadStream(/* turbopackIgnore: true */ auditPath, { encoding: "utf8" });
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  try {
    for await (const line of lines) {
      let item: SecurityAuditRecord;
      try { item = JSON.parse(line); } catch { continue; }
      // Organization administrators never receive clinical events or record identifiers.
      if (organizationId && (item.organizationId !== organizationId || !/^(account\.|session\.|organization\.|device\.|authentication\.|authorization\.|offline\.enrolled$)/.test(item.event))) continue;
      if (!item.timestamp || !item.event) continue;
      records.push(item); if (records.length > 200) records.shift();
    }
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  finally { lines.close(); stream.destroy(); }
  return records.reverse().map(({ resourceId, ...item }) => item.event.startsWith("examination.") ? item : { ...item, resourceId });
}
