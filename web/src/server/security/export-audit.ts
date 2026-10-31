import "server-only";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { SessionUser } from "@/server/auth/types";
import { usesPostgres } from "@/server/database/postgres";
import { insertDatabaseAudit } from "@/server/database/audit";
import type { OfflineExportEvent } from "@/domain/offline/types";

export type ExaminationExportKind = "print" | "copy" | "pdf";

const auditPath = process.env.EXPORT_AUDIT_PATH || path.join(process.cwd(), ".data", "examination-export-audit.jsonl");
let offlineQueue: Promise<void> = Promise.resolve();

/** Client-reported export intent, not proof that a printer/download actually completed. */
export async function recordOfflineExport(event: OfflineExportEvent, user: SessionUser): Promise<void> {
  const entry = { id:event.id, timestamp:new Date(event.occurredAt).toISOString(), event:`examination.export.${event.kind}`, actorId:user.id, organizationId:user.organizationId, examinationId:event.examinationId, rowVersion:event.rowVersion, origin:"offline-client", outcome:"requested" };
  if (usesPostgres()) return insertDatabaseAudit("export",entry,`offline-export:${event.id}`);
  const operation = offlineQueue.then(async () => {
    let previous="";
    try { previous = await readFile(/* turbopackIgnore: true */ auditPath,"utf8"); } catch(error) { if((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    const duplicate = previous.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)).find(row => row.id === event.id);
    if(duplicate) {
      if(JSON.stringify(duplicate) !== JSON.stringify(entry)) throw new Error("OPERATION_REUSED");
      return;
    }
    await mkdir(path.dirname(auditPath),{recursive:true});
    await appendFile(auditPath,`${JSON.stringify(entry)}\n`,{encoding:"utf8",mode:0o600});
  });
  offlineQueue=operation.catch(()=>{}); return operation;
}

/** Write one metadata-only audit entry before releasing medical data to the browser. */
export async function recordExaminationExport(kind: ExaminationExportKind, examinationId: string, user: SessionUser): Promise<void> {
  const entry = {
    timestamp: new Date().toISOString(),
    event: `examination.export.${kind}`,
    actorId: user.id,
    organizationId: user.organizationId,
    examinationId,
    outcome: "requested",
  };
  if (usesPostgres()) return insertDatabaseAudit("export", entry);
  await mkdir(path.dirname(auditPath), { recursive: true });
  await appendFile(auditPath, `${JSON.stringify(entry)}\n`, { encoding: "utf8", mode: 0o600 });
}
