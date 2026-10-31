import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,open,writeFile,rm} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {encryptArchive,decryptArchive,fileDigest,archiveSize} from "./backup-stream.mjs";
test("streaming archives exceed 128 MiB, preserve bytes, reject tampering and remove unauthenticated output",async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),"anafix-stream-test-")),raw=path.join(directory,"input.dump"),encrypted=path.join(directory,"archive.enc"),restored=path.join(directory,"restored.dump"),key="synthetic backup encryption key at least thirty two";
 try{
  const f=await open(raw,"wx"),chunk=Buffer.alloc(1024*1024,73);try{for(let i=0;i<130;i++)await f.write(chunk);}finally{await f.close();}
  await encryptArchive(raw,encrypted,{database:"synthetic",keys:{clinical:"synthetic-key"}},key);
  assert.ok(await archiveSize(encrypted)>128*1024*1024);
  const metadata=await decryptArchive(encrypted,restored,key);assert.equal(metadata.version,2);assert.equal(await fileDigest(raw),await fileDigest(restored));
  const bad=await open(encrypted,"r+");try{await bad.write(Buffer.from([0]),0,1,29);}finally{await bad.close();}
  const rejected=path.join(directory,"unauthenticated.dump");await assert.rejects(decryptArchive(encrypted,rejected,key));await assert.rejects(archiveSize(rejected));
  await writeFile(path.join(directory,"truncated.enc"),Buffer.from("AFBK0002"));await assert.rejects(decryptArchive(path.join(directory,"truncated.enc"),rejected,key));
 }finally{await rm(directory,{recursive:true,force:true});}
});
