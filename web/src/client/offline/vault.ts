import { deriveVaultKey, encryptVault, decryptVault, encodeBytes, type EncryptedVaultEnvelope } from "./crypto.ts";
import { accessAllowed, decodeGrant, type OfflineVault, type OfflineGrant } from "../../domain/offline/types.ts";
import { retainLocalCopies } from "../../domain/offline/maintenance.ts";

const DATABASE = "anafix-offline-v1";
const STORE = "encrypted-vault";
async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("STORAGE_BLOCKED"));
  });
}
async function load(): Promise<EncryptedVaultEnvelope | undefined> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, "readonly");
      const request = transaction.objectStore(STORE).get("current");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}
async function store(value: EncryptedVaultEnvelope | null): Promise<void> {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE, "readwrite");
      if (value) transaction.objectStore(STORE).put(value, "current");
      else transaction.objectStore(STORE).delete("current");
      // Resolve only after durable transaction commit, not the put request.
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error ?? new Error("STORAGE_FAILED"));
      transaction.onerror = () => reject(transaction.error);
    });
  } finally { db.close(); }
}
async function exclusive<T>(task: () => Promise<T>): Promise<T> {
  if (!globalThis.navigator?.locks) return Promise.reject(new Error("UNSUPPORTED_BROWSER"));
  return await navigator.locks.request("anafix-offline-vault", task);
}
function validate(value: OfflineVault): void {
  value.drafts ??= []; value.exportEvents ??= [];
  if (!Array.isArray(value.drafts) || !Array.isArray(value.exportEvents)) throw new Error("INVALID_VAULT");
  if (value.version !== 1 || !Array.isArray(value.records) || !Array.isArray(value.outbox) || !Array.isArray(value.resolvedConflicts) || !Number.isFinite(value.lastSeen)) throw new Error("INVALID_VAULT");
  const grant = decodeGrant(value.grant);
  if (grant.deviceId !== value.access.deviceId || grant.principal.id !== value.access.principal.id || grant.principal.organizationId !== value.access.principal.organizationId || grant.issuedAt !== value.access.issuedAt || grant.expiresAt !== value.access.expiresAt || grant.localRetentionDays !== value.access.localRetentionDays || grant.principal.credentialVersion !== value.access.principal.credentialVersion) throw new Error("INVALID_VAULT");
}

/** Key lives only in this in-memory object. IndexedDB contains ciphertext, never PHI or passwords. */
export class EncryptedOfflineVault {
  private key: CryptoKey | null = null;
  private deviceId: string | null = null;
  static exists(): Promise<boolean> { return load().then(Boolean); }
  lock(): void { this.key = null; this.deviceId = null; }
  async create(passphrase: string, grant: string, access: OfflineGrant): Promise<OfflineVault> {
    return exclusive(async () => {
      if (await load()) throw new Error("VAULT_EXISTS");
      const salt = encodeBytes(crypto.getRandomValues(new Uint8Array(16)));
      const key = await deriveVaultKey(passphrase, salt);
      const value: OfflineVault = { version: 1, grant, access, lastSeen: access.issuedAt, records: [], outbox: [], resolvedConflicts: [] };
      validate(value);
      if (!accessAllowed(value)) throw new Error("ACCESS_EXPIRED");
      await store(await encryptVault(value, key, salt));
      this.key = key; this.deviceId = access.deviceId;
      return value;
    });
  }
  async unlock(passphrase: string, allowOnlineRecovery = false): Promise<OfflineVault> {
    return exclusive(async () => {
      const envelope = await load();
      if (!envelope) throw new Error("VAULT_NOT_FOUND");
      const key = await deriveVaultKey(passphrase, envelope.salt);
      let value: OfflineVault;
      try { value = await decryptVault<OfflineVault>(envelope, key); validate(value); } catch { throw new Error("WRONG_PASSPHRASE_OR_DAMAGED_VAULT"); }
      if (!allowOnlineRecovery && !accessAllowed(value)) throw new Error("ACCESS_EXPIRED");
      if (!allowOnlineRecovery) {
        retainLocalCopies(value, Date.now());
        value.lastSeen = Math.max(value.lastSeen, Date.now());
        await store(await encryptVault(value, key, envelope.salt));
      }
      this.key = key; this.deviceId = value.access.deviceId;
      return value;
    });
  }
  async read(allowOnlineRecovery = false): Promise<OfflineVault> {
    const key = this.key;
    if (!key) throw new Error("VAULT_LOCKED");
    const envelope = await load();
    if (!envelope) throw new Error("VAULT_NOT_FOUND");
    const value = await decryptVault<OfflineVault>(envelope, key);
    validate(value);
    if (value.access.deviceId !== this.deviceId) { this.lock(); throw new Error("VAULT_CHANGED"); }
    if (!allowOnlineRecovery && !accessAllowed(value)) throw new Error("ACCESS_EXPIRED");
    if (!allowOnlineRecovery) retainLocalCopies(value, Date.now());
    return value;
  }
  async mutate(task: (value: OfflineVault) => void, recovery = false): Promise<OfflineVault> {
    return exclusive(async () => {
      const value = await this.read(recovery);
      const envelope = (await load())!;
      task(value);
      retainLocalCopies(value, Date.now());
      validate(value);
      value.lastSeen = Math.max(value.lastSeen, Date.now());
      await store(await encryptVault(value, this.key!, envelope.salt));
      return value;
    });
  }
  /** Explicit hospital-computer reset; never discard unsynchronized data. */
  async clear(): Promise<void> {
    await exclusive(async () => {
      const value = await this.read(true);
      if (value.outbox.length || value.records.some((r) => r.state === "conflict") || value.drafts?.length || value.exportEvents?.length || value.resolvedConflicts.some(row => row.conflictId && !row.reportedAt)) throw new Error("UNSYNCED_DATA");
      await store(null);
      this.lock();
    });
  }
}
