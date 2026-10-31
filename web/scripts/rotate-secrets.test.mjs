import test from "node:test";
import assert from "node:assert/strict";
import {rotationPlan,envelopeKeyId} from "./rotate-secrets.mjs";
test("rotation prepares independent keys without mutating credentials and never drops historical keys",()=>{
 const old={identityKey:"synthetic identity key at least thirty two",clinicalKey:"synthetic clinical key at least thirty two",sessionSecret:"synthetic session key at least thirty two",previousIdentityKeys:["retained identity key at least thirty two"],previousClinicalKeys:[]};
 const original=JSON.stringify(old),next=rotationPlan(old);
 assert.equal(JSON.stringify(old),original);assert.deepEqual(next.previousIdentityKeys,[old.identityKey,...old.previousIdentityKeys]);assert.deepEqual(next.previousClinicalKeys,[old.clinicalKey]);
 assert.notEqual(envelopeKeyId(next.identityKey),envelopeKeyId(old.identityKey));assert.notEqual(next.identityKey,next.clinicalKey);assert.notEqual(next.sessionSecret,old.sessionSecret);
 assert.throws(()=>rotationPlan({...old,previousClinicalKeys:Array(8).fill(old.clinicalKey)}),/HISTORICAL_KEYS_REQUIRE_REVIEW/);
});
