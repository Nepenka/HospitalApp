import {pgTransaction,databaseClient,decryptDatabaseValue} from "./postgres.ts";
import {writeIdentityProjection} from "./identity.ts";
import {updateSearchIndex} from "./search-index.ts";
import type {StoredExamination} from "../../domain/examinations/types.ts";
export async function rebuildIndexes(){
 await pgTransaction({kind:"identity"},async()=>{
  const client=databaseClient();
  await client.query("LOCK TABLE anafix.identity_record,anafix.examination,anafix.search_token IN ACCESS EXCLUSIVE MODE");
  await client.query("UPDATE anafix.index_state SET ready=false WHERE name='search-v1'");
  await client.query("DELETE FROM anafix.search_token");
  const owners:Array<{id:string;organizationId:string;role:string;login:string}>=[];
  await client.query("DECLARE owners_index NO SCROLL CURSOR FOR SELECT payload FROM anafix.identity_record WHERE kind='accounts'");
  while(true){const batch=(await client.query("FETCH 200 FROM owners_index")).rows;if(!batch.length)break;for(const item of batch){const row=decryptDatabaseValue<typeof owners[number]>(item.payload,"identity");if(row.role==="organization_owner")owners.push(row);}}
  await client.query("DECLARE identity_index NO SCROLL CURSOR FOR SELECT kind,payload FROM anafix.identity_record");
  while(true){const batch=(await client.query("FETCH 200 FROM identity_index")).rows;if(!batch.length)break;for(const item of batch)await writeIdentityProjection(item.kind,decryptDatabaseValue(item.payload,"identity"),owners);}
  await client.query("DECLARE clinical_index NO SCROLL CURSOR FOR SELECT payload FROM anafix.examination WHERE deleted_at IS NULL");
  while(true){const batch=(await client.query("FETCH 200 FROM clinical_index")).rows;if(!batch.length)break;for(const item of batch){const row=decryptDatabaseValue<StoredExamination>(item.payload,"clinical");await updateSearchIndex("clinical",row.organizationId,row.id,`${row.patient.fullName} ${row.probableAllergen??""}`);}}
  await client.query("UPDATE anafix.index_state SET ready=true WHERE name='search-v1'");
 });
}
