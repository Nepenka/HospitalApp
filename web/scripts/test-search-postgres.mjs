// Disposable synthetic database: never benchmark against real medical records.
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {performance} from "node:perf_hooks";
import {credentials,clientFor,urlFor,run,webRoot} from "./windows-postgres.mjs";
import {getPool,closePool,pgTransaction,transactionContext,encryptDatabaseValue} from "../src/server/database/postgres.ts";
import {updateSearchIndex} from "../src/server/database/search-index.ts";
import {pgSearchHistoryPage,pgHistoryPage} from "../src/server/database/clinical.ts";
const c=await credentials(),database=`anafix_search_${randomUUID().replaceAll("-","")}_test`,admin=clientFor(c,"admin","postgres");
await admin.connect();let created=false;
try{
 await admin.query(`CREATE DATABASE ${database} TEMPLATE template0`);created=true;
 await run(process.execPath,["--experimental-strip-types","scripts/database.mjs","migrate"],{cwd:webRoot,env:{...process.env,DATABASE_URL:urlFor(c,"admin",database),DATABASE_SSL_MODE:"disable"}});
 process.env.DATABASE_URL=urlFor(c,"admin",database);process.env.DATABASE_SSL_MODE="disable";
 process.env.IDENTITY_DATA_KEY="synthetic identity search benchmark key only";process.env.EXAMINATION_DATA_KEY="synthetic clinical search benchmark key only";
 const started=performance.now(),count=3000;
 await pgTransaction({kind:"clinical",organizationId:"synthetic",examinationId:"fixture"},async()=>{
  const db=transactionContext().client;
  for(let i=0;i<count+2;i++){
   const id=`synthetic-${String(i).padStart(6,"0")}`,org=i===count+1?"foreign":"synthetic";
   const fullName=i===count?"nee eed edl dle":`Синтетический ${i} ${i%100===0||org==="foreign"?"Юяneedle":""}`;
   const record={id,organizationId:org,patient:{fullName},probableAllergen:"Синтетический аллерген",rowVersion:1,examinedAt:new Date(Date.UTC(2026,8,1,0,i)).toISOString()};
   await db.query("INSERT INTO anafix.examination(id,organization_id,examined_at,row_version,confirmed,severity,payload) VALUES($1,$2,$3,1,false,0,$4)",[id,org,record.examinedAt,encryptDatabaseValue(record,"clinical")]);
   await updateSearchIndex("clinical",org,id,`${fullName} ${record.probableAllergen}`);
  }
  await db.query("UPDATE anafix.index_state SET ready=true WHERE name='search-v1'");
 });
 await getPool().query("ANALYZE anafix.examination");await getPool().query("ANALYZE anafix.search_token");
 const timings=[];
 for(const search of ["Ю","юя","needle"]){
  const start=performance.now(),page=await pgSearchHistoryPage("synthetic",{search,page:2,pageSize:20});
  assert.equal(page.total,30);assert.equal(page.page,2);assert.equal(page.records.length,10);
  assert.ok(page.records.every(r=>r.organizationId==="synthetic"&&`${r.patient.fullName} ${r.probableAllergen}`.toLowerCase().includes(search.toLowerCase())));
  timings.push({queryLength:search.length,milliseconds:Math.round(performance.now()-start),matches:page.total});
 }
 const clamped=await pgSearchHistoryPage("synthetic",{search:"needle",page:999,pageSize:20});assert.equal(clamped.page,2);assert.equal(clamped.records.length,10);
 const empty=await pgSearchHistoryPage("synthetic",{search:"нет-совпадения",page:9});assert.equal(empty.total,0);assert.equal(empty.page,1);
 const regular=await pgHistoryPage("synthetic",{page:2,pageSize:20});assert.equal(regular.total,3001);assert.equal(regular.records.length,20);
 const raw=await getPool().query("SELECT count(*) AS n FROM anafix.search_token WHERE token ILIKE '%needle%'");assert.equal(Number(raw.rows[0].n),0);
 console.log(JSON.stringify({syntheticRecords:count+2,setupMilliseconds:Math.round(performance.now()-started),search:timings,tenantIsolation:true,gramFalsePositivesRemoved:true,pagination:true}));
}finally{
 await closePool();if(created)await admin.query(`DROP DATABASE ${database}`);await admin.end();
}
