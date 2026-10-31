import {createHmac,randomBytes,timingSafeEqual,createHash} from "node:crypto";
const alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function base32(bytes:Buffer):string {let bits=0,value=0,result="";for(const byte of bytes){value=(value<<8)|byte;bits+=8;while(bits>=5){result+=alphabet[(value>>>(bits-5))&31];bits-=5;}}if(bits)result+=alphabet[(value<<(5-bits))&31];return result;}
function unbase32(text:string):Buffer {let bits=0,value=0;const result:number[]=[];for(const char of text){const digit=alphabet.indexOf(char);if(digit<0)throw new Error("INVALID_TOTP_SECRET");value=(value<<5)|digit;bits+=5;if(bits>=8){result.push((value>>>(bits-8))&255);bits-=8;}}return Buffer.from(result);}
export function newTotpSecret():string{return base32(randomBytes(20));}
export function totp(secret:string,counter:number,digits=6):string {const data=Buffer.alloc(8);data.writeBigUInt64BE(BigInt(counter));const hash=createHmac("sha1",unbase32(secret)).update(data).digest();const offset=hash[hash.length-1]&15;return String((hash.readUInt32BE(offset)&0x7fffffff)%10**digits).padStart(digits,"0");}
export function verifyTotp(secret:string,code:string,lastCounter:number,now=Date.now()):number|null {if(!/^\d{6}$/.test(code))return null;const counter=Math.floor(now/30_000);for(const value of [counter,counter-1,counter+1])if(value>lastCounter&&value>=0&&timingSafeEqual(Buffer.from(code),Buffer.from(totp(secret,value))))return value;return null;}
export function recoveryHash(code:string):string{return createHash("sha256").update(code.replace(/[\s-]/g,"").toLowerCase()).digest("hex");}
export function newRecoveryCodes():string[]{return Array.from({length:10},()=>randomBytes(16).toString("hex").match(/.{1,8}/g)!.join("-"));}
