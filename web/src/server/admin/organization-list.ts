import "server-only";
import {getPool,usesPostgres,decryptDatabaseValue} from "@/server/database/postgres";
import {queryTokens,searchText} from "@/server/database/search-index";
import {listOrganizations,listBillingEntries,type OrganizationRecord} from "@/server/identity/store";
import {memberSummary} from "./member-list";
import {summarizeBilling} from "./billing";
import {licenseAllowsClinicalAccess} from "@/domain/administration/license";
import type {OrganizationAdminRow,AdminDashboardData} from "./organizations";
export type OrganizationListData={organizations:OrganizationAdminRow[];metrics:Pick<AdminDashboardData["metrics"],"organizations"|"users"|"activeUsers"|"newOrganizationsThisMonth">;query:string;page:number;total:number;totalPages:number};
export async function organizationList(query="",requested=1):Promise<OrganizationListData>{
 query=query.trim().slice(0,200);requested=Math.max(1,Number.isSafeInteger(requested)?requested:1);const size=20;
 if(!usesPostgres()){
  const all=await listOrganizations(),matches=all.filter(o=>searchText(`${o.name} ${o.code} ${o.ownerLogin}`).includes(searchText(query))),totalPages=Math.max(1,Math.ceil(matches.length/size)),page=Math.min(totalPages,requested);
  const rows=await Promise.all(matches.slice((page-1)*size,page*size).map(async o=>({...o,finances:summarizeBilling(await listBillingEntries(o.id))})));
  return {organizations:rows,query,page,total:matches.length,totalPages,metrics:{organizations:all.length,users:all.reduce((n,o)=>n+o.users,0),activeUsers:all.reduce((n,o)=>n+o.activeUsers,0),newOrganizationsThisMonth:all.filter(o=>o.createdAt.slice(0,7)===new Date().toISOString().slice(0,7)).length}};
 }
 const client=await getPool().connect();
 let selected:Array<{organization:OrganizationRecord;ownerLogin:string}>=[],total=0,page=requested,totalPages=1,metrics:OrganizationListData["metrics"];
 try{
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  const m=(await client.query("SELECT (SELECT count(*) FROM anafix.identity_record WHERE kind='organizations') AS organizations,(SELECT count(*) FROM anafix.identity_record WHERE kind='accounts') AS users,(SELECT count(*) FROM anafix.identity_record a JOIN anafix.identity_record o ON o.kind='organizations' AND o.id=a.organization_id WHERE a.kind='accounts' AND a.status='active' AND o.status='active' AND (a.role<>'clinician' OR ((o.license_from IS NULL OR o.license_from<=(now() AT TIME ZONE 'Europe/Minsk')::date) AND (o.license_to IS NULL OR o.license_to>=(now() AT TIME ZONE 'Europe/Minsk')::date)))) AS active,(SELECT count(*) FROM anafix.identity_record WHERE kind='organizations' AND created_at>=date_trunc('month',now() AT TIME ZONE 'Europe/Minsk') AT TIME ZONE 'Europe/Minsk') AS new")).rows[0];
  metrics={organizations:Number(m.organizations),users:Number(m.users),activeUsers:Number(m.active),newOrganizationsThisMonth:Number(m.new)};
  const base="SELECT o.payload,coalesce(owner.login,'—') AS owner_login FROM anafix.identity_record o LEFT JOIN LATERAL (SELECT login FROM anafix.identity_record WHERE kind='accounts' AND organization_id=o.id AND role='organization_owner' ORDER BY id LIMIT 1) owner ON true WHERE o.kind='organizations'";
  if(!query){
   total=metrics.organizations;totalPages=Math.max(1,Math.ceil(total/size));page=Math.min(requested,totalPages);
   const rows=(await client.query(`${base} ORDER BY o.created_at DESC,o.id DESC LIMIT $1 OFFSET $2`,[size,(page-1)*size])).rows;
   selected=rows.map(r=>({organization:decryptDatabaseValue<OrganizationRecord>(r.payload,"identity"),ownerLogin:r.owner_login}));
  }else{
   const tokens=queryTokens("organizations","",query),ready=(await client.query("SELECT ready FROM anafix.index_state WHERE name='search-v1'")).rows[0]?.ready;
   const condition=ready?" AND o.id IN (SELECT resource_id FROM anafix.search_token WHERE scope='organizations' AND organization_id='' AND token=ANY($1::text[]) GROUP BY resource_id HAVING count(*)=$2)":"";
   await client.query(`DECLARE organizations_page NO SCROLL CURSOR FOR ${base}${condition} ORDER BY o.created_at DESC,o.id DESC`,ready?[tokens,tokens.length]:[]);
   let last:typeof selected=[];
   while(true){const batch=(await client.query("FETCH 200 FROM organizations_page")).rows;if(!batch.length)break;for(const r of batch){const organization=decryptDatabaseValue<OrganizationRecord>(r.payload,"identity");if(!searchText(`${organization.name} ${organization.code} ${r.owner_login}`).includes(searchText(query)))continue;const index=total++;if(index%size===0)last=[];const value={organization,ownerLogin:r.owner_login};last.push(value);if(index>=(requested-1)*size&&index<requested*size)selected.push(value);}}
   totalPages=Math.max(1,Math.ceil(total/size));page=Math.min(requested,totalPages);if(page<requested)selected=last;
  }
  await client.query("COMMIT");
 }catch(error){await client.query("ROLLBACK").catch(()=>{});throw error;}finally{client.release();}
 const organizations=await Promise.all(selected.map(async({organization,ownerLogin})=>{
  const members=await memberSummary(organization.id);
  return {...organization,ownerLogin,ownerAccountId:members.owner?.id??null,users:members.total,activeUsers:organization.status!=="active"?0:licenseAllowsClinicalAccess(organization.license)?members.active:members.active-members.activeClinicians,lastActivityAt:members.lastActivityAt,finances:summarizeBilling(await listBillingEntries(organization.id))};
 }));
 return {organizations,metrics,query,page,total,totalPages};
}
