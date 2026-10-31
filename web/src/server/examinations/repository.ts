import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SessionUser } from "@/server/auth/types";
import type { ExaminationSummary, StoredExamination } from "@/domain/examinations/types";
import { paginateExaminations, type ExaminationHistoryPage, type ExaminationHistoryQuery } from "@/domain/examinations/history-query";
import type { OfflineOperation, OfflineReceipt, SyncResult, ServerConflict } from "@/domain/offline/types";
import { prepareExamination } from "@/domain/examinations/prepare";
import { usesPostgres, pgTransaction, databaseClient, decryptDatabaseValue, encryptDatabaseValue } from "@/server/database/postgres";
import { readPgClinical, writePgClinical, pgGetExamination, pgHistoryRows, pgHistoryPage, pgSearchHistoryPage, pgOfflinePage } from "@/server/database/clinical";
export type { ExaminationHistoryPage, ExaminationHistoryQuery } from "@/domain/examinations/history-query";

interface EncryptedEnvelope {
  version: 1;
  iv: string;
  tag: string;
  ciphertext: string;
}

const dataDirectory = path.join(process.cwd(), ".data");
const storePath = process.env.EXAMINATION_STORE_PATH || path.join(dataDirectory, "examinations.enc");
let mutationQueue: Promise<void> = Promise.resolve();

function encryptionKey(): Buffer {
  const secret = process.env.EXAMINATION_DATA_KEY;
  if (secret && secret.length >= 32) return createHash("sha256").update(secret).digest();
  if (process.env.NODE_ENV !== "production") {
    return createHash("sha256").update("development-examination-key-change-before-deploy-2026").digest();
  }
  throw new Error("EXAMINATION_DATA_KEY must contain at least 32 characters");
}

type Revision={examinationId:string;rowVersion:number;savedAt:string;actorId:string;reason:string;record:StoredExamination};
interface ExaminationDatabase { version: 2; records: StoredExamination[]; receipts: OfflineReceipt[]; conflicts?: ServerConflict[]; revisions?: Revision[] }

function encrypt(records: StoredExamination[], receipts: OfflineReceipt[], conflicts: ServerConflict[] = [], revisions:Revision[]=[]): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify({ version: 2, records, receipts, conflicts, revisions }), "utf8"), cipher.final()]);
  const envelope: EncryptedEnvelope = {
    version: 1,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
  return JSON.stringify(envelope);
}

function decrypt(raw: string): ExaminationDatabase {
  const envelope = JSON.parse(raw) as EncryptedEnvelope;
  if (envelope.version !== 1 || !envelope.iv || !envelope.tag || !envelope.ciphertext) {
    throw new Error("Unsupported examination store format");
  }
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(envelope.iv, "base64"));
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
  const parsed: unknown = JSON.parse(plaintext);
  if (Array.isArray(parsed)) return { version: 2, records: parsed as StoredExamination[], receipts: [] };
  const database = parsed as ExaminationDatabase;
  if (database?.version !== 2 || !Array.isArray(database.records) || !Array.isArray(database.receipts)) throw new Error("Invalid examination store payload");
  return database;
}

async function readDatabase(): Promise<ExaminationDatabase> {
  if (usesPostgres()) return readPgClinical();
  try {
    const database = decrypt(await readFile(/* turbopackIgnore: true */ storePath, "utf8"));
    database.records = database.records.map((record) => ({
      ...record,
      updatedAt: record.updatedAt ?? record.createdAt,
      updatedBy: record.updatedBy ?? record.createdBy,
      rowVersion: record.rowVersion ?? 1,
      deletedAt: record.deletedAt ?? null,
      deletedBy: record.deletedBy ?? null,
      catalogVersion: record.catalogVersion ?? "legacy-flat-2026.09.30",
      physicianComment: record.physicianComment ?? null,
      reactionDate: record.reactionDate ?? null,
      reactionTime: record.reactionTime ?? null,
    }));
    return database;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { version: 2, records: [], receipts: [] };
    throw error;
  }
}

async function readAll(): Promise<StoredExamination[]> { return (await readDatabase()).records; }

async function writeAll(records: StoredExamination[], receipts?: OfflineReceipt[], conflicts?: ServerConflict[]): Promise<void> {
  if (usesPostgres()) return writePgClinical(records, receipts ?? (await readDatabase()).receipts, conflicts ?? (await readDatabase()).conflicts ?? []);
  await mkdir(path.dirname(storePath), { recursive: true });
  const temporaryPath = `${storePath}.${process.pid}.${Date.now()}.tmp`;
  const previous = await readDatabase();
  const revisions=previous.revisions??[];
  for(const record of [...previous.records,...records])if(!revisions.some(r=>r.examinationId===record.id&&r.rowVersion===record.rowVersion))revisions.push({examinationId:record.id,rowVersion:record.rowVersion,savedAt:record.updatedAt,actorId:record.updatedBy,reason:previous.records.some(r=>r.id===record.id&&r.rowVersion===record.rowVersion)?"baseline":"examination.updated",record:structuredClone(record)});
  await writeFile(temporaryPath, encrypt(records, receipts ?? previous.receipts, conflicts ?? previous.conflicts ?? [],revisions), { encoding: "utf8", mode: 0o600 });
  await rename(temporaryPath, storePath);
}

function canAccess(record: StoredExamination, user: SessionUser): boolean {
  if (user.role !== "clinician") return false;
  return Boolean(user.organizationId && record.organizationId === user.organizationId);
}

function clinicalMutation<T>(organizationId: string, examinationId: string, task: () => Promise<T>, operationId?: string): Promise<T> {
  if (usesPostgres()) return pgTransaction({ kind: "clinical", organizationId, examinationId, operationId }, task);
  const operation = mutationQueue.then(task);
  mutationQueue = operation.then(() => undefined, () => undefined);
  return operation;
}

export function createExamination(record: StoredExamination): Promise<void> {
  const operation = clinicalMutation(record.organizationId, record.id, async () => {
    const records = await readAll();
    if (records.some((item) => item.id === record.id)) throw new Error("Duplicate examination id");
    records.push(record);
    await writeAll(records);
  });
  mutationQueue = operation.catch(() => undefined);
  return operation;
}

export async function listExaminations(user: SessionUser): Promise<ExaminationSummary[]> {
  if (user.role !== "clinician" || !user.organizationId) return [];
  const records = (usesPostgres() ? await pgHistoryRows(user.organizationId, {}) : await readAll()).filter((record) => !record.deletedAt && canAccess(record, user));
  return records
    .sort((left, right) => right.examinedAt.localeCompare(left.examinedAt))
    .map((record) => ({
      id: record.id,
      patientName: record.patient.fullName,
      examinedAt: record.examinedAt,
      probableAllergen: record.probableAllergen,
      severityGrade: record.severity.grade,
      diagnosis: record.conclusion.text,
      anaphylaxisConfirmed: record.conclusion.anyConfirmed,
    }));
}

export async function searchExaminations(user: SessionUser, query: ExaminationHistoryQuery): Promise<ExaminationHistoryPage> {
  if (usesPostgres() && user.role === "clinician" && user.organizationId) {
    const { records, ...page } = await (query.search?.trim()?pgSearchHistoryPage(user.organizationId,query):pgHistoryPage(user.organizationId,query));
    return { ...page, items: records.map(record => ({ id: record.id, patientName: record.patient.fullName, examinedAt: record.examinedAt, probableAllergen: record.probableAllergen, severityGrade: record.severity.grade, diagnosis: record.conclusion.text, anaphylaxisConfirmed: record.conclusion.anyConfirmed })) };
  }
  const accessible = (user.role !== "clinician" || !user.organizationId ? [] : usesPostgres() ? await pgHistoryRows(user.organizationId, query) : await readAll()).filter((record) => !record.deletedAt && canAccess(record, user));
  return paginateExaminations(accessible.map((record) => ({
      id: record.id,
      patientName: record.patient.fullName,
      examinedAt: record.examinedAt,
      probableAllergen: record.probableAllergen,
      severityGrade: record.severity.grade,
      diagnosis: record.conclusion.text,
      anaphylaxisConfirmed: record.conclusion.anyConfirmed,
    })), query);
}

export async function getExamination(id: string, user: SessionUser): Promise<StoredExamination | null> {
  if (usesPostgres()) return user.role === "clinician" && user.organizationId ? pgGetExamination(id, user.organizationId) : null;
  const record = (await readAll()).find((item) => item.id === id);
  return record && !record.deletedAt && canAccess(record, user) ? record : null;
}
export async function examinationRevisions(id:string,user:SessionUser,page=1) {
  if(!await getExamination(id,user))return {items:[],total:0,page:1,totalPages:1};
  const size=20;
  if(usesPostgres()) {
    const total=Number((await databaseClient().query("SELECT count(*) AS n FROM anafix.examination_revision WHERE examination_id=$1 AND organization_id=$2",[id,user.organizationId])).rows[0].n);
    const totalPages=Math.max(1,Math.ceil(total/size));page=Math.min(totalPages,Math.max(1,Number.isSafeInteger(page)?page:1));
    const rows=await databaseClient().query("SELECT row_version,saved_at,actor_id,reason FROM anafix.examination_revision WHERE examination_id=$1 AND organization_id=$2 ORDER BY row_version DESC LIMIT $3 OFFSET $4",[id,user.organizationId,size,(page-1)*size]);
    return {items:rows.rows.map(r=>({rowVersion:r.row_version,savedAt:new Date(r.saved_at).toISOString(),actorId:r.actor_id,reason:r.reason})),total,page,totalPages};
  }
  const db=await readDatabase();const items=(db.revisions??[]).filter(r=>r.examinationId===id&&r.record.organizationId===user.organizationId).sort((a,b)=>b.rowVersion-a.rowVersion);
  const totalPages=Math.max(1,Math.ceil(items.length/size));page=Math.min(totalPages,Math.max(1,Number.isSafeInteger(page)?page:1));
  return {items:items.slice((page-1)*size,page*size).map(({rowVersion,savedAt,actorId,reason})=>({rowVersion,savedAt,actorId,reason})),total:items.length,page,totalPages};
}
export async function getExaminationRevision(id:string,version:number,user:SessionUser):Promise<StoredExamination|null> {
  if(!await getExamination(id,user)||!Number.isSafeInteger(version)||version<1)return null;
  if(usesPostgres()) {
    const row=(await databaseClient().query("SELECT payload FROM anafix.examination_revision WHERE examination_id=$1 AND organization_id=$2 AND row_version=$3",[id,user.organizationId,version])).rows[0];
    return row?decryptDatabaseValue<StoredExamination>(row.payload,"clinical"):null;
  }
  return (await readDatabase()).revisions?.find(r=>r.examinationId===id&&r.rowVersion===version&&r.record.organizationId===user.organizationId)?.record??null;
}
export function setExaminationTest(id:string,expectedVersion:number,user:SessionUser,isTest:boolean):Promise<void> {
  return clinicalMutation(user.organizationId??"",id,async()=>{
    const records=await readAll(),record=records.find(r=>r.id===id);
    if(!record||record.deletedAt||!canAccess(record,user))throw new Error("EXAMINATION_NOT_FOUND");
    if(record.rowVersion!==expectedVersion)throw new Error("EXAMINATION_CONFLICT");
    record.isTest=isTest;record.rowVersion++;record.updatedBy=user.id;record.updatedAt=new Date().toISOString();
    await writeAll(records);
  });
}
/** Platform-only caller, no clinical payload is returned to the administrator. */
export function clearTestExaminations(organizationId:string,actorId:string):Promise<number> {
  return clinicalMutation(organizationId,`test-cleanup:${organizationId}`,async()=>{
    const records:StoredExamination[]=usesPostgres()?(await databaseClient().query("SELECT payload FROM anafix.examination WHERE organization_id=$1 AND is_test AND deleted_at IS NULL FOR UPDATE",[organizationId])).rows.map(r=>decryptDatabaseValue<StoredExamination>(r.payload,"clinical")):await readAll();
    let count=0;const now=new Date().toISOString();
    for(const record of records)if(record.organizationId===organizationId&&record.isTest===true&&!record.deletedAt){
      record.deletedAt=now;record.deletedBy=actorId;record.updatedAt=now;record.updatedBy=actorId;record.rowVersion++;count++;
      if(usesPostgres()){
        await databaseClient().query("UPDATE anafix.examination SET row_version=$3,deleted_at=$4,payload=$5 WHERE id=$1 AND organization_id=$2 AND is_test",[record.id,organizationId,record.rowVersion,now,encryptDatabaseValue(record,"clinical")]);
        await databaseClient().query("DELETE FROM anafix.search_token WHERE scope='clinical' AND organization_id=$1 AND resource_id=$2",[organizationId,record.id]);
      }
    }
    if(!usesPostgres())await writeAll(records);
    return count;
  });
}

export function updateExamination(
  id: string,
  expectedVersion: number,
  user: SessionUser,
  replacement: StoredExamination,
): Promise<StoredExamination> {
  const operation = clinicalMutation(user.organizationId ?? "", id, async () => {
    const records = await readAll();
    const index = records.findIndex((item) => item.id === id);
    const current = records[index];
    if (!current || current.deletedAt || !canAccess(current, user)) throw new Error("EXAMINATION_NOT_FOUND");
    if (current.rowVersion !== expectedVersion) throw new Error("EXAMINATION_CONFLICT");
    records[index] = replacement;
    await writeAll(records);
    return replacement;
  });
  mutationQueue = operation.then(() => undefined, () => undefined);
  return operation;
}

export function softDeleteExamination(id: string, user: SessionUser): Promise<void> {
  const operation = clinicalMutation(user.organizationId ?? "", id, async () => {
    const records = await readAll();
    const record = records.find((item) => item.id === id);
    if (!record || record.deletedAt || !canAccess(record, user)) throw new Error("EXAMINATION_NOT_FOUND");
    const now = new Date().toISOString();
    record.deletedAt = now;
    record.deletedBy = user.id;
    record.updatedAt = now;
    record.updatedBy = user.id;
    record.rowVersion += 1;
    await writeAll(records);
  });
  mutationQueue = operation.catch(() => undefined);
  return operation;
}

/** A comment-only mutation must not recalculate or replace clinical data. */
export function updatePhysicianComment(id: string, expectedVersion: number, user: SessionUser, physicianComment: string | null): Promise<StoredExamination> {
  const operation = clinicalMutation(user.organizationId ?? "", id, async () => {
    const records = await readAll();
    const index = records.findIndex((item) => item.id === id);
    const current = records[index];
    if (!current || current.deletedAt || !canAccess(current, user)) throw new Error("EXAMINATION_NOT_FOUND");
    if (current.rowVersion !== expectedVersion) throw new Error("EXAMINATION_CONFLICT");
    const updated: StoredExamination = { ...current, physicianComment, rowVersion: current.rowVersion + 1, updatedAt: new Date().toISOString(), updatedBy: user.id };
    records[index] = updated;
    await writeAll(records);
    return updated;
  });
  mutationQueue = operation.then(() => undefined, () => undefined);
  return operation;
}

export async function offlineHistoryPage(user: SessionUser, after: string): Promise<{ records: StoredExamination[]; next: string | null }> {
  if (usesPostgres()) return user.role === "clinician" && user.organizationId ? pgOfflinePage(user.organizationId, after) : { records: [], next: null };
  const accessible = (await readAll()).filter((r) => canAccess(r, user) && r.id > after).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const records = accessible.slice(0, 100);
  return { records, next: accessible.length > 100 ? records.at(-1)!.id : null };
}

/** Receipt and mutation commit together; retries cannot duplicate an examination. */
export function synchronizeExamination(user: SessionUser, command: OfflineOperation, fingerprint: string): Promise<SyncResult> {
  const operation = clinicalMutation(user.organizationId ?? "", command.examinationId, async (): Promise<SyncResult> => {
    if (!user.organizationId || user.role !== "clinician") throw new Error("EXAMINATION_NOT_FOUND");
    const database = await readDatabase();
    const receipt = database.receipts.find((r) => r.operationId === command.operationId);
    const current = database.records.find((r) => r.id === command.examinationId);
    const archived = database.conflicts?.find(row => row.operationId === command.operationId);
    if (archived) {
      if (archived.actorId !== user.id || archived.organizationId !== user.organizationId || archived.fingerprint !== fingerprint) throw new Error("OPERATION_REUSED");
      return { status: "conflict", record: archived.server, conflictId: archived.id };
    }
    if (receipt) {
      if (receipt.actorId !== user.id || receipt.organizationId !== user.organizationId || receipt.fingerprint !== fingerprint) throw new Error("OPERATION_REUSED");
      if (!current || !canAccess(current, user)) throw new Error("EXAMINATION_NOT_FOUND");
      return { status: "applied", record: current, duplicate: true };
    }
    if (current && !canAccess(current, user)) throw new Error("EXAMINATION_NOT_FOUND");
    if (command.kind !== "create" && !current) throw new Error("EXAMINATION_NOT_FOUND");
    if (current && (command.kind === "create" || current.deletedAt || current.rowVersion !== command.expectedVersion)) {
      const now = new Date().toISOString();
      let proposed = { ...current, rowVersion: command.expectedVersion, updatedAt: now, updatedBy: user.id };
      if (command.kind === "delete") proposed = { ...proposed, deletedAt: now, deletedBy: user.id };
      else { const { fullName, ...clinical } = prepareExamination(command.input); proposed = { ...proposed, ...clinical, patient: { ...current.patient, fullName } }; }
      const conflict: ServerConflict = { id: randomUUID(), operationId: command.operationId, fingerprint, actorId: user.id, organizationId: user.organizationId, examinationId: current.id, createdAt: now, local: proposed, server: structuredClone(current) };
      database.conflicts ??= []; database.conflicts.push(conflict);
      await writeAll(database.records, database.receipts, database.conflicts);
      return { status: "conflict", record: current, conflictId: conflict.id };
    }
    if (!user.organizationId || user.role !== "clinician") throw new Error("EXAMINATION_NOT_FOUND");
    const now = new Date().toISOString();
    let record: StoredExamination;
    if (command.kind === "delete") {
      record = { ...current!, deletedAt: now, deletedBy: user.id, updatedAt: now, updatedBy: user.id, rowVersion: current!.rowVersion + 1 };
    } else {
      const prepared = prepareExamination(command.input);
      const { fullName, ...clinical } = prepared;
      record = { ...(current ?? { id: command.examinationId, organizationId: user.organizationId, patient: { id: randomUUID(), fullName }, examinedAt: command.examinedAt, createdAt: now, createdBy: user.id, deletedAt: null, deletedBy: null }), ...clinical, patient: { id: current?.patient.id ?? randomUUID(), fullName }, updatedAt: now, updatedBy: user.id, rowVersion: (current?.rowVersion ?? 0) + 1 };
    }
    if (current) database.records[database.records.indexOf(current)] = record;
    else database.records.push(record);
    database.receipts.push({ operationId: command.operationId, actorId: user.id, organizationId: user.organizationId, fingerprint, examinationId: record.id, appliedVersion: record.rowVersion });
    await writeAll(database.records, database.receipts);
    return { status: "applied", record, duplicate: false };
  }, command.operationId);
  if (!usesPostgres()) mutationQueue = operation.then(() => undefined, () => undefined);
  return operation;
}

export async function listServerConflicts(user: SessionUser): Promise<ServerConflict[]> {
  if (user.role !== "clinician" || !user.organizationId) return [];
  if (usesPostgres()) return (await databaseClient().query("SELECT payload FROM anafix.offline_conflict WHERE organization_id=$1 AND actor_id=$2 ORDER BY created_at DESC LIMIT 100", [user.organizationId,user.id])).rows.map(row => decryptDatabaseValue<ServerConflict>(row.payload,"clinical"));
  return ((await readDatabase()).conflicts ?? []).filter(row => row.organizationId === user.organizationId && row.actorId === user.id).sort((a,b) => b.createdAt.localeCompare(a.createdAt)).slice(0,100);
}
export async function reportConflictDecision(user: SessionUser, conflictId: string, decision: "local" | "server"): Promise<void> {
  if (user.role !== "clinician" || !user.organizationId) throw new Error("EXAMINATION_NOT_FOUND");
  const conflict = usesPostgres() ? (await databaseClient().query("SELECT payload FROM anafix.offline_conflict WHERE id=$1 AND organization_id=$2 AND actor_id=$3", [conflictId,user.organizationId,user.id])).rows.map(row => decryptDatabaseValue<ServerConflict>(row.payload,"clinical"))[0] : (await readDatabase()).conflicts?.find(row => row.id === conflictId && row.organizationId === user.organizationId && row.actorId === user.id);
  if (!conflict) throw new Error("EXAMINATION_NOT_FOUND");
  await clinicalMutation(user.organizationId!, conflict.examinationId, async () => {
    const database = await readDatabase();
    const row = database.conflicts?.find(item => item.id === conflictId && item.actorId === user.id && item.organizationId === user.organizationId);
    if (!row) throw new Error("EXAMINATION_NOT_FOUND");
    if (row.decision && row.decision !== decision) throw new Error("OPERATION_REUSED");
    row.decision = decision; row.decidedAt ??= new Date().toISOString();
    await writeAll(database.records, database.receipts, database.conflicts);
  });
}
