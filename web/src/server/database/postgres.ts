import pg, { type PoolClient } from "pg";
import { AsyncLocalStorage } from "node:async_hooks";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

type Context = { client: PoolClient; kind: "identity" | "clinical"; organizationId?: string; examinationId?: string; operationId?: string; baseline: Map<string, string> };
const context = new AsyncLocalStorage<Context>();
let pool: pg.Pool | undefined;
let actorResolver: (() => Promise<string | null>) | undefined;
export function registerAuditActorResolver(resolver: () => Promise<string | null>): void { actorResolver = resolver; }
export function usesPostgres(): boolean {
  const backend = process.env.STORAGE_BACKEND || (process.env.DATABASE_URL ? "postgres" : "files");
  if (!["postgres", "files"].includes(backend)) throw new Error("INVALID_STORAGE_BACKEND");
  return backend === "postgres";
}
export function getPool(): pg.Pool {
  if (pool) return pool;
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL_REQUIRED");
  const url = new URL(process.env.DATABASE_URL);
  if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error("INVALID_DATABASE_URL");
  // Do not allow URL options to silently replace verified TLS settings.
  for (const key of url.searchParams.keys()) if (key.toLowerCase().startsWith("ssl")) throw new Error("USE_DATABASE_SSL_SETTINGS");
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  const mode = process.env.DATABASE_SSL_MODE || (local ? "disable" : "require");
  if (!["require", "disable"].includes(mode) || (mode === "disable" && !local)) throw new Error("VERIFIED_DATABASE_TLS_REQUIRED");
  pool = new pg.Pool({ connectionString: url.toString(), ssl: mode === "require" ? { rejectUnauthorized: true, ...(process.env.DATABASE_CA_CERT ? { ca: process.env.DATABASE_CA_CERT } : {}) } : false, max: 10, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000, statement_timeout: 15000 });
  pool.on("error", () => console.error("PostgreSQL connection error"));
  return pool;
}
export async function closePool(): Promise<void> { if (pool) { await pool.end(); pool = undefined; } }
function key(kind: "identity" | "clinical"): Buffer {
  const value = process.env[kind === "identity" ? "IDENTITY_DATA_KEY" : "EXAMINATION_DATA_KEY"];
  if (!value || value.length < 32) throw new Error("DATABASE_ENCRYPTION_KEY_REQUIRED");
  return createHash("sha256").update(value).digest();
}
function keyId(value:Buffer):string{return createHash("sha256").update(value).digest("hex").slice(0,24);}
function previousKeys(kind:"identity"|"clinical"):Buffer[]{
  const raw=process.env[kind==="identity"?"IDENTITY_DATA_PREVIOUS_KEYS":"EXAMINATION_DATA_PREVIOUS_KEYS"];
  if(!raw)return [];
  const values:unknown=JSON.parse(raw);
  if(!Array.isArray(values)||values.length>8||values.some(v=>typeof v!=="string"||v.length<32))throw new Error("INVALID_DATABASE_KEYRING");
  return values.map(value=>createHash("sha256").update(value).digest());
}
export function encryptDatabaseValue(value: unknown, kind: "identity" | "clinical"): string {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key(kind), iv);
  cipher.setAAD(Buffer.from(`anafix-envelope-v2:${kind}:${keyId(key(kind))}`));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return JSON.stringify({ version: 2, keyId:keyId(key(kind)), iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), ciphertext: ciphertext.toString("base64") });
}
export function decryptDatabaseValue<T>(raw: string, kind: "identity" | "clinical"): T {
  const envelope = JSON.parse(raw);
  if (![1,2].includes(envelope.version)) throw new Error("INVALID_DATABASE_ENVELOPE");
  const keys=[key(kind),...previousKeys(kind)];
  for(const candidate of keys){
    if(envelope.version===2&&envelope.keyId!==keyId(candidate))continue;
    try{const decipher=createDecipheriv("aes-256-gcm",candidate,Buffer.from(envelope.iv,"base64"));if(envelope.version===2)decipher.setAAD(Buffer.from(`anafix-envelope-v2:${kind}:${envelope.keyId}`));decipher.setAuthTag(Buffer.from(envelope.tag,"base64"));return JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext,"base64")),decipher.final()]).toString("utf8"));}catch{/* Try retained keys only for authenticated legacy envelopes. */}
  }
  throw new Error("DATABASE_DECRYPTION_FAILED");
}
export async function pgTransaction<T>(options: Omit<Context, "client" | "baseline">, task: () => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const actor = await actorResolver?.().catch(() => null);
    await client.query("SELECT set_config('anafix.actor_id',$1,true)", [actor || "system"]);
    // All identity invariants (login uniqueness, license limits, revocation) share this lock.
    // Clinical writes lock only one examination; different examinations can commit concurrently.
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [options.kind === "identity" ? "anafix:identity" : `anafix:examination:${options.examinationId}`]);
    if (options.operationId) await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`anafix:operation:${options.operationId}`]);
    const result = await context.run({ ...options, client, baseline: new Map() }, task);
    await client.query("COMMIT"); return result;
  } catch (error) { await client.query("ROLLBACK").catch(() => {}); throw error; }
  finally { client.release(); }
}
export function databaseClient(): pg.Pool | PoolClient { return context.getStore()?.client ?? getPool(); }
export function transactionContext(): Context { const value = context.getStore(); if (!value) throw new Error("DATABASE_TRANSACTION_REQUIRED"); return value; }
export function remember(key: string, value: unknown): void { context.getStore()?.baseline.set(key, JSON.stringify(value)); }
export function changed(key: string, value: unknown): boolean { return transactionContext().baseline.get(key) !== JSON.stringify(value); }
