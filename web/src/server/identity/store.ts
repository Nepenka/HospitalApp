import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SessionUser, UserRole } from "@/server/auth/types";

export type IdentityStatus = "active" | "suspended";
export type BillingCurrency = "USD" | "BYN" | "RUB";
export type BillingEntryType = "charge" | "payment";

export interface OrganizationRecord {
  id: string;
  name: string;
  code: string;
  status: IdentityStatus;
  createdAt: string;
}

export interface AccountRecord {
  id: string;
  organizationId: string;
  login: string;
  displayName: string;
  role: Exclude<UserRole, "platform_admin">;
  status: IdentityStatus;
  passwordHash: string;
  createdAt: string;
  lastLoginAt: string | null;
  mustChangePassword: boolean;
}

export interface BillingEntryRecord {
  id: string;
  organizationId: string;
  type: BillingEntryType;
  currency: BillingCurrency;
  amountMinor: number;
  effectiveDate: string;
  note: string | null;
  createdAt: string;
  createdBy: string;
  voidedAt: string | null;
  voidedBy: string | null;
}

interface IdentityDatabase { version: 1; organizations: OrganizationRecord[]; accounts: AccountRecord[]; billingEntries: BillingEntryRecord[] }
interface EncryptedEnvelope { version: 1; iv: string; tag: string; ciphertext: string }
export interface GeneratedCredentials { accountId: string; login: string; password: string }

const storePath = process.env.IDENTITY_STORE_PATH || path.join(process.cwd(), ".data", "identities.enc");
let mutationQueue: Promise<void> = Promise.resolve();

function encryptionKey(): Buffer {
  const secret = process.env.IDENTITY_DATA_KEY;
  if (secret && secret.length >= 32) return createHash("sha256").update(secret).digest();
  if (process.env.NODE_ENV !== "production") return createHash("sha256").update("development-identity-key-change-before-deploy-2026").digest();
  throw new Error("IDENTITY_DATA_KEY must contain at least 32 characters");
}

function encrypt(database: IdentityDatabase): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(database), "utf8"), cipher.final()]);
  const envelope: EncryptedEnvelope = { version: 1, iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), ciphertext: ciphertext.toString("base64") };
  return JSON.stringify(envelope);
}

function decrypt(raw: string): IdentityDatabase {
  const envelope = JSON.parse(raw) as EncryptedEnvelope;
  if (envelope.version !== 1 || !envelope.iv || !envelope.tag || !envelope.ciphertext) throw new Error("Unsupported identity store format");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(envelope.iv, "base64"));
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, "base64")), decipher.final()]).toString("utf8");
  const database = JSON.parse(plaintext) as IdentityDatabase;
  if (database.version !== 1 || !Array.isArray(database.organizations) || !Array.isArray(database.accounts)) throw new Error("Invalid identity store payload");
  if (!Array.isArray(database.billingEntries)) database.billingEntries = [];
  return database;
}

async function readDatabase(): Promise<IdentityDatabase> {
  try { return decrypt(await readFile(/* turbopackIgnore: true */ storePath, "utf8")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return { version: 1, organizations: [], accounts: [], billingEntries: [] }; throw error; }
}

async function writeDatabase(database: IdentityDatabase): Promise<void> {
  await mkdir(path.dirname(storePath), { recursive: true });
  const temporaryPath = `${storePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporaryPath, encrypt(database), { encoding: "utf8", mode: 0o600 });
  await rename(temporaryPath, storePath);
}

function mutate<T>(operation: (database: IdentityDatabase) => Promise<T> | T): Promise<T> {
  const result = mutationQueue.then(async () => { const database = await readDatabase(); const value = await operation(database); await writeDatabase(database); return value; });
  mutationQueue = result.then(() => undefined, () => undefined);
  return result;
}

function normalizeLogin(login: string): string { return login.trim().toLowerCase(); }

function hashPassword(password: string): string {
  const salt = randomBytes(18).toString("base64url");
  return `scrypt$${salt}$${scryptSync(password, salt, 64).toString("base64url")}`;
}

function verifyPassword(password: string, encoded: string): boolean {
  const [scheme, salt, expected] = encoded.split("$");
  if (scheme !== "scrypt" || !salt || !expected) return false;
  const actual = scryptSync(password, salt, 64);
  const expectedBuffer = Buffer.from(expected, "base64url");
  return actual.length === expectedBuffer.length && timingSafeEqual(actual, expectedBuffer);
}

function randomToken(length: number): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  return Array.from(randomBytes(length), (byte) => alphabet[byte % alphabet.length]).join("");
}

function generatePassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%+-_";
  const all = upper + lower + digits + symbols;
  const required = [upper, lower, digits, symbols].map((set) => set[randomBytes(1)[0] % set.length]);
  const remaining = Array.from(randomBytes(16), (byte) => all[byte % all.length]);
  const characters = [...required, ...remaining];
  for (let index = characters.length - 1; index > 0; index -= 1) {
    const swapIndex = randomBytes(2).readUInt16BE(0) % (index + 1);
    [characters[index], characters[swapIndex]] = [characters[swapIndex], characters[index]];
  }
  return characters.join("");
}

async function uniqueLogin(database: IdentityDatabase, prefix: "org" | "doctor"): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = `${prefix}-${randomToken(8)}`;
    if (!database.accounts.some((account) => account.login === candidate)) return candidate;
  }
  throw new Error("Unable to generate unique login");
}

export async function authenticateAccount(login: string, password: string): Promise<SessionUser | null> {
  const normalized = normalizeLogin(login);
  let authenticated: SessionUser | null = null;
  await mutate((database) => {
    const account = database.accounts.find((item) => item.login === normalized);
    const organization = account && database.organizations.find((item) => item.id === account.organizationId);
    if (!account || !organization || account.status !== "active" || organization.status !== "active" || !verifyPassword(password, account.passwordHash)) return;
    account.lastLoginAt = new Date().toISOString();
    authenticated = { id: account.id, organizationId: account.organizationId, displayName: account.displayName, role: account.role, mustChangePassword: account.mustChangePassword !== false };
  });
  return authenticated;
}

export async function createOrganizationWithOwner(name: string, ownerDisplayName: string): Promise<{ organization: OrganizationRecord; credentials: GeneratedCredentials }> {
  return mutate(async (database) => {
    const normalizedName = name.trim().replace(/\s+/g, " ");
    if (database.organizations.some((organization) => organization.name.toLocaleLowerCase("ru-RU") === normalizedName.toLocaleLowerCase("ru-RU"))) throw new Error("ORGANIZATION_EXISTS");
    const now = new Date().toISOString();
    const organization: OrganizationRecord = { id: randomUUID(), name: normalizedName, code: `org-${randomToken(10)}`, status: "active", createdAt: now };
    const login = await uniqueLogin(database, "org");
    const password = generatePassword();
    const account: AccountRecord = { id: randomUUID(), organizationId: organization.id, login, displayName: ownerDisplayName.trim().replace(/\s+/g, " "), role: "organization_owner", status: "active", passwordHash: hashPassword(password), createdAt: now, lastLoginAt: null, mustChangePassword: true };
    database.organizations.push(organization);
    database.accounts.push(account);
    return { organization, credentials: { accountId: account.id, login, password } };
  });
}

export async function createOrganizationMember(organizationId: string, displayName: string): Promise<GeneratedCredentials> {
  return mutate(async (database) => {
    const organization = database.organizations.find((item) => item.id === organizationId && item.status === "active");
    if (!organization) throw new Error("ORGANIZATION_NOT_FOUND");
    const login = await uniqueLogin(database, "doctor");
    const password = generatePassword();
    const account: AccountRecord = { id: randomUUID(), organizationId, login, displayName: displayName.trim().replace(/\s+/g, " "), role: "clinician", status: "active", passwordHash: hashPassword(password), createdAt: new Date().toISOString(), lastLoginAt: null, mustChangePassword: true };
    database.accounts.push(account);
    return { accountId: account.id, login, password };
  });
}

export async function resetAccountPassword(accountId: string, organizationId?: string): Promise<GeneratedCredentials | null> {
  return mutate((database) => {
    const account = database.accounts.find((item) => item.id === accountId && (!organizationId || item.organizationId === organizationId));
    if (!account) return null;
    const password = generatePassword();
    account.passwordHash = hashPassword(password);
    account.mustChangePassword = true;
    return { accountId: account.id, login: account.login, password };
  });
}

export async function listOrganizations(): Promise<Array<OrganizationRecord & { ownerAccountId: string | null; ownerLogin: string; users: number; activeUsers: number; lastActivityAt: string | null }>> {
  const database = await readDatabase();
  return database.organizations.map((organization) => {
    const accounts = database.accounts.filter((account) => account.organizationId === organization.id);
    const owner = accounts.find((account) => account.role === "organization_owner");
    return { ...organization, ownerAccountId: owner?.id ?? null, ownerLogin: owner?.login ?? "—", users: accounts.length, activeUsers: accounts.filter((account) => account.status === "active").length, lastActivityAt: accounts.map((account) => account.lastLoginAt).filter((value): value is string => Boolean(value)).sort().at(-1) ?? null };
  }).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function listOrganizationMembers(organizationId: string): Promise<Array<Omit<AccountRecord, "passwordHash">>> {
  const database = await readDatabase();
  return database.accounts.filter((account) => account.organizationId === organizationId).map((account) => ({ id: account.id, organizationId: account.organizationId, login: account.login, displayName: account.displayName, role: account.role, status: account.status, createdAt: account.createdAt, lastLoginAt: account.lastLoginAt, mustChangePassword: account.mustChangePassword !== false })).sort((left, right) => left.displayName.localeCompare(right.displayName, "ru"));
}

export async function changeAccountPassword(accountId: string, password: string): Promise<SessionUser | null> {
  return mutate((database) => {
    const account = database.accounts.find((item) => item.id === accountId && item.status === "active");
    const organization = account && database.organizations.find((item) => item.id === account.organizationId && item.status === "active");
    if (!account || !organization) return null;
    account.passwordHash = hashPassword(password);
    account.mustChangePassword = false;
    return { id: account.id, organizationId: account.organizationId, displayName: account.displayName, role: account.role, mustChangePassword: false };
  });
}

export async function getOrganization(organizationId: string): Promise<OrganizationRecord | null> {
  const database = await readDatabase();
  return database.organizations.find((item) => item.id === organizationId) ?? null;
}

export async function createBillingEntry(input: Omit<BillingEntryRecord, "id" | "createdAt" | "voidedAt" | "voidedBy">): Promise<BillingEntryRecord> {
  return mutate((database) => {
    if (!database.organizations.some((organization) => organization.id === input.organizationId)) throw new Error("ORGANIZATION_NOT_FOUND");
    const entry: BillingEntryRecord = { ...input, id: randomUUID(), createdAt: new Date().toISOString(), voidedAt: null, voidedBy: null };
    database.billingEntries.push(entry);
    return entry;
  });
}

export async function voidBillingEntry(entryId: string, organizationId: string, actorId: string): Promise<BillingEntryRecord | null> {
  return mutate((database) => {
    const entry = database.billingEntries.find((item) => item.id === entryId && item.organizationId === organizationId);
    if (!entry || entry.voidedAt) return null;
    entry.voidedAt = new Date().toISOString();
    entry.voidedBy = actorId;
    return entry;
  });
}

export async function listBillingEntries(organizationId?: string): Promise<BillingEntryRecord[]> {
  const database = await readDatabase();
  return database.billingEntries
    .filter((entry) => !organizationId || entry.organizationId === organizationId)
    .sort((left, right) => right.effectiveDate.localeCompare(left.effectiveDate) || right.createdAt.localeCompare(left.createdAt));
}
