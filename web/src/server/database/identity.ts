import { databaseClient, decryptDatabaseValue, encryptDatabaseValue, remember, changed, transactionContext } from "./postgres.ts";
import {updateSearchIndex} from "./search-index.ts";
type IdentityRow = { id: string; organizationId?: string | null; login?: string; name?:string; code?:string; displayName?:string; status?:string; role?:string; createdAt?:string; lastLoginAt?:string|null; archivedAt?:string|null; license?:{startsOn?:string|null;endsOn?:string|null} };
type Database = { version: 1; organizations: IdentityRow[]; accounts: IdentityRow[]; billingEntries: IdentityRow[]; sessions: IdentityRow[]; devices: IdentityRow[] };
const kinds = ["organizations", "accounts", "billingEntries", "sessions", "devices"] as const;
export async function readPgIdentity<T>(): Promise<T> {
  const result = await databaseClient().query("SELECT kind,id,payload FROM anafix.identity_record");
  const database: Database = { version: 1, organizations: [], accounts: [], billingEntries: [], sessions: [], devices: [] };
  for (const row of result.rows) {
    if (!kinds.includes(row.kind)) throw new Error("INVALID_DATABASE_IDENTITY_KIND");
    const value = decryptDatabaseValue<IdentityRow>(row.payload, "identity");
    if (value.id !== row.id) throw new Error("INVALID_DATABASE_IDENTITY");
    database[row.kind as typeof kinds[number]].push(value); remember(`${row.kind}:${row.id}`, value);
  }
  return database as T;
}
export async function writePgIdentity(value: unknown): Promise<void> {
  const database = value as Database, tx = transactionContext();
  if (tx.kind !== "identity") throw new Error("DATABASE_TRANSACTION_REQUIRED");
  for (const kind of kinds) {
    for (const row of database[kind]) if (changed(`${kind}:${row.id}`, row)) {
      await tx.client.query("INSERT INTO anafix.identity_record(kind,id,organization_id,login,payload) VALUES($1,$2,$3,$4,$5) ON CONFLICT(kind,id) DO UPDATE SET organization_id=excluded.organization_id,login=excluded.login,payload=excluded.payload", [kind, row.id, row.organizationId ?? (kind === "organizations" ? row.id : null), kind === "accounts" ? row.login : null, encryptDatabaseValue(row, "identity")]);
      await writeIdentityProjection(kind,row,database.accounts);
    }
    // Only records removed by existing business logic (e.g. session retirement) are deleted.
    await tx.client.query("DELETE FROM anafix.identity_record WHERE kind=$1 AND NOT(id=ANY($2::text[]))", [kind, database[kind].map(row => row.id)]);
  }
  // Owner logins are part of organization search; update only affected organization indexes.
  for(const organization of database.organizations)if(changed(`organizations:${organization.id}`,organization)||database.accounts.some(a=>a.organizationId===organization.id&&changed(`accounts:${a.id}`,a)))await updateSearchIndex("organizations","",organization.id,`${organization.name??""} ${organization.code??""} ${database.accounts.find(a=>a.organizationId===organization.id&&a.role==="organization_owner")?.login??""}`);
}
export async function writeIdentityProjection(kind:string,row:IdentityRow,accounts:IdentityRow[]=[]):Promise<void>{
 await databaseClient().query("UPDATE anafix.identity_record SET status=$3,role=$4,created_at=$5,last_login_at=$6,license_from=$7,license_to=$8,archived_at=$9 WHERE kind=$1 AND id=$2",[kind,row.id,row.status??null,row.role??null,row.createdAt??null,row.lastLoginAt??null,row.license?.startsOn??null,row.license?.endsOn??null,row.archivedAt??null]);
 if(kind==="accounts")await updateSearchIndex("accounts",row.organizationId??"",row.id,`${row.displayName??""} ${row.login??""}`);
 if(kind==="organizations")await updateSearchIndex("organizations","",row.id,`${row.name??""} ${row.code??""} ${accounts.find(a=>a.organizationId===row.id&&a.role==="organization_owner")?.login??""}`);
}
export async function pgIdentityItem<T>(kind:string,id:string):Promise<T|null>{
 const row=(await databaseClient().query("SELECT payload FROM anafix.identity_record WHERE kind=$1 AND id=$2",[kind,id])).rows[0];return row?decryptDatabaseValue<T>(row.payload,"identity"):null;
}
export async function pgIdentityTenantRows<T>(kind:string,organizationId:string):Promise<T[]>{
 return (await databaseClient().query("SELECT payload FROM anafix.identity_record WHERE kind=$1 AND organization_id=$2",[kind,organizationId])).rows.map(r=>decryptDatabaseValue<T>(r.payload,"identity"));
}
