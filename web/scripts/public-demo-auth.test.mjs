import test from "node:test";
import assert from "node:assert/strict";
import {verifyDemoSignIns} from "./public-demo-auth.mjs";
const manifest={node:{login:{exportedName:"loginAction"},logout:{exportedName:"logoutAction"},mfa:{exportedName:"mfaAction"}}};
test("demo verifier includes required MFA instead of expecting an immediate admin panel",async()=>{
  const entry={role:"Synthetic hospital administrator",login:"synthetic",password:"synthetic password",route:"/organization"};
  let confirmed=false,steps=[];
  const response=(body="",headers={},status=200)=>new Response(body,{status,headers});
  const cookie={"Set-Cookie":"__Host-anafix-session=synthetic; Secure; HttpOnly"};
  await verifyDemoSignIns({origin:"http://synthetic.invalid",transportOrigin:"http://127.0.0.1:9999",credentials:[entry],manifest,fetcher:async(url,options)=>{
    assert.ok(url.startsWith("http://127.0.0.1:9999/"));assert.equal(options.headers.Host,"synthetic.invalid");assert.equal(options.headers["X-Forwarded-Host"],"synthetic.invalid");
    const action=options.headers["Next-Action"];
    if(action==="login"){steps.push("password");return response("",{...cookie,"x-action-redirect":"/mfa;push"});}
    if(action==="mfa"){
      const operation=options.body.get("_1_operation");steps.push(operation);
      if(operation==="setup")return response('0:{"enabled":false,"secret":"JBSWY3DPEHPK3PXP"}');
      assert.match(options.body.get("_1_code"),/^\d{6}$/);confirmed=true;
      return response(`0:${JSON.stringify({recoveryCodes:Array.from({length:10},(_,i)=>`synthetic-code-${i}`),nextPath:entry.route})}`,cookie);
    }
    if(action==="logout"){steps.push("logout");return response();}
    return confirmed?response():response("",{location:"/mfa"},307);
  }});
  assert.deepEqual(steps,["password","setup","verify","logout"]);assert.equal(entry.recoveryCodes.length,10);
});
test("demo verifier rejects a missing MFA redirect rather than bypassing administrator security",async()=>{
  await assert.rejects(verifyDemoSignIns({origin:"http://synthetic.invalid",credentials:[{role:"admin",route:"/admin",login:"synthetic",password:"synthetic"}],manifest,fetcher:async()=>new Response("",{headers:{"x-action-redirect":"/admin;push"}})}),/expected \/mfa/);
});
test("after reconnect a saved second factor is verified, never enrolled or bypassed again",async()=>{
  const entry={role:"Synthetic administrator",route:"/admin",login:"synthetic",password:"synthetic",recoveryCodes:["saved-code","next-code"]};
  let confirmed=false;
  const cookie={"Set-Cookie":"__Host-anafix-session=synthetic; Secure; HttpOnly"};
  await verifyDemoSignIns({origin:"https://new.lhr.life",transportOrigin:"http://127.0.0.1:9999",credentials:[entry],manifest,enrolled:true,fetcher:async(url,options)=>{
    assert.equal(options.headers.Host,"new.lhr.life");
    const action=options.headers["Next-Action"];
    if(action==="login")return new Response("",{headers:{...cookie,"x-action-redirect":"/mfa;push"}});
    if(action==="mfa"){
      assert.equal(options.body.get("_1_operation"),"verify");assert.equal(options.body.get("_1_code"),"saved-code");confirmed=true;
      return new Response("",{headers:{...cookie,"x-action-redirect":"/admin;push"}});
    }
    if(action==="logout")return new Response("");
    return confirmed?new Response(""):new Response("",{status:307,headers:{location:"/mfa"}});
  }});
  assert.equal(confirmed,true);assert.deepEqual(entry.recoveryCodes,["next-code"]);
});
test("demo cooldown check probes wrong passwords but still requires a valid password",async()=>{
  let invalid=0,valid=0;
  const entry={role:"Synthetic doctor",route:"/",login:"synthetic",password:"correct-synthetic-password"};
  await verifyDemoSignIns({origin:"http://synthetic.invalid",credentials:[entry],manifest,verifyNoCooldown:true,fetcher:async(url,options)=>{
    const action=options.headers["Next-Action"];
    if(action==="login"){
      if(options.body.get("_1_password")!==entry.password){invalid++;return new Response('0:{"error":"Invalid credentials."}');}
      valid++;return new Response("",{headers:{"Set-Cookie":"__Host-anafix-session=synthetic; Secure; HttpOnly","x-action-redirect":"/;push"}});
    }
    return new Response("");
  }});
  assert.equal(invalid,8);assert.equal(valid,1);
});
