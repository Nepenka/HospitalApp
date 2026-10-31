import assert from "node:assert/strict";
import test from "node:test";
import { IDBFactory } from "fake-indexeddb";
import { EncryptedOfflineVault } from "../../client/offline/vault.ts";
import { decryptVault, deriveVaultKey, encryptVault, encodeBytes } from "../../client/offline/crypto.ts";
import { acknowledge, mergeHistory, queueDeletion, queueExamination, resolveConflict } from "./queue.ts";
import { accessAllowed, type OfflineGrant, type OfflineVault } from "./types.ts";
import type { ExaminationInput, StoredExamination } from "../examinations/types.ts";
import { retainLocalCopies, saveLocalDraft, queueOfflineExport } from "./maintenance.ts";
import type { LocalDraft } from "./types.ts";

const passphrase = "separate hospital test passphrase";
const id = "11111111-1111-4111-8111-111111111111";
const operationId = "22222222-2222-4222-8222-222222222222";
const grant = (): { access: OfflineGrant; token: string } => {
  const access: OfflineGrant = { version: 1, deviceId: "33333333-3333-4333-8333-333333333333", principal: { id: "doctor", organizationId: "hospital", displayName: "Test doctor", credentialVersion: 1 }, issuedAt: Date.now() - 1000, expiresAt: Date.now() + 3600_000 };
  return { access, token: `${Buffer.from(JSON.stringify(access)).toString("base64url")}.test-signature` };
};
const state = (): OfflineVault => { const g = grant(); return { version: 1, grant: g.token, access: g.access, lastSeen: g.access.issuedAt, records: [], outbox: [], resolvedConflicts: [] }; };
const input: ExaminationInput = { fullName: "Synthetic patient", probableAllergen: "", acuteOnset: "unknown", allergenContact: "unknown", reactionDate: "2026-09-30", physicianComment: "Physician note", selectedSymptoms: [{ id: "skin-discomfort" }], vitals: { age: { years: 18, months: 0 }, systolicBP: 120, diastolicBP: 80, spO2: 98, heartRate: 80, respiratoryRate: 16, gcs: 15 } };
const draft = (): LocalDraft => ({ id:crypto.randomUUID(), mode:"new", revision:0,updatedAt:Date.now(),snapshot:{step:"vitals",fullName:input.fullName,allergen:"",allergenContact:"unknown",acuteOnset:"unknown",reactionDate:"",reactionTime:"09:",physicianComment:"unfinished note",selectedIds:["skin-discomfort"],selectedOptions:{},vitalsDraft:{ageYears:"",ageMonths:"0",systolicBP:"12",diastolicBP:"",baselineSystolicBP:"",spO2:"",heartRate:"",respiratoryRate:"",gcs:""}} });

test("unfinished raw fields survive encrypted lock/reopen; clearing a draft is explicit", async () => {
  prepareStorage(); const v=new EncryptedOfflineVault(), g=grant(), d=draft();
  await v.create(passphrase,g.token,g.access);
  await v.mutate(state=>saveLocalDraft(state,d,0,Date.now())); v.lock();
  const reopened=new EncryptedOfflineVault(); const state=await reopened.unlock(passphrase);
  assert.equal(state.drafts?.[0].snapshot.vitalsDraft.ageYears,"");
  assert.equal(state.drafts?.[0].snapshot.reactionTime,"09:");
  assert.equal(state.drafts?.[0].snapshot.step,"vitals");
  await assert.rejects(reopened.clear(),/UNSYNCED_DATA/);
  await assert.rejects(reopened.mutate(state=>saveLocalDraft(state,d,0,Date.now())),/DRAFT_CONFLICT/);
  assert.equal((await reopened.read()).drafts?.[0].revision,1);
});
test("seven-day cleanup preserves pending data, unresolved conflicts and draft references", () => {
  const v=state(), now=Date.now(); v.access.localRetentionDays=7;
  queueExamination(v,input,id,operationId,now);
  const record=structuredClone(v.records[0].record); record.rowVersion=1;
  v.records=[{record:{...record,id:"expired"},state:"synced",syncedAt:now-8*86400_000},{record:{...record,id:"recent"},state:"synced",syncedAt:now-6*86400_000},{record:{...record,id:"draft-record"},state:"synced",syncedAt:now-8*86400_000},{record,state:"pending",syncedAt:now-8*86400_000},{record:{...record,id:"conflict"},state:"conflict",serverRecord:record,syncedAt:now-8*86400_000}];
  v.drafts=[{...draft(),examinationId:"draft-record"}];
  v.resolvedConflicts=[{local:record,server:record,resolvedAt:new Date(now).toISOString()},{local:record,server:record,resolvedAt:new Date(now).toISOString(),reportedAt:now-8*86400_000}];
  retainLocalCopies(v,now);
  assert.deepEqual(v.records.map(row=>row.record.id),["recent","draft-record",id,"conflict"]);
  assert.equal(v.drafts.length,1); assert.equal(v.outbox.length,1); assert.equal(v.resolvedConflicts.length,1);
});
test("offline export intent is durable and blocks clearing until acknowledgement", async () => {
  prepareStorage(); const v=new EncryptedOfflineVault(),g=grant();await v.create(passphrase,g.token,g.access);
  await v.mutate(state=>{queueExamination(state,input,id,operationId,Date.now());queueOfflineExport(state,{id:crypto.randomUUID(),examinationId:id,kind:"pdf",occurredAt:Date.now(),rowVersion:0,grant:state.grant},Date.now());});
  v.lock(); const restored=await v.unlock(passphrase);
  assert.equal(restored.exportEvents?.[0].rowVersion,0);
  assert.equal(restored.exportEvents?.[0].kind,"pdf");
  await assert.rejects(v.clear(),/UNSYNCED_DATA/);
  assert.throws(()=>queueOfflineExport(restored,{id:crypto.randomUUID(),examinationId:id,kind:"copy",occurredAt:restored.access.expiresAt,rowVersion:0,grant:restored.grant},restored.access.expiresAt),/ACCESS_EXPIRED/);
});

function prepareStorage() {
  Object.defineProperty(globalThis, "indexedDB", { value: new IDBFactory(), configurable: true });
  const queues = new Map<string, Promise<unknown>>();
  Object.defineProperty(globalThis, "navigator", { value: { locks: { request: (name: string, callback: () => Promise<unknown>) => {
    const result = (queues.get(name) ?? Promise.resolve()).then(callback);
    queues.set(name, result.catch(() => undefined)); return result;
  } } }, configurable: true });
}

test("AES-GCM authenticates encrypted content; key cannot be exported", async () => {
  const salt = encodeBytes(crypto.getRandomValues(new Uint8Array(16)));
  const key = await deriveVaultKey(passphrase, salt);
  assert.equal(key.extractable, false);
  const envelope = await encryptVault({ fullName: input.fullName, grant: "secret" }, key, salt);
  assert.ok(!JSON.stringify(envelope).includes(input.fullName));
  assert.deepEqual(await decryptVault(envelope, key), { fullName: input.fullName, grant: "secret" });
  const wrong = await deriveVaultKey("a completely different passphrase", salt);
  await assert.rejects(decryptVault(envelope, wrong));
  const damaged = { ...envelope, ciphertext: `${envelope.ciphertext[0] === "A" ? "B" : "A"}${envelope.ciphertext.slice(1)}` };
  await assert.rejects(decryptVault(damaged, key));
});

test("IndexedDB persists ciphertext and queued examination across lock/reopen", async () => {
  prepareStorage();
  const first = new EncryptedOfflineVault(), g = grant();
  await first.create(passphrase, g.token, g.access);
  await first.mutate((v) => { queueExamination(v, input, id, operationId, Date.now()); });
  const db = await new Promise<IDBDatabase>((resolve) => { const request = indexedDB.open("anafix-offline-v1"); request.onsuccess = () => resolve(request.result); });
  const envelope = await new Promise<unknown>((resolve) => { const request = db.transaction("encrypted-vault").objectStore("encrypted-vault").get("current"); request.onsuccess = () => resolve(request.result); });
  db.close();
  assert.ok(!JSON.stringify(envelope).includes(input.fullName));
  assert.ok(!JSON.stringify(envelope).includes(passphrase));
  first.lock(); await assert.rejects(first.read(), /VAULT_LOCKED/);
  const reopened = new EncryptedOfflineVault();
  await assert.rejects(reopened.unlock("wrong but sufficiently long passphrase"), /WRONG_PASSPHRASE/);
  const restored = await reopened.unlock(passphrase);
  assert.equal(restored.records[0].record.physicianComment, input.physicianComment);
  assert.equal(restored.outbox[0].operationId, operationId);
  await assert.rejects(reopened.clear(), /UNSYNCED_DATA/);
  assert.equal((await reopened.read()).outbox.length, 1);
});

test("two tabs serialize encrypted read-modify-write without losing operations", async () => {
  prepareStorage();
  const first = new EncryptedOfflineVault(), second = new EncryptedOfflineVault(), g = grant();
  await first.create(passphrase, g.token, g.access); await second.unlock(passphrase);
  await Promise.all([first.mutate((v) => { queueExamination(v, input, id, operationId, Date.now()); }), second.mutate((v) => { queueExamination(v, input, "44444444-4444-4444-8444-444444444444", "55555555-5555-4555-8555-555555555555", Date.now()); })]);
  assert.equal((await first.read()).outbox.length, 2);
});

test("expiry and clock rollback deny access; active grant permits local save", () => {
  const v = state();
  assert.equal(accessAllowed(v, v.access.expiresAt), false);
  assert.equal(accessAllowed(v, v.lastSeen - 60_001), false);
  assert.equal(accessAllowed(v, v.lastSeen), true);
  assert.throws(() => queueExamination(v, input, id, operationId, v.access.expiresAt), /ACCESS_EXPIRED/);
});

test("history download cannot overwrite pending local changes; tombstones hide synced records", () => {
  const v = state(); queueExamination(v, input, id, operationId, Date.now());
  const server: StoredExamination = { ...structuredClone(v.records[0].record), physicianComment: "Server note", rowVersion: 2 };
  mergeHistory(v, [server]);
  assert.equal(v.records[0].record.physicianComment, "Physician note");
  acknowledge(v, operationId, { status: "applied", duplicate: false, record: server });
  mergeHistory(v, [{ ...server, rowVersion: 3, deletedAt: new Date().toISOString() }]);
  assert.ok(v.records[0].record.deletedAt);
  assert.equal(v.outbox.length, 0);
});

test("conflict keeps both versions and rebase is explicit, never a silent overwrite", () => {
  const v = state(); queueExamination(v, input, id, operationId, Date.now());
  const server: StoredExamination = { ...structuredClone(v.records[0].record), physicianComment: "Server note", rowVersion: 2 };
  acknowledge(v, operationId, { status: "conflict", record: server });
  assert.equal(v.records[0].state, "conflict");
  assert.equal(v.records[0].record.physicianComment, "Physician note");
  assert.equal(v.records[0].serverRecord?.physicianComment, "Server note");
  resolveConflict(v, id, "local", "66666666-6666-4666-8666-666666666666", Date.now());
  assert.equal(v.outbox[0].expectedVersion, 2);
  assert.equal(v.outbox[0].input?.physicianComment, "Physician note");
  assert.equal(v.resolvedConflicts[0].server.physicianComment, "Server note");
  assert.equal(v.resolvedConflicts[0].local.physicianComment, "Physician note");
});

test("foreign history and mismatched acknowledgements are rejected", () => {
  const v = state(); queueExamination(v, input, id, operationId, Date.now());
  const foreign = { ...v.records[0].record, organizationId: "other" };
  assert.throws(() => mergeHistory(v, [foreign]), /INVALID_SYNC_RESPONSE/);
  assert.throws(() => acknowledge(v, operationId, { status: "applied", duplicate: false, record: foreign }), /INVALID_SYNC_RESPONSE/);
  assert.equal(v.outbox.length, 1);
});

test("edit uses version from opening the form, even if background download is newer", () => {
  const v = state(); queueExamination(v, input, id, operationId, Date.now());
  const server = { ...v.records[0].record, rowVersion: 3 };
  acknowledge(v, operationId, { status: "applied", record: server, duplicate: false });
  queueExamination(v, input, id, "77777777-7777-4777-8777-777777777777", Date.now(), 1);
  assert.equal(v.outbox[0].expectedVersion, 1);
  queueExamination(v, { ...input, physicianComment: "Second unsent correction" }, id, operationId, Date.now(), 3);
  assert.equal(v.outbox[0].expectedVersion, 1, "an unsent correction must retain the original conflict base");
  assert.throws(() => queueDeletion(v, id, operationId, Date.now()), /RECORD_PENDING/);
});

test("unsent local examination can be corrected without generating a second create", () => {
  const v = state(); queueExamination(v, input, id, operationId, Date.now());
  const examinedAt = v.records[0].record.examinedAt;
  queueExamination(v, { ...input, physicianComment: "Corrected offline note" }, id, "88888888-8888-4888-8888-888888888888", Date.now(), 0);
  assert.equal(v.outbox.length, 1);
  assert.equal(v.outbox[0].kind, "create");
  assert.equal(v.outbox[0].expectedVersion, 0);
  assert.equal(v.outbox[0].input?.physicianComment, "Corrected offline note");
  assert.equal(v.records[0].record.examinedAt, examinedAt);
  v.outbox[0].attempted = true;
  assert.throws(() => queueExamination(v, input, id, operationId, Date.now()), /RECORD_PENDING/);
  assert.equal(v.outbox[0].input?.physicianComment, "Corrected offline note");
});
