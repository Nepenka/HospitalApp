import test from "node:test";
import assert from "node:assert/strict";
import {createCipheriv,createHash,randomBytes} from "node:crypto";
import {encryptDatabaseValue,decryptDatabaseValue} from "./postgres.ts";
test("rotation reads old authenticated snapshots, encrypts new rows with key IDs and rejects unknown or modified keys",()=>{
 const old="synthetic old clinical key at least thirty two",fresh="synthetic new clinical key at least thirty two",value={comment:"synthetic old revision"};
 process.env.EXAMINATION_DATA_KEY=old;const previous=encryptDatabaseValue(value,"clinical");
 const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",createHash("sha256").update(old).digest(),iv),data=Buffer.concat([cipher.update(JSON.stringify(value)),cipher.final()]);
 const legacy=JSON.stringify({version:1,iv:iv.toString("base64"),tag:cipher.getAuthTag().toString("base64"),ciphertext:data.toString("base64")});
 process.env.EXAMINATION_DATA_KEY=fresh;process.env.EXAMINATION_DATA_PREVIOUS_KEYS=JSON.stringify([old]);
 assert.deepEqual(decryptDatabaseValue(previous,"clinical"),value);assert.deepEqual(decryptDatabaseValue(legacy,"clinical"),value);
 const next=encryptDatabaseValue(value,"clinical");assert.notEqual(JSON.parse(previous).keyId,JSON.parse(next).keyId);
 delete process.env.EXAMINATION_DATA_PREVIOUS_KEYS;assert.throws(()=>decryptDatabaseValue(previous,"clinical"));assert.deepEqual(decryptDatabaseValue(next,"clinical"),value);
 const modified=JSON.parse(next);modified.keyId=JSON.parse(previous).keyId;assert.throws(()=>decryptDatabaseValue(JSON.stringify(modified),"clinical"));
});
