export interface EncryptedVaultEnvelope { version: 1; salt: string; iv: string; ciphertext: string }
const CONTEXT = new TextEncoder().encode("anafix-offline-vault-v1");
export const KEY_ITERATIONS = 600_000;
function bytes(value: Uint8Array): ArrayBuffer { return value.slice().buffer as ArrayBuffer; }
export const encodeBytes = (value: Uint8Array): string => btoa(Array.from(value, (b) => String.fromCharCode(b)).join(""));
export const decodeBytes = (value: string): Uint8Array => Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
export async function deriveVaultKey(passphrase: string, salt: string): Promise<CryptoKey> {
  if (passphrase.length < 16 || passphrase.length > 1024) throw new Error("PASSPHRASE_LENGTH");
  const material = await crypto.subtle.importKey("raw", bytes(new TextEncoder().encode(passphrase)), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt: bytes(decodeBytes(salt)), iterations: KEY_ITERATIONS, hash: "SHA-256" }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
export async function encryptVault<T>(value: T, key: CryptoKey, salt: string): Promise<EncryptedVaultEnvelope> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv: bytes(iv), additionalData: bytes(CONTEXT) }, key, bytes(new TextEncoder().encode(JSON.stringify(value))));
  return { version: 1, salt, iv: encodeBytes(iv), ciphertext: encodeBytes(new Uint8Array(ciphertext)) };
}
export async function decryptVault<T>(value: EncryptedVaultEnvelope, key: CryptoKey): Promise<T> {
  if (value.version !== 1 || decodeBytes(value.salt).length !== 16 || decodeBytes(value.iv).length !== 12) throw new Error("INVALID_VAULT");
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes(decodeBytes(value.iv)), additionalData: bytes(CONTEXT) }, key, bytes(decodeBytes(value.ciphertext)));
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}
