import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { installDemoControls } from "./public-demo-controls.mjs";

function consoleInput() {
  const input=new EventEmitter();
  Object.assign(input,{isTTY:true,isRaw:false,paused:true,unreferenced:false,modes:[],isPaused(){return this.paused;},setRawMode(value){this.isRaw=value;this.modes.push(value);},resume(){this.paused=false;},pause(){this.paused=true;},unref(){this.unreferenced=true;}});
  return input;
}

test("Ctrl+C bytes and SIGINT never stop the demo; Ctrl+Q stops it once",()=>{
  const input=consoleInput(),signals=new EventEmitter(),notices=[];let stops=0;
  const dispose=installDemoControls({input,signals,onStop:()=>stops++,onNotice:message=>notices.push(message)});
  assert.equal(input.isRaw,true);assert.equal(input.paused,false);
  input.emit("data",Buffer.from([3]));signals.emit("SIGINT");input.emit("data",Buffer.from("qQordinary text"));
  assert.equal(stops,0);assert.equal(notices.length,2);assert.match(notices[0],/Ctrl\+Q/);
  input.emit("data",Buffer.from([17,17,3]));assert.equal(stops,1);
  dispose();dispose();assert.deepEqual(input.modes,[true,false]);assert.equal(input.paused,true);
  assert.equal(input.unreferenced,true);
  assert.equal(input.listenerCount("data"),0);assert.equal(signals.listenerCount("SIGINT"),0);
});

test("redirected stdin is not read and has no raw-mode requirement",()=>{
  const input=new EventEmitter(),signals=new EventEmitter();let stops=0;
  input.isTTY=false;
  const dispose=installDemoControls({input,signals,onStop:()=>stops++});
  signals.emit("SIGINT");input.emit("data",Buffer.from([17]));assert.equal(stops,0);
  dispose();assert.equal(signals.listenerCount("SIGINT"),0);
});

test("original raw and flowing state are preserved on cleanup",()=>{
  const input=consoleInput();input.isRaw=true;input.paused=false;
  const dispose=installDemoControls({input,signals:new EventEmitter(),onStop:()=>{}});
  dispose();assert.equal(input.isRaw,true);assert.equal(input.paused,false);assert.equal(input.unreferenced,false);
});

test("unsupported raw mode reports the alternative without installing a key listener",()=>{
  const input=consoleInput(),signals=new EventEmitter(),notices=[];
  input.setRawMode=()=>{throw new Error("console unavailable");};
  const dispose=installDemoControls({input,signals,onStop:()=>assert.fail("must not stop"),onNotice:message=>notices.push(message)});
  assert.match(notices[0],/demo:stop/);assert.equal(input.listenerCount("data"),0);
  signals.emit("SIGINT");dispose();
});
