import {createReadStream,createWriteStream} from "node:fs";
import {open,appendFile,unlink,stat,readFile,writeFile} from "node:fs/promises";
import {pipeline} from "node:stream/promises";
import {Readable,Transform} from "node:stream";
import {createCipheriv,createDecipheriv,randomBytes,createHash} from "node:crypto";
const magic=Buffer.from("AFBK0002"),headerSize=20,maxMetadata=1024*1024;
const key=value=>createHash("sha256").update(value).digest();
export async function encryptArchive(raw,destination,metadata,secret){
 const json=Buffer.from(JSON.stringify({...metadata,version:2}));if(json.length>maxMetadata)throw new Error("BACKUP_METADATA_TOO_LARGE");
 const length=Buffer.alloc(4);length.writeUInt32BE(json.length);const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",key(secret),iv);cipher.setAAD(magic);
 const output=createWriteStream(destination,{flags:"wx",mode:0o600});let created=false;output.once("open",()=>{created=true;});output.write(Buffer.concat([magic,iv]));
 try{
  async function* source(){yield length;yield json;for await(const chunk of createReadStream(raw))yield chunk;}
  await pipeline(Readable.from(source()),cipher,output);await appendFile(destination,cipher.getAuthTag());
 }catch(error){if(created)await unlink(destination).catch(()=>{});throw error;}
}
/** Writes a private work dump, but returns only after GCM authentication succeeds. Never restore it before this promise resolves. */
export async function decryptArchive(archive,raw,secret){
 const file=await open(archive,"r"),size=(await file.stat()).size,header=Buffer.alloc(headerSize);let tag;
 try{await file.read(header,0,headerSize,0);if(header.subarray(0,8).equals(magic)){if(size<headerSize+16+4)throw new Error("INVALID_BACKUP");tag=Buffer.alloc(16);await file.read(tag,0,16,size-16);}}finally{await file.close();}
 if(!tag){
  if(size>256*1024*1024)throw new Error("LEGACY_BACKUP_TOO_LARGE");
  const envelope=JSON.parse(await readFile(archive,"utf8"));if(envelope.version!==1)throw new Error("INVALID_BACKUP");
  const decipher=createDecipheriv("aes-256-gcm",key(secret),Buffer.from(envelope.iv,"base64"));decipher.setAuthTag(Buffer.from(envelope.tag,"base64"));
  const payload=JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext,"base64")),decipher.final()]).toString("utf8"));
  const output=Buffer.from(payload.dump,"base64");await writeFile(raw,output,{flag:"wx",mode:0o600});delete payload.dump;return payload;
 }
 const decipher=createDecipheriv("aes-256-gcm",key(secret),header.subarray(8));decipher.setAAD(magic);decipher.setAuthTag(tag);
 let pending=Buffer.alloc(0),metadata,length;
 const framing=new Transform({transform(chunk,_encoding,callback){
  try{
   if(metadata){callback(null,chunk);return;}
   pending=Buffer.concat([pending,chunk]);
   if(length===undefined&&pending.length>=4){length=pending.readUInt32BE();if(length<2||length>maxMetadata)throw new Error("INVALID_BACKUP_METADATA");pending=pending.subarray(4);}
   if(length!==undefined&&pending.length>=length){metadata=JSON.parse(pending.subarray(0,length).toString("utf8"));if(metadata.version!==2)throw new Error("INVALID_BACKUP_VERSION");const rest=pending.subarray(length);pending=Buffer.alloc(0);callback(null,rest);}else callback();
  }catch(error){callback(error);}
 },flush(callback){callback(metadata?undefined:new Error("TRUNCATED_BACKUP"));}});
 const output=createWriteStream(raw,{flags:"wx",mode:0o600});let created=false;output.once("open",()=>{created=true;});
 try{await pipeline(createReadStream(archive,{start:headerSize,end:size-17}),decipher,framing,output);return metadata;}
 catch(error){if(created)await unlink(raw).catch(()=>{});throw error;}
}
export async function fileDigest(file){const hash=createHash("sha256");for await(const chunk of createReadStream(file))hash.update(chunk);return hash.digest("hex");}
export async function archiveSize(file){return (await stat(file)).size;}
