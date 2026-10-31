import {test} from "node:test";
import assert from "node:assert/strict";
import {base32,totp,verifyTotp,recoveryHash,newRecoveryCodes} from "./totp.ts";
test("RFC 6238 SHA1 vectors, replay prevention, limited skew and recovery codes",()=>{
 const secret=base32(Buffer.from("12345678901234567890"));
 for(const [time,expected] of [[59,"94287082"],[1111111109,"07081804"],[1111111111,"14050471"],[1234567890,"89005924"],[2000000000,"69279037"],[20000000000,"65353130"]] as const)assert.equal(totp(secret,Math.floor(time/30),8),expected);
 const now=1234567890000,counter=Math.floor(now/30_000),code=totp(secret,counter);
 assert.equal(verifyTotp(secret,code,-1,now),counter);assert.equal(verifyTotp(secret,code,counter,now),null);
 assert.equal(verifyTotp(secret,totp(secret,counter-2),-1,now),null);assert.equal(verifyTotp(secret,"x00000",-1,now),null);
 const codes=newRecoveryCodes();assert.equal(new Set(codes).size,10);assert.equal(recoveryHash(codes[0]),recoveryHash(codes[0].toUpperCase().replaceAll("-","")));
});
