import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { createHash, createDecipheriv } from "node:crypto";
import { getPool, closePool, encryptDatabaseValue, decryptDatabaseValue } from "../src/server/database/postgres.ts";
import {rebuildIndexes} from "../src/server/database/rebuild-indexes.ts";

for (const name of [".env.local", ".env"]) { try { process.loadEnvFile(name); } catch (error) { if (error.code !== "ENOENT") throw error; } }
if(process.env.ANAFIX_LOCAL_ENV_PATH && !process.env.DATABASE_URL)process.loadEnvFile(process.env.ANAFIX_LOCAL_ENV_PATH);
const command = process.argv[2];
const confirm = process.argv.includes("--confirm");
async function migrate() {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('anafix:migrations',0))");
    await client.query("CREATE SCHEMA IF NOT EXISTS anafix");
    await client.query("CREATE TABLE IF NOT EXISTS anafix.schema_migration(name text PRIMARY KEY,sha256 text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())");
    const directory = path.join(process.cwd(), "db", "runtime");
    for (const name of (await readdir(directory)).filter(name => /^\d+.*\.sql$/.test(name)).sort()) {
      const sql = await readFile(path.join(directory, name), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const previous = (await client.query("SELECT sha256 FROM anafix.schema_migration WHERE name=$1", [name])).rows[0];
      if (previous) { if (previous.sha256 !== checksum) throw new Error("MIGRATION_CHECKSUM_MISMATCH"); continue; }
      await client.query(sql);
      await client.query("INSERT INTO anafix.schema_migration(name,sha256) VALUES($1,$2)", [name, checksum]);
      console.log(`Applied ${name}`);
    }
    await client.query("COMMIT");
    console.log("Database schema ready. No medical data was created or removed.");
  } catch (error) { await client.query("ROLLBACK").catch(() => {}); throw error; }
  finally { client.release(); }
}
async function encryptedFile(file, kind) {
  try {
    const raw=await readFile(file,"utf8");
    const sourceKey=process.env[kind === "identity" ? "FILE_IDENTITY_DATA_KEY" : "FILE_EXAMINATION_DATA_KEY"];
    if(!sourceKey) return decryptDatabaseValue(raw,kind);
    const envelope=JSON.parse(raw);
    if(envelope.version !== 1) throw new Error("INVALID_SOURCE_ENVELOPE");
    const decipher=createDecipheriv("aes-256-gcm",createHash("sha256").update(sourceKey).digest(),Buffer.from(envelope.iv,"base64"));
    decipher.setAuthTag(Buffer.from(envelope.tag,"base64"));
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext,"base64")),decipher.final()]).toString("utf8"));
  }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}
async function importFiles() {
  const identity = await encryptedFile(process.env.IDENTITY_STORE_PATH || path.join(process.cwd(), ".data", "identities.enc"), "identity");
  const source = await encryptedFile(process.env.EXAMINATION_STORE_PATH || path.join(process.cwd(), ".data", "examinations.enc"), "clinical");
  if (!identity || identity.version !== 1 || !Array.isArray(identity.organizations) || !Array.isArray(identity.accounts)) throw new Error("IDENTITY_SOURCE_REQUIRED");
  if (source && !Array.isArray(source) && (source.version !== 2 || !Array.isArray(source.records) || !Array.isArray(source.receipts))) throw new Error("INVALID_CLINICAL_SOURCE");
  const organizations = new Set(identity.organizations.map(row => row.id));
  const kinds = ["organizations", "accounts", "billingEntries", "sessions", "devices"];
  for (const kind of kinds) {
    if (identity[kind] !== undefined && !Array.isArray(identity[kind])) throw new Error("INVALID_IDENTITY_SOURCE");
    for (const row of identity[kind] ?? []) if (!row.id || (row.organizationId && !organizations.has(row.organizationId))) throw new Error("INVALID_SOURCE_ORGANIZATION");
  }
  const records = (Array.isArray(source) ? source : source?.records ?? []).map(row => ({ ...row, rowVersion: row.rowVersion ?? 1, updatedAt: row.updatedAt ?? row.createdAt, updatedBy: row.updatedBy ?? row.createdBy, deletedAt: row.deletedAt ?? null, deletedBy: row.deletedBy ?? null, catalogVersion: row.catalogVersion ?? "legacy-flat-2026.09.30", physicianComment: row.physicianComment ?? null, reactionDate: row.reactionDate ?? null, reactionTime: row.reactionTime ?? null }));
  for (const row of records) if (!row.id || typeof row.organizationId !== "string" || !row.organizationId || !Number.isFinite(Date.parse(row.examinedAt)) || !Number.isSafeInteger(row.rowVersion) || row.rowVersion < 1 || !row.patient?.fullName || !row.conclusion || !row.severity) throw new Error("INVALID_CLINICAL_SOURCE");
  const orphanedRecords = records.filter(row => !organizations.has(row.organizationId)).length;
  // Historical organizations may have been removed. Preserve their original tenant IDs,
  // never assign medical records to an unrelated hospital or invent new accounts.
  if (orphanedRecords && !process.argv.includes("--preserve-orphans")) throw new Error("ORPHANED_CLINICAL_RECORDS_REQUIRE_PRESERVATION");
  const receipts = Array.isArray(source) ? [] : source?.receipts ?? [];
  const conflicts = Array.isArray(source) ? [] : source?.conflicts ?? [];
  console.log(JSON.stringify({ organizations: identity.organizations.length, accounts: identity.accounts.length, examinations: records.length, orphanedRecords, receipts: receipts.length, conflicts: conflicts.length, mode: confirm ? "import" : "dry-run" }));
  if (!confirm) { console.log("Files validated only. Use --confirm to import into an empty migrated database. Originals are retained."); return; }
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('anafix:migrations',0))");
    // Run only during a maintenance window; this also blocks all concurrent application writes.
    await client.query("LOCK TABLE anafix.identity_record,anafix.examination,anafix.offline_receipt,anafix.offline_conflict,anafix.audit_event IN ACCESS EXCLUSIVE MODE");
    for (const table of ["identity_record", "examination", "offline_receipt", "offline_conflict", "audit_event"]) {
      if ((await client.query(`SELECT 1 FROM anafix.${table} LIMIT 1`)).rowCount) throw new Error("DATABASE_NOT_EMPTY");
    }
    for (const kind of kinds) for (const row of identity[kind] ?? []) await client.query("INSERT INTO anafix.identity_record(kind,id,organization_id,login,payload) VALUES($1,$2,$3,$4,$5)", [kind, row.id, row.organizationId ?? (kind === "organizations" ? row.id : null), kind === "accounts" ? row.login : null, encryptDatabaseValue(row, "identity")]);
    for (const row of records) await client.query("INSERT INTO anafix.examination(id,organization_id,examined_at,row_version,deleted_at,confirmed,severity,payload) VALUES($1,$2,$3,$4,$5,$6,$7,$8)", [row.id,row.organizationId,row.examinedAt,row.rowVersion,row.deletedAt,row.conclusion.anyConfirmed,row.severity.grade,encryptDatabaseValue(row,"clinical")]);
    for (const row of receipts) await client.query("INSERT INTO anafix.offline_receipt(operation_id,payload) VALUES($1,$2)", [row.operationId,JSON.stringify(row)]);
    for (const row of conflicts) await client.query("INSERT INTO anafix.offline_conflict(id,operation_id,organization_id,actor_id,examination_id,created_at,payload) VALUES($1,$2,$3,$4,$5,$6,$7)", [row.id,row.operationId,row.organizationId,row.actorId,row.examinationId,row.createdAt,encryptDatabaseValue(row,"clinical")]);
    // Import existing metadata journals; invalid lines stop the whole transaction.
    for (const [category,file] of [["security",process.env.SECURITY_AUDIT_PATH || path.join(process.cwd(),".data","security-audit.jsonl")],["export",process.env.EXPORT_AUDIT_PATH || path.join(process.cwd(),".data","examination-export-audit.jsonl")]]) {
      let content; try { content = await readFile(file,"utf8"); } catch(error) { if(error.code === "ENOENT") continue; throw error; }
      for (const [index,line] of content.split(/\r?\n/).entries()) if(line.trim()) {
        const row = JSON.parse(line);
        if (!row.timestamp || !Number.isFinite(Date.parse(row.timestamp))) throw new Error("INVALID_AUDIT_SOURCE");
        await client.query("INSERT INTO anafix.audit_event(id,category,occurred_at,organization_id,actor_id,event,metadata) VALUES($1,$2,$3,$4,$5,$6,$7)", [`legacy:${category}:${index}`,category,row.timestamp,row.organizationId ?? null,row.actorId ?? null,row.event ?? `examination.${row.kind ?? "export"}`,JSON.stringify(row)]);
      }
    }
    await client.query("COMMIT");
    console.log("Import committed. Original encrypted files and journals were not modified. Switch STORAGE_BACKEND only after verification.");
  } catch(error) { await client.query("ROLLBACK").catch(() => {}); throw error; }
  finally { client.release(); }
}
try {
  if (command === "migrate") await migrate();
  else if (command === "import-files") {await importFiles();if(confirm)await rebuildIndexes();}
  else if(command==="rebuild-indexes"){await rebuildIndexes();console.log("Search indexes rebuilt. No medical values were printed or changed.");}
  else throw new Error("USE_MIGRATE_OR_IMPORT_FILES");
} catch(error) {
  // Never expose connection strings, SQL payloads or patient data in command output.
  const safe = new Set(["DATABASE_URL_REQUIRED","DATABASE_ENCRYPTION_KEY_REQUIRED","INVALID_DATABASE_URL","VERIFIED_DATABASE_TLS_REQUIRED","USE_DATABASE_SSL_SETTINGS","MIGRATION_CHECKSUM_MISMATCH","DATABASE_NOT_EMPTY","IDENTITY_SOURCE_REQUIRED","INVALID_CLINICAL_SOURCE","ORPHANED_CLINICAL_RECORDS_REQUIRE_PRESERVATION","INVALID_SOURCE_ORGANIZATION","INVALID_IDENTITY_SOURCE","INVALID_AUDIT_SOURCE"]);
  console.error(safe.has(error.message) ? error.message : "Database operation failed. Check connection, keys, migration state and source format without sharing secrets.");
  process.exitCode = 1;
} finally { await closePool(); }
