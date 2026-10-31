import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { getPool, closePool, pgTransaction, transactionContext } from "../src/server/database/postgres.ts";

// Explicit dedicated test DB only. Never borrow DATABASE_URL or create/install a server.
if (!process.env.DATABASE_TEST_URL) { console.error("DATABASE_TEST_URL is required; PostgreSQL integration tests have NOT run."); process.exit(1); }
const url=new URL(process.env.DATABASE_TEST_URL);
if (!decodeURIComponent(url.pathname).endsWith("_test")) { console.error("Use a dedicated database whose name ends with _test.");process.exit(1); }
process.env.DATABASE_URL=process.env.DATABASE_TEST_URL;
const id=process.argv[2], mode=process.argv[3];
if(id && mode === "worker") {
  try {
    const result=await pgTransaction({kind:"clinical",organizationId:"integration-test",examinationId:id},async()=>{
      const client=transactionContext().client;
      const row=(await client.query("SELECT row_version FROM anafix.examination WHERE id=$1 FOR UPDATE",[id])).rows[0];
      if(row.row_version !== 1) return "conflict";
      await client.query("SELECT pg_sleep(0.1)");
      await client.query("UPDATE anafix.examination SET row_version=row_version+1 WHERE id=$1",[id]); return "applied";
    }); console.log(result);
  } finally {await closePool();}
} else {
  const pool=getPool(), recordId=randomUUID();
  const run=()=>new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,["--experimental-strip-types","scripts/test-postgres.mjs",recordId,"worker"],{cwd:process.cwd(),env:process.env,windowsHide:true});
    let output="";child.stdout.on("data",chunk=>{output+=chunk;});child.on("error",reject);child.on("exit",code=>code===0?resolve(output.trim()):reject(new Error("WORKER_FAILED")));
  });
  try {
    await pool.query(await readFile(new URL("../db/runtime/001_runtime.sql",import.meta.url),"utf8"));
    await pool.query("INSERT INTO anafix.examination(id,organization_id,examined_at,row_version,confirmed,severity,payload) VALUES($1,'integration-test',now(),1,false,0,'synthetic-test-only')",[recordId]);
    assert.deepEqual((await Promise.all([run(),run()])).sort(),["applied","conflict"]);
    assert.equal((await pool.query("SELECT row_version FROM anafix.examination WHERE id=$1",[recordId])).rows[0].row_version,2);
    await assert.rejects(pgTransaction({kind:"clinical",examinationId:recordId},async()=>{await transactionContext().client.query("UPDATE anafix.examination SET row_version=row_version+1 WHERE id=$1",[recordId]);throw new Error("ROLLBACK_TEST");}),/ROLLBACK_TEST/);
    assert.equal((await pool.query("SELECT row_version FROM anafix.examination WHERE id=$1",[recordId])).rows[0].row_version,2);
    console.log("PostgreSQL: two independent processes, version conflict and rollback passed.");
  } catch {console.error("PostgreSQL integration verification failed; check the dedicated test database.");process.exitCode=1;}
  finally {await pool.query("DELETE FROM anafix.examination WHERE id=$1 AND organization_id='integration-test'",[recordId]).catch(()=>{});await closePool();}
}
