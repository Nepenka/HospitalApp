import type { StoredExamination } from "../../domain/examinations/types.ts";
import type { ExaminationHistoryQuery } from "../../domain/examinations/history-query.ts";
import type { OfflineReceipt, ServerConflict } from "../../domain/offline/types.ts";
import { databaseClient, decryptDatabaseValue, encryptDatabaseValue, transactionContext, remember, changed, getPool } from "./postgres.ts";
import {updateSearchIndex,queryTokens,searchText} from "./search-index.ts";
export async function readPgClinical() {
  const tx = transactionContext();
  if (tx.kind !== "clinical" || !tx.examinationId) throw new Error("DATABASE_TRANSACTION_REQUIRED");
  const rows = await tx.client.query("SELECT payload FROM anafix.examination WHERE id=$1 FOR UPDATE", [tx.examinationId]);
  const records = rows.rows.map(row => decryptDatabaseValue<StoredExamination>(row.payload, "clinical"));
  for (const record of records) remember(`examination:${record.id}`, record);
  const receipts = tx.operationId ? (await tx.client.query("SELECT payload FROM anafix.offline_receipt WHERE operation_id=$1", [tx.operationId])).rows.map(row => row.payload as OfflineReceipt) : [];
  const conflicts = (await tx.client.query("SELECT payload FROM anafix.offline_conflict WHERE (examination_id=$1 AND organization_id=$2) OR operation_id=$3", [tx.examinationId, tx.organizationId, tx.operationId ?? null])).rows.map(row => decryptDatabaseValue<ServerConflict>(row.payload, "clinical"));
  for (const conflict of conflicts) remember(`conflict:${conflict.id}`, conflict);
  return { version: 2 as const, records, receipts, conflicts };
}
export async function writePgClinical(records: StoredExamination[], receipts: OfflineReceipt[], conflicts: ServerConflict[]): Promise<void> {
  const tx = transactionContext();
  for (const record of records) if (changed(`examination:${record.id}`, record)) {
    if (record.id !== tx.examinationId || record.organizationId !== tx.organizationId) throw new Error("EXAMINATION_NOT_FOUND");
    const result = await tx.client.query("INSERT INTO anafix.examination(id,organization_id,examined_at,row_version,deleted_at,confirmed,severity,payload,is_test) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(id) DO UPDATE SET examined_at=excluded.examined_at,row_version=excluded.row_version,deleted_at=excluded.deleted_at,confirmed=excluded.confirmed,severity=excluded.severity,payload=excluded.payload,is_test=excluded.is_test WHERE anafix.examination.organization_id=excluded.organization_id", [record.id, record.organizationId, record.examinedAt, record.rowVersion, record.deletedAt, record.conclusion.anyConfirmed, record.severity.grade, encryptDatabaseValue(record, "clinical"),record.isTest===true]);
    if (result.rowCount !== 1) throw new Error("EXAMINATION_NOT_FOUND");
    await updateSearchIndex("clinical",record.organizationId,record.id,record.deletedAt?"":`${record.patient.fullName} ${record.probableAllergen??""}`);
  }
  for (const receipt of receipts) {
    if (receipt.operationId !== tx.operationId) continue;
    await tx.client.query("INSERT INTO anafix.offline_receipt(operation_id,payload) VALUES($1,$2) ON CONFLICT(operation_id) DO NOTHING", [receipt.operationId, JSON.stringify(receipt)]);
  }
  for (const conflict of conflicts) if (changed(`conflict:${conflict.id}`, conflict)) {
    if (conflict.organizationId !== tx.organizationId || conflict.examinationId !== tx.examinationId) throw new Error("EXAMINATION_NOT_FOUND");
    await tx.client.query("INSERT INTO anafix.offline_conflict(id,operation_id,organization_id,actor_id,examination_id,created_at,payload) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload", [conflict.id, conflict.operationId, conflict.organizationId, conflict.actorId, conflict.examinationId, conflict.createdAt, encryptDatabaseValue(conflict, "clinical")]);
  }
}
export async function pgGetExamination(id: string, organizationId: string): Promise<StoredExamination | null> {
  const result = await databaseClient().query("SELECT payload FROM anafix.examination WHERE id=$1 AND organization_id=$2 AND deleted_at IS NULL", [id, organizationId]);
  return result.rows.length ? decryptDatabaseValue<StoredExamination>(result.rows[0].payload, "clinical") : null;
}
function historyFilter(organizationId: string, query: ExaminationHistoryQuery) {
  const values: unknown[] = [organizationId];
  const where = ["organization_id=$1", "deleted_at IS NULL"];
  if (query.diagnosis === "anaphylaxis") where.push("confirmed=true");
  if (query.diagnosis === "other") where.push("confirmed=false");
  if (query.from) { values.push(query.from); where.push(`examined_at >= ($${values.length}::date::timestamp AT TIME ZONE 'Europe/Minsk')`); }
  if (query.to) { values.push(query.to); where.push(`examined_at < (($${values.length}::date+1)::timestamp AT TIME ZONE 'Europe/Minsk')`); }
  return { values, where: where.join(" AND ") };
}
/** Blind index narrows candidates; decrypted substring verification removes gram-order false positives. */
export async function pgSearchHistoryPage(organizationId:string,query:ExaminationHistoryQuery){
 const {values,where}=historyFilter(organizationId,query),text=searchText(query.search?.trim()??"");
 const client=await getPool().connect();
 const pageSize=Math.min(100,Math.max(1,Number.isFinite(query.pageSize)?Math.trunc(query.pageSize!):20)),requested=Math.max(1,Number.isSafeInteger(query.page)?query.page!:1);
 try{
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  let condition=where;
  if(text&&(await client.query("SELECT ready FROM anafix.index_state WHERE name='search-v1'")).rows[0]?.ready){
   const tokens=queryTokens("clinical",organizationId,text);values.push(tokens,tokens.length);
   condition+=` AND id IN (SELECT resource_id FROM anafix.search_token WHERE scope='clinical' AND organization_id=$1 AND token=ANY($${values.length-1}::text[]) GROUP BY resource_id HAVING count(*)=$${values.length})`;
  }
  await client.query(`DECLARE history_candidates NO SCROLL CURSOR FOR SELECT payload FROM anafix.examination WHERE ${condition} ORDER BY examined_at DESC,id DESC`,values);
  let total=0,records:StoredExamination[]=[],lastPage:StoredExamination[]=[];
  while(true){
   const batch=(await client.query("FETCH 200 FROM history_candidates")).rows;if(!batch.length)break;
   for(const row of batch){const record=decryptDatabaseValue<StoredExamination>(row.payload,"clinical");if(!searchText(`${record.patient.fullName} ${record.probableAllergen??""}`).includes(text))continue;
    const index=total++;if(index%pageSize===0)lastPage=[];lastPage.push(record);if(index>=(requested-1)*pageSize&&index<requested*pageSize)records.push(record);
   }
  }
  const totalPages=Math.max(1,Math.ceil(total/pageSize)),page=Math.min(requested,totalPages);
  if(page<requested)records=lastPage;
  await client.query("COMMIT");return {records,total,pageSize,totalPages,page};
 }catch(error){await client.query("ROLLBACK").catch(()=>{});throw error;}finally{client.release();}
}
export async function pgHistoryRows(organizationId: string, query: ExaminationHistoryQuery, limit?: number, offset = 0): Promise<StoredExamination[]> {
  const { values, where } = historyFilter(organizationId, query);
  let sql = `SELECT payload FROM anafix.examination WHERE ${where} ORDER BY examined_at DESC,id DESC`;
  if (limit !== undefined) { values.push(limit, offset); sql += ` LIMIT $${values.length - 1} OFFSET $${values.length}`; }
  return (await databaseClient().query(sql, values)).rows.map(row => decryptDatabaseValue<StoredExamination>(row.payload, "clinical"));
}
export async function pgHistoryPage(organizationId: string, query: ExaminationHistoryQuery) {
  const { values, where } = historyFilter(organizationId, query);
  const client = await getPool().connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const total = Number((await client.query(`SELECT count(*) AS total FROM anafix.examination WHERE ${where}`, values)).rows[0].total);
    const pageSize = typeof query.pageSize === "number" && Number.isFinite(query.pageSize) ? Math.min(100, Math.max(1, Math.trunc(query.pageSize))) : 20;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(totalPages, Math.max(1, Number.isSafeInteger(query.page) ? query.page! : 1));
    const rows = await client.query(`SELECT payload FROM anafix.examination WHERE ${where} ORDER BY examined_at DESC,id DESC LIMIT $${values.length+1} OFFSET $${values.length+2}`, [...values,pageSize,(page-1)*pageSize]);
    const records = rows.rows.map(row => decryptDatabaseValue<StoredExamination>(row.payload,"clinical"));
    await client.query("COMMIT"); return { records, total, pageSize, totalPages, page };
  } catch(error) { await client.query("ROLLBACK").catch(() => {}); throw error; }
  finally { client.release(); }
}
export async function pgOfflinePage(organizationId: string, after: string) {
  const result = await databaseClient().query("SELECT payload FROM anafix.examination WHERE organization_id=$1 AND id>$2 ORDER BY id LIMIT 101", [organizationId, after]);
  const rows = result.rows.map(row => decryptDatabaseValue<StoredExamination>(row.payload, "clinical"));
  const records = rows.slice(0, 100);
  return { records, next: rows.length > 100 ? records.at(-1)!.id : null };
}
