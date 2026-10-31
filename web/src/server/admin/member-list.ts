import "server-only";
import {getPool,usesPostgres,decryptDatabaseValue} from "@/server/database/postgres";
import {queryTokens,searchText} from "@/server/database/search-index";
import {listOrganizationMembers,type AccountRecord} from "@/server/identity/store";
type PublicAccount=Omit<AccountRecord,"passwordHash">;
export type MemberListPage={items:PublicAccount[];total:number;page:number;totalPages:number;query:string};
export async function memberSummary(organizationId:string){
 if(!usesPostgres()){const members=await listOrganizationMembers(organizationId);return {total:members.length,active:members.filter(a=>a.status==="active").length,activeClinicians:members.filter(a=>a.role==="clinician"&&a.status==="active").length,suspendedClinicians:members.filter(a=>a.role==="clinician"&&a.status==="suspended").length,owner:members.find(a=>a.role==="organization_owner")??null,lastActivityAt:members.map(a=>a.lastLoginAt).filter((s):s is string=>Boolean(s)).sort().at(-1)??null};}
 const client=await getPool().connect();try{
  const r=(await client.query("SELECT count(*) AS total,count(*) FILTER(WHERE status='active') AS active,count(*) FILTER(WHERE role='clinician' AND status='active') AS clinicians,count(*) FILTER(WHERE role='clinician' AND status='suspended') AS suspended,max(last_login_at) AS last FROM anafix.identity_record WHERE kind='accounts' AND organization_id=$1",[organizationId])).rows[0];
  const ownerRow=(await client.query("SELECT payload FROM anafix.identity_record WHERE kind='accounts' AND organization_id=$1 AND role='organization_owner' ORDER BY id LIMIT 1",[organizationId])).rows[0];
  const owner=ownerRow?decryptDatabaseValue<AccountRecord>(ownerRow.payload,"identity"):null;
  return {total:Number(r.total),active:Number(r.active),activeClinicians:Number(r.clinicians),suspendedClinicians:Number(r.suspended),owner:owner?publicAccount(owner):null,lastActivityAt:r.last?new Date(r.last).toISOString():null};
 }finally{client.release();}
}
function publicAccount({passwordHash,...account}:AccountRecord):PublicAccount{void passwordHash;return account;}
export async function memberList(organizationId:string,query="",requested=1):Promise<MemberListPage>{
 query=query.trim().slice(0,200);requested=Math.max(1,Number.isSafeInteger(requested)?requested:1);const size=20;
 if(!usesPostgres()){const all=(await listOrganizationMembers(organizationId)).filter(a=>searchText(`${a.displayName} ${a.login}`).includes(searchText(query))),totalPages=Math.max(1,Math.ceil(all.length/size)),page=Math.min(requested,totalPages);return {items:all.slice((page-1)*size,page*size),total:all.length,page,totalPages,query};}
 const client=await getPool().connect();let total=0,items:PublicAccount[]=[],page=requested,totalPages=1;
 try{
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  const base="SELECT payload FROM anafix.identity_record WHERE kind='accounts' AND organization_id=$1";
  if(!query){total=Number((await client.query("SELECT count(*) AS n FROM anafix.identity_record WHERE kind='accounts' AND organization_id=$1",[organizationId])).rows[0].n);totalPages=Math.max(1,Math.ceil(total/size));page=Math.min(requested,totalPages);items=(await client.query(`${base} ORDER BY created_at DESC,id DESC LIMIT $2 OFFSET $3`,[organizationId,size,(page-1)*size])).rows.map(r=>publicAccount(decryptDatabaseValue<AccountRecord>(r.payload,"identity")));}
  else{
   const tokens=queryTokens("accounts",organizationId,query),ready=(await client.query("SELECT ready FROM anafix.index_state WHERE name='search-v1'")).rows[0]?.ready;
   const condition=ready?" AND id IN (SELECT resource_id FROM anafix.search_token WHERE scope='accounts' AND organization_id=$1 AND token=ANY($2::text[]) GROUP BY resource_id HAVING count(*)=$3)":"";
   await client.query(`DECLARE member_candidates NO SCROLL CURSOR FOR ${base}${condition} ORDER BY created_at DESC,id DESC`,ready?[organizationId,tokens,tokens.length]:[organizationId]);let last:PublicAccount[]=[];
   while(true){const batch=(await client.query("FETCH 200 FROM member_candidates")).rows;if(!batch.length)break;for(const row of batch){const account=publicAccount(decryptDatabaseValue<AccountRecord>(row.payload,"identity"));if(!searchText(`${account.displayName} ${account.login}`).includes(searchText(query)))continue;const index=total++;if(index%size===0)last=[];last.push(account);if(index>=(requested-1)*size&&index<requested*size)items.push(account);}}
   totalPages=Math.max(1,Math.ceil(total/size));page=Math.min(requested,totalPages);if(page<requested)items=last;
  }
  await client.query("COMMIT");return {items,total,page,totalPages,query};
 }catch(error){await client.query("ROLLBACK").catch(()=>{});throw error;}finally{client.release();}
}
