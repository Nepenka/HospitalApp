import "server-only";
import { stat, readFile } from "node:fs/promises";
import path from "node:path";
import { listOrganizations } from "@/server/identity/store";
import { readSecurityAudit } from "@/server/security/audit";
import { offlineAccessHours } from "@/server/offline/access";
import { usesPostgres, databaseClient } from "@/server/database/postgres";
export async function getSystemStatus() {
  let identity = "available";
  try { await listOrganizations(); } catch { identity = "error"; }
  let examinationStorage = "available";
  try { if (usesPostgres()) await databaseClient().query("SELECT id FROM anafix.examination LIMIT 1"); else await stat(/* turbopackIgnore: true */ process.env.EXAMINATION_STORE_PATH || path.join(process.cwd(), ".data", "examinations.enc")); }
  catch (error) { examinationStorage = (error as NodeJS.ErrnoException).code === "ENOENT" ? "not_created" : "error"; }
  let version = "development";
  try { version = (await readFile(path.join(process.cwd(), ".next", "BUILD_ID"), "utf8")).trim().slice(0,80); } catch { /* Development has no production build identifier. */ }
  let backup: { status: string; completedAt: string | null; verifiedAt: string | null; restored: boolean; offsite: boolean; stale: boolean } = { status: "not_configured", completedAt: null, verifiedAt: null, restored: false, offsite: false, stale: false };
  if (process.env.BACKUP_STATUS_PATH) {
    try {
      const file = process.env.BACKUP_STATUS_PATH;
      if ((await stat(/* turbopackIgnore: true */ file)).size > 8192) throw new Error("INVALID_REPORT");
      const report = JSON.parse(await readFile(/* turbopackIgnore: true */ file, "utf8"));
      if (!["success", "failure"].includes(report.status) || typeof report.completedAt !== "string" || !Number.isFinite(Date.parse(report.completedAt)) || Date.parse(report.completedAt) > Date.now() + 60_000) throw new Error("INVALID_REPORT");
      const verifiedAt=typeof report.verifiedAt === "string" && Number.isFinite(Date.parse(report.verifiedAt)) && Date.parse(report.verifiedAt)<=Date.now()+60_000 ? new Date(report.verifiedAt).toISOString() : null;
      backup = { status: report.status, completedAt: new Date(report.completedAt).toISOString(), verifiedAt, restored: report.restored === true && verifiedAt !== null, offsite: report.offsite === true, stale: Date.now()-Date.parse(report.completedAt)>36*3600_000 };
    } catch { backup = { status: "unknown", completedAt: null, verifiedAt: null, restored: false, offsite: false, stale: false }; }
  }
  let auditAvailable = true;
  let events: Awaited<ReturnType<typeof readSecurityAudit>> = [];
  try { events = await readSecurityAudit(); if (!usesPostgres()) await stat(/* turbopackIgnore: true */ process.env.SECURITY_AUDIT_PATH || path.join(process.cwd(), ".data", "security-audit.jsonl")); } catch { auditAvailable = false; }
  return { identity, examinationStorage, storageBackend: usesPostgres() ? "PostgreSQL" : "files", version, backup, auditAvailable, recentFailures: events.filter(event => event.outcome === "failure").length, lastSyncAt: events.find(event => event.event === "offline.synchronized")?.timestamp ?? null, offlineHours: offlineAccessHours(), environment: process.env.NODE_ENV };
}
