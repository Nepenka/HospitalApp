import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { DemoTunnel, retryDemoConnection, tunnelOrigin } from "./public-demo-tunnel.mjs";

const accepted = (origin) => JSON.stringify({ type: "v1.tcpip_forward.register.accepted", data: `tunnel ready ${origin}` }) + "\n";
class FakeProcess extends EventEmitter {
  constructor(pid) { super(); this.pid=pid; this.exitCode=null; this.signalCode=null; this.stdout=new PassThrough(); this.stderr=new PassThrough(); this.kills=0; }
  kill() { this.kills++; this.signalCode="SIGTERM"; queueMicrotask(()=>this.emit("exit",null,"SIGTERM")); return true; }
}
function harness(onSpawn) {
  const children=[],events=[];
  const tunnel=new DemoTunnel({ssh:"existing-ssh",port:12345,knownHostsPath:"demo-known-hosts",onEvent:event=>events.push(event),spawnProcess:(command,args,options)=>{
    assert.equal(command,"existing-ssh");
    assert.ok(args.includes("StrictHostKeyChecking=accept-new"));
    assert.ok(args.includes("IdentityFile=none"));
    assert.ok(args.includes("nokey@localhost.run"));
    assert.equal(options.windowsHide,true);
    const child=new FakeProcess(children.length+1);children.push(child);
    queueMicrotask(()=>onSpawn(child,children.length));return child;
  }});
  return {tunnel,children,events};
}

test("only accepted HTTPS localhost.run hostnames are used as health-check destinations",()=>{
  assert.equal(tunnelOrigin(accepted("https://abc.lhr.life")),"https://abc.lhr.life");
  assert.equal(tunnelOrigin(accepted("https://abc.localhost.run")),"https://abc.localhost.run");
  for(const value of ["https://abc.lhr.life.evil.invalid","http://abc.lhr.life","https://evil.invalid","https://user:pass@abc.lhr.life"])
    assert.equal(tunnelOrigin(accepted(value)),null);
  assert.equal(tunnelOrigin("SSH welcome text"),null);
  assert.equal(tunnelOrigin(JSON.stringify({type:"unrelated",data:"https://abc.lhr.life"})),null);
});

test("rotation is detected without killing the healthy tunnel or losing the new URL",async()=>{
  const {tunnel,children,events}=harness(child=>{
    const line=accepted("https://first.lhr.life");
    child.stdout.write("welcome\n"+line.slice(0,15));child.stdout.write(line.slice(15));
  });
  assert.equal(await tunnel.open(),"https://first.lhr.life");
  children[0].stdout.write(accepted("https://second.lhr.life"));
  assert.equal(tunnel.alive,true);assert.equal(tunnel.needsRecovery("https://first.lhr.life"),true);
  assert.equal(tunnel.needsRecovery("https://second.lhr.life"),false);
  assert.equal(children[0].kills,0);assert.equal(events.at(-1).previousOrigin,"https://first.lhr.life");
  await tunnel.stop();assert.equal(children[0].kills,1);assert.equal(tunnel.alive,false);
});

test("connection reset can open a fresh SSH process; late events from the old process are ignored",async()=>{
  const {tunnel,children}=harness((child,index)=>child.stdout.write(accepted(`https://run${index}.lhr.life`)));
  await tunnel.open();const old=children[0];
  old.stderr.write("client_loop: send disconnect: Connection reset");old.exitCode=255;old.emit("exit",255,null);
  assert.equal(tunnel.needsRecovery("https://run1.lhr.life"),true);assert.match(tunnel.error,/Connection reset/);
  assert.equal(await tunnel.open(),"https://run2.lhr.life");
  old.stdout.write(accepted("https://stale.lhr.life"));old.emit("error",new Error("late failure"));
  assert.equal(tunnel.origin,"https://run2.lhr.life");assert.equal(tunnel.alive,true);
  await tunnel.stop();
});

test("SSH spawn failure and missing hostname are bounded and cleanable",async()=>{
  const failed=harness(child=>{child.emit("error",new Error("spawn ENOENT"));});
  await assert.rejects(failed.tunnel.open(),/ENOENT/);await failed.tunnel.stop();
  const silent=harness(()=>{});
  await assert.rejects(silent.tunnel.open({timeoutMs:1,wait:()=>new Promise(resolve=>setTimeout(resolve,5))}),/не выдал ссылку/);
  await silent.tunnel.stop();assert.equal(silent.children[0].kills,1);
});

test("recovery retries safe connection checks with backoff and stops after success",async()=>{
  const waits=[],failures=[],retries=[];let calls=0;
  const result=await retryDemoConnection({wait:async ms=>waits.push(ms),onFailure:async error=>failures.push(error.message),onRetry:async attempt=>retries.push(attempt),connect:async()=>{
    if(++calls<3)throw new Error("connection reset");return "https://restored.lhr.life";
  }});
  assert.equal(result,"https://restored.lhr.life");assert.equal(calls,3);
  assert.deepEqual(waits,[0,1000,3000]);assert.deepEqual(retries,[2,3]);assert.equal(failures.length,2);
});

test("persistent failure never creates an infinite reconnect loop",async()=>{
  let calls=0,cleanups=0;
  await assert.rejects(retryDemoConnection({wait:async()=>{},onFailure:async()=>{cleanups++;},connect:async()=>{calls++;throw new Error("offline");}}),/после 5 попыток.*offline/);
  assert.equal(calls,5);assert.equal(cleanups,5);
});

test("stop request or expiry during backoff prevents a new tunnel",async()=>{
  let stop=false,calls=0;
  await assert.rejects(retryDemoConnection({shouldStop:async()=>stop,wait:async ms=>{if(ms)stop=true;},connect:async()=>{calls++;throw new Error("offline");}}),/остановлено/);
  assert.equal(calls,1);
});

test("stop while waiting for an SSH hostname does not keep waiting",async()=>{
  const {tunnel}=harness(()=>{});
  await assert.rejects(tunnel.open({shouldStop:async()=>true}),/остановлен/);await tunnel.stop();
});
