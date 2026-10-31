import test from "node:test";
import assert from "node:assert/strict";
import { encryptDatabaseValue, decryptDatabaseValue, usesPostgres, getPool, closePool, pgTransaction, transactionContext, remember, changed } from "./postgres.ts";
import type { PoolClient } from "pg";

test("database envelopes authenticate payloads and keep identity and clinical keys separate",()=>{
  process.env.IDENTITY_DATA_KEY="test identity encryption key at least thirty two";
  process.env.EXAMINATION_DATA_KEY="test clinical encryption key at least thirty two";
  const source={comment:"synthetic confidential text",rowVersion:2};
  const encrypted=encryptDatabaseValue(source,"clinical");
  assert.ok(!encrypted.includes(source.comment));assert.deepEqual(decryptDatabaseValue(encrypted,"clinical"),source);
  assert.throws(()=>decryptDatabaseValue(encrypted,"identity"));
  const envelope=JSON.parse(encrypted);envelope.tag=Buffer.alloc(16).toString("base64");
  assert.throws(()=>decryptDatabaseValue(JSON.stringify(envelope),"clinical"));
});
test("backend selection is explicit; remote PostgreSQL cannot disable verified TLS",async()=>{
  process.env.STORAGE_BACKEND="files";process.env.DATABASE_URL="postgres://localhost/test";assert.equal(usesPostgres(),false);
  process.env.STORAGE_BACKEND="postgres";assert.equal(usesPostgres(),true);
  process.env.STORAGE_BACKEND="unknown";assert.throws(()=>usesPostgres(),/INVALID_STORAGE_BACKEND/);
  process.env.DATABASE_URL="postgres://remote.example/test";process.env.DATABASE_SSL_MODE="disable";assert.throws(()=>getPool(),/VERIFIED_DATABASE_TLS_REQUIRED/);
  process.env.DATABASE_URL="postgres://localhost/test?sslmode=disable";assert.throws(()=>getPool(),/USE_DATABASE_SSL_SETTINGS/);
  await closePool();
});
test("each concurrent transaction owns one client, baseline and lock; failures roll back",async()=>{
  process.env.STORAGE_BACKEND="postgres";process.env.DATABASE_URL="postgres://localhost/test";process.env.DATABASE_SSL_MODE="disable";
  const pool=getPool(), events:string[][]=[];
  const original=pool.connect.bind(pool);
  pool.connect=(async()=>{
    const rows:string[]=[];events.push(rows);
    return {query:async(sql:string)=>{rows.push(sql);return{rows:[],rowCount:1};},release:()=>{rows.push("RELEASE");}} as unknown as PoolClient;
  }) as typeof pool.connect;
  try {
    const one=pgTransaction({kind:"clinical",organizationId:"a",examinationId:"one"},async()=>{remember("row",1);await Promise.resolve();assert.equal(transactionContext().examinationId,"one");assert.equal(changed("row",1),false);assert.equal(changed("row",2),true);});
    const two=pgTransaction({kind:"clinical",organizationId:"b",examinationId:"two",operationId:"op"},async()=>{assert.equal(transactionContext().examinationId,"two");throw new Error("EXPECTED_FAILURE");});
    await Promise.all([one,assert.rejects(two,/EXPECTED_FAILURE/)]);
    assert.ok(events[0].includes("COMMIT"));assert.ok(!events[0].includes("ROLLBACK"));
    assert.ok(events[1].includes("ROLLBACK"));assert.ok(!events[1].includes("COMMIT"));
    assert.equal(events[0].at(-1),"RELEASE");assert.equal(events[1].at(-1),"RELEASE");
    assert.throws(()=>transactionContext(),/DATABASE_TRANSACTION_REQUIRED/);
  } finally {pool.connect=original as typeof pool.connect;await closePool();}
});
