import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { offlineExportText, offlinePdfBlob } from "../../client/offline/export.ts";
import { queueExamination } from "./queue.ts";
import type { OfflineVault } from "./types.ts";

test("offline export includes raw physician clarification and marks unsynchronized copies in RU/EN",async()=>{
  const now=Date.now();
  const state:OfflineVault={version:1,grant:"test",access:{version:1,deviceId:"11111111-1111-4111-8111-111111111111",principal:{id:"test",organizationId:"test",displayName:"test",credentialVersion:1},issuedAt:now-1000,expiresAt:now+3600_000},lastSeen:now,records:[],outbox:[],resolvedConflicts:[]};
  queueExamination(state,{fullName:"Тестовый Пациент",probableAllergen:"",acuteOnset:"unknown",allergenContact:"unknown",reactionDate:"2026-10-04",reactionTime:"09:30",physicianComment:"<script>never execute</script>\nКомментарий",selectedSymptoms:[{id:"skin-discomfort"}],vitals:{age:{years:18,months:0},systolicBP:120,diastolicBP:80,spO2:98,heartRate:80,respiratoryRate:16,gcs:15}},crypto.randomUUID(),crypto.randomUUID(),now);
  const ru=offlineExportText(state.records[0],"ru"),en=offlineExportText(state.records[0],"en");
  assert.match(ru,/НЕ СИНХРОНИЗИРОВАНО/);assert.match(en,/NOT SYNCHRONIZED/);
  assert.ok(ru.includes("Комментарий"));assert.ok(ru.includes("09:30"));assert.ok(en.includes("Physician comment / clarification"));
  const original=globalThis.fetch;
  globalThis.fetch=(async(url)=>{assert.equal(url,"/fonts/NotoSans.ttf");return new Response(new Uint8Array(await readFile(new URL("../../../public/fonts/NotoSans.ttf",import.meta.url))));}) as typeof fetch;
  try {
    const pdf=await offlinePdfBlob(ru);const bytes=new Uint8Array(await pdf.arrayBuffer());
    assert.equal(pdf.type,"application/pdf");assert.equal(new TextDecoder().decode(bytes.slice(0,5)),"%PDF-");assert.ok(bytes.length>10_000);
    assert.ok(new TextDecoder("latin1").decode(bytes).includes("/FontFile2"));
  } finally {globalThis.fetch=original;}
});
