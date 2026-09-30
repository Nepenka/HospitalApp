import "server-only";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { SessionUser } from "@/server/auth/types";

export type ExaminationExportKind = "print" | "copy" | "pdf";

const auditPath = process.env.EXPORT_AUDIT_PATH || path.join(process.cwd(), ".data", "examination-export-audit.jsonl");

/** Write one metadata-only audit entry before releasing medical data to the browser. */
export async function recordExaminationExport(kind: ExaminationExportKind, examinationId: string, user: SessionUser): Promise<void> {
  await mkdir(path.dirname(auditPath), { recursive: true });
  const entry = {
    timestamp: new Date().toISOString(),
    event: `examination.export.${kind}`,
    actorId: user.id,
    organizationId: user.organizationId,
    examinationId,
    outcome: "requested",
  };
  await appendFile(auditPath, `${JSON.stringify(entry)}\n`, { encoding: "utf8", mode: 0o600 });
}
