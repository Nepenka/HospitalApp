// Demo health check only; real MFA remains implemented by the server.
import assert from "node:assert/strict";
import {createHmac} from "node:crypto";
function authenticatorCode(secret,now=Date.now()){
  let bits=0,value=0;const bytes=[],alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  for(const char of secret){const digit=alphabet.indexOf(char);assert.ok(digit>=0);value=(value<<5)|digit;bits+=5;if(bits>=8){bytes.push((value>>>(bits-8))&255);bits-=8;}}
  const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(now/30000)));
  const hash=createHmac("sha1",Buffer.from(bytes)).update(counter).digest(),offset=hash[hash.length-1]&15;
  return String((hash.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,"0");
}
function formArgs(fields){const form=new FormData();for(const [name,value] of Object.entries(fields))form.set(`_1_${name}`,String(value));form.set("0",JSON.stringify([{},"$K1"]));return form;}
function actionValue(raw){
  for(const line of raw.split("\n")){try{const value=JSON.parse(line.slice(line.indexOf(":")+1));if(value&&typeof value==="object"&&["secret","enabled","recoveryCodes","error"].some(key=>key in value))return value;}catch{/* React stream framing is not JSON. */}}
  return undefined;
}
function sessionCookie(response){return response.headers.getSetCookie().find(value=>value.startsWith("__Host-anafix-session=")&&!value.startsWith("__Host-anafix-session=;"))?.split(";")[0];}
export async function verifyDemoSignIns({origin,transportOrigin=origin,credentials,manifest,fetcher=fetch,enrolled=false,verifyNoCooldown=false}){
  // Local health checks still use the public Host/Origin for Server Action checks.
  const transportHeaders=transportOrigin!==origin?{Host:new URL(origin).host,"X-Forwarded-Host":new URL(origin).host}:{};
  const actionId=name=>Object.entries(manifest.node).find(([,action])=>action.exportedName===name)?.[0];
  assert.ok(actionId("loginAction")&&actionId("logoutAction")&&actionId("mfaAction"),"Required sign-in actions are missing; rebuild the website.");
  const request=(route,name,body,cookie)=>fetcher(`${transportOrigin}${route}`,{method:"POST",redirect:"manual",headers:{...transportHeaders,Connection:"close","Next-Action":actionId(name),Accept:"text/x-component",Origin:origin,...(cookie?{Cookie:cookie}:{}),...(body instanceof FormData?{}:{"Content-Type":"text/plain;charset=UTF-8"})},body:body instanceof FormData?body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
  if(verifyNoCooldown){
    for(let attempt=0;attempt<8;attempt++){
      const response=await request("/login","loginAction",formArgs({login:credentials[0].login,password:"incorrect-demo-password-only"}));
      const state=actionValue(await response.text());
      assert.ok(response.status<400&&["Неверные учётные данные.","Invalid credentials."].includes(state?.error),"Isolated demo must reject a wrong password without a waiting period.");
    }
  }
  for(const entry of credentials){
    const administrator=entry.route!=="/",expected=administrator?"/mfa":entry.route;
    const login=await request("/login","loginAction",formArgs({login:entry.login,password:entry.password}));await login.text();
    assert.ok(login.status<400&&login.headers.get("x-action-redirect")?.split(";")[0]===expected,`Sign-in failed (${entry.role}); expected ${expected}, HTTP ${login.status}.`);
    let cookie=sessionCookie(login);assert.ok(cookie,"Secure session was not created.");
    if(administrator){
      const blocked=await fetcher(`${transportOrigin}${entry.route}`,{redirect:"manual",headers:{...transportHeaders,Connection:"close",Cookie:cookie},signal:AbortSignal.timeout(30000)});
      assert.equal(blocked.headers.get("location"),"/mfa","Administrator must not access the panel before MFA.");
      await blocked.arrayBuffer();
      if(enrolled){
        assert.ok(entry.recoveryCodes?.length,"A saved demo-only second factor is required.");
        const verified=await request("/mfa","mfaAction",formArgs({operation:"verify",code:entry.recoveryCodes[0]}),cookie);await verified.text();
        assert.ok(verified.status<400&&verified.headers.get("x-action-redirect")?.split(";")[0]===entry.route,`Saved demo second factor failed (${entry.role}).`);
        cookie=sessionCookie(verified);assert.ok(cookie,"Confirmed administrator session was not created.");
        entry.recoveryCodes=entry.recoveryCodes.slice(1);
      }else{
      const setup=await request("/mfa","mfaAction",formArgs({operation:"setup"}),cookie),prepared=actionValue(await setup.text());
      assert.ok(prepared?.secret&&prepared.enabled===false,`Demo second-factor setup failed (${entry.role}).`);
      if(verifyNoCooldown){
        for(let attempt=0;attempt<8;attempt++){
          const invalid=await request("/mfa","mfaAction",formArgs({operation:"verify",code:"invalid-demo-code"}),cookie);
          const state=actionValue(await invalid.text());
          assert.ok(invalid.status<400&&["Код неверный или уже использован.","Invalid or already used code."].includes(state?.error),"Isolated demo must reject an invalid MFA code without a waiting period.");
        }
      }
      const verified=await request("/mfa","mfaAction",formArgs({operation:"verify",code:authenticatorCode(prepared.secret)}),cookie),result=actionValue(await verified.text());
      assert.ok(Array.isArray(result?.recoveryCodes)&&result.recoveryCodes.length===10&&result.nextPath===entry.route,`Demo second-factor confirmation failed (${entry.role}).`);
      cookie=sessionCookie(verified);assert.ok(cookie,"Confirmed administrator session was not created.");
      // These are generated demo-only credentials. No production MFA bypass.
      entry.authenticatorSecret=prepared.secret;entry.recoveryCodes=result.recoveryCodes;
      }
    }
    const panel=await fetcher(`${transportOrigin}${entry.route}`,{redirect:"manual",headers:{...transportHeaders,Connection:"close",Cookie:cookie},signal:AbortSignal.timeout(30000)});
    assert.equal(panel.status,200,`Panel did not open (${entry.role}).`);await panel.arrayBuffer();
    const logout=await request(entry.route,"logoutAction",[],cookie);await logout.text();
    assert.ok(logout.status<400,"Demo logout failed.");
  }
}
