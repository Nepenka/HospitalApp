import { randomUUID } from "node:crypto";
import { databaseClient } from "./postgres.ts";
export async function insertDatabaseAudit(category: "security" | "export", entry: { timestamp: string; event: string; actorId: string; organizationId?: string | null; outcome?: string }, id: string = randomUUID()): Promise<void> {
  const result = await databaseClient().query("INSERT INTO anafix.audit_event(id,category,occurred_at,organization_id,actor_id,event,metadata) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO NOTHING", [id,category,entry.timestamp,entry.organizationId ?? null,entry.actorId,entry.event,JSON.stringify(entry)]);
  if (!result.rowCount) {
    const current = (await databaseClient().query("SELECT metadata FROM anafix.audit_event WHERE id=$1", [id])).rows[0]?.metadata;
    if (JSON.stringify(current) !== JSON.stringify(entry)) {
      // JSONB key order is not stable. Compare canonical field/value pairs.
      if (JSON.stringify(Object.entries(current ?? {}).sort()) !== JSON.stringify(Object.entries(entry).sort())) throw new Error("OPERATION_REUSED");
    }
  }
}
