import test from "node:test";
import assert from "node:assert/strict";
import {demoGet} from "./public-demo-http.mjs";
test("a stale socket after server restart retries GET on a fresh connection",async()=>{
  let calls=0;
  const response=await demoGet("https://synthetic.invalid/login",{sleep:async()=>{},fetcher:async(url,options)=>{
    assert.equal(options.headers.Connection,"close");assert.equal(options.method,undefined);
    if(++calls===1)throw new TypeError("fetch failed",{cause:{code:"UND_ERR_SOCKET"}});
    if(calls===2)return new Response("gateway restarting",{status:502});
    return new Response("demo ready");
  }});
  assert.equal(calls,3);assert.equal(await response.text(),"demo ready");
});
test("persistent failure reports route and reason with bounded retries",async()=>{
  let calls=0;await assert.rejects(demoGet("https://synthetic.invalid/login",{sleep:async()=>{},fetcher:async()=>{calls++;throw new TypeError("fetch failed",{cause:{code:"ECONNRESET"}});}}),/GET \/login.*ECONNRESET.*4 attempts/);assert.equal(calls,4);
});
test("TLS verification failures are not suppressed or retried",async()=>{
  let calls=0;await assert.rejects(demoGet("https://synthetic.invalid/login",{sleep:async()=>{},fetcher:async()=>{calls++;throw new TypeError("fetch failed",{cause:{code:"CERT_HAS_EXPIRED"}});}}),/TLS certificate verification failed/);assert.equal(calls,1);
});
