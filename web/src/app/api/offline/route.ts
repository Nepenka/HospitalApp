import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { readSession } from "@/server/auth/session";
import { activeOfflineUser, getOrganization, registerOfflineDevice, offlineDeviceIsActive } from "@/server/identity/store";
import { issueOfflineGrant, offlineAccessHours, verifyOfflineGrant } from "@/server/offline/access";
import { offlineHistoryPage, synchronizeExamination, listServerConflicts, reportConflictDecision } from "@/server/examinations/repository";
import { isUuid, type OfflineOperation, type OfflineExportEvent } from "@/domain/offline/types";
import { recordOfflineExport } from "@/server/security/export-audit";
import { databaseClient, usesPostgres } from "@/server/database/postgres";
import { CLINICAL_ALGORITHM_VERSION } from "@/domain/clinical/diagnosis";
import { SYMPTOM_CATALOG_VERSION } from "@/domain/clinical/symptom-catalog";
import { auditSecurityEvent } from "@/server/security/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "no-store, private", "Pragma": "no-cache" } });
async function user() {
  const session = await readSession();
  if (!session || session.user.mustChangePassword || session.user.role !== "clinician") return null;
  return activeOfflineUser(session.user);
}
async function permittedHours(organizationId: string): Promise<number | null> {
  const globalHours = offlineAccessHours();
  const organization = await getOrganization(organizationId);
  return globalHours && organization?.license.offlineAllowed && organization.license.offlineHours ? Math.min(globalHours, organization.license.offlineHours) : null;
}
async function limitedJson(request: NextRequest): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new Error("INVALID_INPUT");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("INVALID_INPUT");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 64 * 1024) { await reader.cancel(); throw new Error("INVALID_INPUT"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const raw = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("INVALID_INPUT");
  return raw;
}
export async function GET(request: NextRequest) {
  try {
    const current = await user();
    if (!current) return json({ code: "ONLINE_LOGIN_REQUIRED" }, 401);
    const hours = await permittedHours(current.organizationId!);
    if (!hours) return json({ code: "OFFLINE_POLICY_PENDING" }, 403);
    const token = request.headers.get("x-anafix-offline-grant");
    if (!token) return json({ enabled: true, hours });
    const grant = verifyOfflineGrant(token, current);
    if (!(await offlineDeviceIsActive(current.id, current.organizationId!, grant.deviceId))) return json({ code: "DEVICE_BLOCKED" }, 403);
    if (request.nextUrl.searchParams.get("conflicts") === "1") return json({ conflicts: await listServerConflicts(current) });
    const after = request.nextUrl.searchParams.get("after") ?? "";
    if (after && !isUuid(after)) return json({ code: "INVALID_INPUT" }, 400);
    auditSecurityEvent("offline.history_downloaded", { actorId: current.id, organizationId: current.organizationId!, outcome: "success" });
    return json(await offlineHistoryPage(current, after));
  } catch { return json({ code: "OFFLINE_ACCESS_DENIED" }, 403); }
}
export async function POST(request: NextRequest) {
  const expectedOrigin = process.env.APP_ORIGIN || (process.env.NODE_ENV !== "production" ? `http://${request.headers.get("host")}` : "");
  if (!expectedOrigin || request.headers.get("origin") !== expectedOrigin) return json({ code: "ORIGIN_DENIED" }, 403);
  try {
    const current = await user();
    if (!current) return json({ code: "ONLINE_LOGIN_REQUIRED" }, 401);
    const body = await limitedJson(request);
    if (body.action === "grant") {
      const hours = await permittedHours(current.organizationId!);
      if (!hours) return json({ code: "OFFLINE_POLICY_PENDING" }, 403);
      if (!isUuid(body.deviceId) || body.hospitalComputerConfirmed !== true) return json({ code: "HOSPITAL_COMPUTER_REQUIRED" }, 400);
      const issued = issueOfflineGrant(current, body.deviceId, hours);
      await registerOfflineDevice(current.id, current.organizationId!, body.deviceId, issued.access.expiresAt);
      auditSecurityEvent("offline.enrolled", { actorId: current.id, organizationId: current.organizationId!, outcome: "success" });
      return json(issued);
    }
    if (body.action === "export-audit") {
      const event = body.export as OfflineExportEvent | undefined;
      if (!event || !isUuid(event.id) || !isUuid(event.examinationId) || !["copy","print","pdf"].includes(event.kind) || typeof event.grant !== "string" || !Number.isSafeInteger(event.occurredAt) || !Number.isSafeInteger(event.rowVersion) || event.rowVersion < 0) return json({code:"INVALID_INPUT"},400);
      const grant = verifyOfflineGrant(event.grant,current,true);
      if(event.occurredAt < grant.issuedAt-60_000 || event.occurredAt >= grant.expiresAt || event.occurredAt > Date.now()+60_000) return json({code:"INVALID_INPUT"},400);
      if (!(await offlineDeviceIsActive(current.id,current.organizationId!,grant.deviceId))) return json({code:"DEVICE_BLOCKED"},403);
      // Include tombstones: an export requested before deletion still needs an audit entry.
      const exists = usesPostgres() ? (await databaseClient().query("SELECT id FROM anafix.examination WHERE id=$1 AND organization_id=$2",[event.examinationId,current.organizationId])).rowCount : (await offlineHistoryPage(current,"")).records.some(row => row.id === event.examinationId);
      if(!exists) {
        // File prototype history can span multiple pages.
        let after="", found=false;
        if(!usesPostgres()) do { const page = await offlineHistoryPage(current,after); found ||= page.records.some(row => row.id === event.examinationId); after=page.next ?? ""; } while(after && !found);
        if(!found) return json({code:"EXAMINATION_NOT_FOUND"},404);
      }
      await recordOfflineExport(event,current); return json({ok:true});
    }
    if (body.action === "conflict-decision") {
      if (!isUuid(body.conflictId) || !["local","server"].includes(String(body.decision)) || typeof body.grant !== "string") return json({ code: "INVALID_INPUT" },400);
      const grant = verifyOfflineGrant(body.grant,current,true);
      if (!(await offlineDeviceIsActive(current.id,current.organizationId!,grant.deviceId))) return json({ code: "DEVICE_BLOCKED" },403);
      await reportConflictDecision(current,body.conflictId,body.decision as "local" | "server");
      auditSecurityEvent("offline.conflict_decision", { actorId: current.id, organizationId: current.organizationId!, outcome: "success" });
      return json({ ok: true });
    }
    if (body.action !== "sync" || !body.operation || typeof body.operation !== "object") return json({ code: "INVALID_INPUT" }, 400);
    const command = body.operation as OfflineOperation;
    if (!isUuid(command.operationId) || !isUuid(command.examinationId) || !["create", "update", "delete"].includes(command.kind)
      || !Number.isSafeInteger(command.expectedVersion) || command.expectedVersion < 0 || (command.kind === "create" ? command.expectedVersion !== 0 : command.expectedVersion < 1)
      || typeof command.grant !== "string" || typeof command.examinedAt !== "string") return json({ code: "INVALID_INPUT" }, 400);
    const grant = verifyOfflineGrant(command.grant, current, true);
    if (!(await offlineDeviceIsActive(current.id, current.organizationId!, grant.deviceId))) return json({ code: "DEVICE_BLOCKED" }, 403);
    const examined = Date.parse(command.examinedAt);
    if (!Number.isFinite(examined) || (command.kind === "create" && (examined < grant.issuedAt - 60_000 || examined > grant.expiresAt || examined > Date.now() + 60_000))) return json({ code: "INVALID_INPUT" }, 400);
    if (command.algorithmVersion !== CLINICAL_ALGORITHM_VERSION || command.catalogVersion !== SYMPTOM_CATALOG_VERSION) return json({ code: "ALGORITHM_REVIEW_REQUIRED" }, 409);
    const fingerprint = createHash("sha256").update(JSON.stringify(command)).digest("hex");
    const result = await synchronizeExamination(current, command, fingerprint);
    auditSecurityEvent(result.status === "conflict" ? "offline.conflict" : "offline.synchronized", { actorId: current.id, organizationId: current.organizationId!, outcome: "success" });
    return json(result, result.status === "conflict" ? 409 : 200);
  } catch (error) {
    const code = error instanceof Error ? error.message : "SYNC_FAILED";
    if (code === "INVALID_INPUT" || error instanceof SyntaxError) return json({ code: "INVALID_INPUT" }, 400);
    if (code === "EXAMINATION_NOT_FOUND") return json({ code }, 404);
    if (code === "OPERATION_REUSED") return json({ code }, 409);
    if (code === "INVALID_GRANT") return json({ code }, 403);
    if (code === "DEVICE_BLOCKED") return json({ code }, 403);
    return json({ code: "SYNC_FAILED" }, 500);
  }
}
