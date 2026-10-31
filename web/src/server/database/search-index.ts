import {createHmac,createHash} from "node:crypto";
import {databaseClient} from "./postgres.ts";
export function searchText(value:string):string{return value.toLocaleLowerCase("ru-RU");}
function secret(scope:string):Buffer{
 const raw=process.env[scope==="clinical"?"EXAMINATION_DATA_KEY":"IDENTITY_DATA_KEY"];
 if(!raw||raw.length<32)throw new Error("DATABASE_ENCRYPTION_KEY_REQUIRED");
 return createHmac("sha256",createHash("sha256").update(raw).digest()).update(`anafix-search-v1:${scope}`).digest();
}
function gramTokens(scope:string,organizationId:string,text:string,length:number):string[]{
 const chars=Array.from(searchText(text)),values=new Set<string>(),key=secret(scope);
 for(let i=0;i<=chars.length-length;i++)values.add(createHmac("sha256",key).update(`${organizationId}:${length}:${chars.slice(i,i+length).join("")}`).digest("hex"));
 return [...values];
}
export function queryTokens(scope:string,organizationId:string,text:string):string[]{return gramTokens(scope,organizationId,text,Math.min(3,Array.from(text).length));}
export async function updateSearchIndex(scope:string,organizationId:string,id:string,text:string):Promise<void>{
 const client=databaseClient(),tokens=[...new Set([1,2,3].flatMap(length=>gramTokens(scope,organizationId,text,length)))];
 await client.query("DELETE FROM anafix.search_token WHERE scope=$1 AND organization_id=$2 AND resource_id=$3",[scope,organizationId,id]);
 if(tokens.length)await client.query("INSERT INTO anafix.search_token(scope,organization_id,resource_id,token) SELECT $1,$2,$3,unnest($4::text[])",[scope,organizationId,id,tokens]);
}
export async function indexesReady():Promise<boolean>{return Boolean((await databaseClient().query("SELECT ready FROM anafix.index_state WHERE name='search-v1'")).rows[0]?.ready);}
