import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SessionUser, UserRole } from "@/server/auth/types";
import { DEFAULT_DELETED_RECORD_RETENTION_YEARS, validRetentionYears } from "@/domain/examinations/retention";
import { emptyLicense, validateLicense, licenseAllowsClinicalAccess, type OrganizationLicense } from "@/domain/administration/license";
import type { SessionPayload } from "@/server/auth/types";
import { usesPostgres, pgTransaction } from "@/server/database/postgres";
import { readPgIdentity, writePgIdentity,pgIdentityItem,pgIdentityTenantRows } from "@/server/database/identity";

export type IdentityStatus = "active" | "suspended";
export type BillingCurrency = "USD" | "BYN" | "RUB";
export type BillingEntryType = "charge" | "payment";

export interface OrganizationRecord {
  id: string;
  name: string;
  code: string;
  status: IdentityStatus;
  createdAt: string;
  archivedAt?: string | null;
  archivedBy?: string | null;
  deletedRecordRetentionYears: number;
  license: OrganizationLicense;
  licenseHistory?: Array<{ at: string; actorId: string; reason: string; previous: OrganizationLicense; license: OrganizationLicense }>;
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
  credentialVersion?: number;
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
  voidReason?: string | null;
}

export interface OnlineSessionRecord { id: string; userId: string; organizationId: string | null; role: UserRole; createdAt: string; expiresAt: string; revokedAt: string | null; mfaVerifiedAt?: number }
export interface OfflineDeviceRecord { id: string; accountId: string; organizationId: string; status: IdentityStatus; lastGrantedAt: string; expiresAt: string }
interface IdentityDatabase { version: 1; organizations: OrganizationRecord[]; accounts: AccountRecord[]; billingEntries: BillingEntryRecord[]; sessions: OnlineSessionRecord[]; devices: OfflineDeviceRecord[] }
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
  return normalizeDatabase(JSON.parse(plaintext) as IdentityDatabase);
}

function normalizeDatabase(database: IdentityDatabase): IdentityDatabase {
  if (database.version !== 1 || !Array.isArray(database.organizations) || !Array.isArray(database.accounts)) throw new Error("Invalid identity store payload");
  if (!Array.isArray(database.billingEntries)) database.billingEntries = [];
  if (!Array.isArray(database.sessions)) database.sessions = [];
  if (!Array.isArray(database.devices)) database.devices = [];
  database.organizations = database.organizations.map((organization) => ({ ...organization, license: { ...emptyLicense, ...organization.license }, deletedRecordRetentionYears: validRetentionYears(organization.deletedRecordRetentionYears) ? organization.deletedRecordRetentionYears : DEFAULT_DELETED_RECORD_RETENTION_YEARS }));
  return database;
}

async function readDatabase(): Promise<IdentityDatabase> {
  if (usesPostgres()) return normalizeDatabase(await readPgIdentity<IdentityDatabase>());
  try { return decrypt(await readFile(/* turbopackIgnore: true */ storePath, "utf8")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return { version: 1, organizations: [], accounts: [], billingEntries: [], sessions: [], devices: [] }; throw error; }
}

async function writeDatabase(database: IdentityDatabase): Promise<void> {
  if (usesPostgres()) return writePgIdentity(database);
  await mkdir(path.dirname(storePath), { recursive: true });
  const temporaryPath = `${storePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporaryPath, encrypt(database), { encoding: "utf8", mode: 0o600 });
  await rename(temporaryPath, storePath);
}

function mutate<T>(operation: (database: IdentityDatabase) => Promise<T> | T): Promise<T> {
  if (usesPostgres()) return pgTransaction({ kind: "identity" }, async () => { const database = await readDatabase(); const value = await operation(database); await writeDatabase(database); return value; });
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
    if (account.role === "clinician" && !licenseAllowsClinicalAccess(organization.license)) return;
    account.lastLoginAt = new Date().toISOString();
    authenticated = { id: account.id, organizationId: account.organizationId, displayName: account.displayName, role: account.role, mustChangePassword: account.mustChangePassword !== false, credentialVersion: account.credentialVersion ?? 1 };
  });
  return authenticated;
}

export async function createOrganizationWithOwner(name: string, ownerDisplayName: string): Promise<{ organization: OrganizationRecord; credentials: GeneratedCredentials }> {
  return mutate(async (database) => {
    const normalizedName = name.trim().replace(/\s+/g, " ");
    if (database.organizations.some((organization) => organization.name.toLocaleLowerCase("ru-RU") === normalizedName.toLocaleLowerCase("ru-RU"))) throw new Error("ORGANIZATION_EXISTS");
    const now = new Date().toISOString();
    const organization: OrganizationRecord = { id: randomUUID(), name: normalizedName, code: `org-${randomToken(10)}`, status: "active", createdAt: now, deletedRecordRetentionYears: DEFAULT_DELETED_RECORD_RETENTION_YEARS, license: { ...emptyLicense } };
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
    if (organization.license.maxClinicians !== null && database.accounts.filter((a) => a.organizationId === organizationId && a.role === "clinician" && a.status === "active").length >= organization.license.maxClinicians) throw new Error("CLINICIAN_LIMIT");
    const login = await uniqueLogin(database, "doctor");
    const password = generatePassword();
    const account: AccountRecord = { id: randomUUID(), organizationId, login, displayName: displayName.trim().replace(/\s+/g, " "), role: "clinician", status: "active", passwordHash: hashPassword(password), createdAt: new Date().toISOString(), lastLoginAt: null, mustChangePassword: true };
    database.accounts.push(account);
    return { accountId: account.id, login, password };
  });
}

export async function resetAccountPassword(accountId: string, organizationId?: string, expectedRole?: AccountRecord["role"]): Promise<(GeneratedCredentials & { organizationId: string }) | null> {
  return mutate((database) => {
    const account = database.accounts.find((item) => item.id === accountId && (!organizationId || item.organizationId === organizationId) && (!expectedRole || item.role === expectedRole));
    if (!account) return null;
    const password = generatePassword();
    account.passwordHash = hashPassword(password);
    account.mustChangePassword = true;
    account.credentialVersion = (account.credentialVersion ?? 1) + 1;
    database.sessions.filter(s => s.userId === account.id && !s.revokedAt).forEach(s => { s.revokedAt = new Date().toISOString(); });
    return { accountId: account.id, login: account.login, password, organizationId: account.organizationId };
  });
}

export async function listOrganizations(): Promise<Array<OrganizationRecord & { ownerAccountId: string | null; ownerLogin: string; users: number; activeUsers: number; lastActivityAt: string | null }>> {
  const database = await readDatabase();
  return database.organizations.map((organization) => {
    const accounts = database.accounts.filter((account) => account.organizationId === organization.id);
    const owner = accounts.find((account) => account.role === "organization_owner");
    return { ...organization, ownerAccountId: owner?.id ?? null, ownerLogin: owner?.login ?? "—", users: accounts.length, activeUsers: accounts.filter((account) => account.status === "active" && organization.status === "active" && (account.role !== "clinician" || licenseAllowsClinicalAccess(organization.license))).length, lastActivityAt: accounts.map((account) => account.lastLoginAt).filter((value): value is string => Boolean(value)).sort().at(-1) ?? null };
  }).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function listOrganizationMembers(organizationId: string): Promise<Array<Omit<AccountRecord, "passwordHash">>> {
  if(usesPostgres())return (await pgIdentityTenantRows<AccountRecord>("accounts",organizationId)).map(({passwordHash,...account})=>{void passwordHash;return account;}).sort((a,b)=>a.displayName.localeCompare(b.displayName,"ru"));
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
    account.credentialVersion = (account.credentialVersion ?? 1) + 1;
    database.sessions.filter(s => s.userId === account.id && !s.revokedAt).forEach(s => { s.revokedAt = new Date().toISOString(); });
    return { id: account.id, organizationId: account.organizationId, displayName: account.displayName, role: account.role, mustChangePassword: false, credentialVersion: account.credentialVersion };
  });
}

export async function getOrganization(organizationId: string): Promise<OrganizationRecord | null> {
  if(usesPostgres()) {const row=await pgIdentityItem<OrganizationRecord>("organizations",organizationId);return row?normalizeDatabase({version:1,organizations:[row],accounts:[],sessions:[],devices:[],billingEntries:[]}).organizations[0]:null;}
  const database = await readDatabase();
  return database.organizations.find((item) => item.id === organizationId) ?? null;
}

/** Online and offline access use the same live account, role and credential checks. */
export async function activeSessionUser(user: SessionUser): Promise<SessionUser | null> {
  if (user.role === "platform_admin") return user.organizationId === null && user.id === "platform-admin" ? user : null;
  const database = usesPostgres()?null:await readDatabase();
  const account = usesPostgres()?await pgIdentityItem<AccountRecord>("accounts",user.id):database!.accounts.find((a) => a.id === user.id && a.organizationId === user.organizationId);
  const organization = usesPostgres()?await getOrganization(user.organizationId??""):database!.organizations.find((o) => o.id === user.organizationId);
  if (!account || account.organizationId!==user.organizationId || !organization || account.status !== "active" || organization.status !== "active" || account.role !== user.role || (account.credentialVersion ?? 1) !== (user.credentialVersion ?? 1)) return null;
  if (account.role === "clinician" && !licenseAllowsClinicalAccess(organization.license)) return null;
  return { ...user, displayName: account.displayName, mustChangePassword: account.mustChangePassword !== false, credentialVersion: account.credentialVersion ?? 1 };
}
export async function activeOfflineUser(user: SessionUser): Promise<SessionUser | null> {
  const current = await activeSessionUser(user);
  return current?.role === "clinician" && !current.mustChangePassword ? current : null;
}

export async function setOrganizationRetention(organizationId: string, years: number): Promise<void> {
  if (!validRetentionYears(years)) throw new Error("INVALID_RETENTION");
  return mutate((database) => {
    const organization = database.organizations.find((item) => item.id === organizationId);
    if (!organization) throw new Error("ORGANIZATION_NOT_FOUND");
    organization.deletedRecordRetentionYears = years;
  });
}

export async function createBillingEntry(input: Omit<BillingEntryRecord, "id" | "createdAt" | "voidedAt" | "voidedBy">): Promise<BillingEntryRecord> {
  return mutate((database) => {
    if (!database.organizations.some((organization) => organization.id === input.organizationId)) throw new Error("ORGANIZATION_NOT_FOUND");
    const entry: BillingEntryRecord = { ...input, id: randomUUID(), createdAt: new Date().toISOString(), voidedAt: null, voidedBy: null };
    database.billingEntries.push(entry);
    return entry;
  });
}

export async function voidBillingEntry(entryId: string, organizationId: string, actorId: string, reason: string): Promise<BillingEntryRecord | null> {
  if (reason.trim().length < 3 || reason.length > 200) throw new Error("REASON_REQUIRED");
  return mutate((database) => {
    const entry = database.billingEntries.find((item) => item.id === entryId && item.organizationId === organizationId);
    if (!entry || entry.voidedAt) return null;
    entry.voidedAt = new Date().toISOString();
    entry.voidedBy = actorId;
    entry.voidReason = reason.trim();
    return entry;
  });
}

export async function updateLicense(organizationId: string, license: OrganizationLicense, actorId: string, reason: string): Promise<void> {
  validateLicense(license);
  if (reason.trim().length < 3 || reason.length > 200) throw new Error("REASON_REQUIRED");
  return mutate((database) => {
    const organization = database.organizations.find((o) => o.id === organizationId);
    if (!organization) throw new Error("ORGANIZATION_NOT_FOUND");
    if (organization.archivedAt) throw new Error("ORGANIZATION_ARCHIVED");
    if (license.maxClinicians !== null && database.accounts.filter(a => a.organizationId === organizationId && a.role === "clinician" && a.status === "active").length > license.maxClinicians) throw new Error("ACTIVE_CLINICIAN_LIMIT");
    organization.licenseHistory = [...(organization.licenseHistory ?? []), { at: new Date().toISOString(), actorId, reason: reason.trim(), previous: organization.license, license }];
    organization.license = license;
  });
}
export async function setOrganizationStatus(organizationId: string, status: IdentityStatus): Promise<void> {
  if (!["active", "suspended"].includes(status)) throw new Error("INVALID_STATUS");
  return mutate((database) => {
    const organization = database.organizations.find((o) => o.id === organizationId);
    if (!organization) throw new Error("ORGANIZATION_NOT_FOUND");
    if (organization.archivedAt) throw new Error("ORGANIZATION_ARCHIVED");
    organization.status = status;
    if (status === "suspended") {
      database.accounts.filter((a) => a.organizationId === organizationId).forEach((a) => { a.credentialVersion = (a.credentialVersion ?? 1) + 1; });
      database.sessions.filter((s) => s.organizationId === organizationId).forEach((s) => { s.revokedAt = new Date().toISOString(); });
    }
  });
}
export async function renameOrganization(id:string,name:string):Promise<void> {
  const normalized=name.trim().replace(/\s+/g," ");
  if(normalized.length<2||normalized.length>200)throw new Error("INVALID_NAME");
  return mutate(database=>{
    const organization=database.organizations.find(o=>o.id===id);
    if(!organization)throw new Error("ORGANIZATION_NOT_FOUND");
    if(database.organizations.some(o=>o.id!==id&&o.name.toLocaleLowerCase("ru-RU")===normalized.toLocaleLowerCase("ru-RU")))throw new Error("ORGANIZATION_EXISTS");
    organization.name=normalized;
  });
}
export async function archiveOrganization(id:string,actorId:string):Promise<void> {
  return mutate(database=>{
    const organization=database.organizations.find(o=>o.id===id);
    if(!organization)throw new Error("ORGANIZATION_NOT_FOUND");
    if(organization.archivedAt)return;
    const now=new Date().toISOString();
    organization.archivedAt=now;organization.archivedBy=actorId;organization.status="suspended";
    const license={...organization.license,offlineAllowed:false};
    organization.licenseHistory=[...(organization.licenseHistory??[]),{at:now,actorId,reason:"Organization archived / Организация архивирована",previous:organization.license,license}];
    organization.license=license;
    database.accounts.filter(a=>a.organizationId===id).forEach(a=>{a.credentialVersion=(a.credentialVersion??1)+1;});
    database.sessions.filter(s=>s.organizationId===id&&!s.revokedAt).forEach(s=>{s.revokedAt=now;});
    database.devices.filter(d=>d.organizationId===id).forEach(d=>{d.status="suspended";});
  });
}
export async function manageAccount(accountId: string, organizationId: string, operation: "rename" | "suspend" | "activate" | "revoke", displayName?: string, clinicianOnly = true): Promise<void> {
  return mutate((database) => {
    const account = database.accounts.find((a) => a.id === accountId && a.organizationId === organizationId && (!clinicianOnly || a.role === "clinician"));
    const organization = database.organizations.find((o) => o.id === organizationId);
    if (!account || !organization) throw new Error("ACCOUNT_NOT_FOUND");
    if (operation === "rename") {
      const name = displayName?.trim().replace(/\s+/g, " ") ?? "";
      if (name.length < 3 || name.length > 160) throw new Error("INVALID_NAME");
      account.displayName = name;
    } else if (operation === "activate") {
      if (account.role === "clinician" && account.status !== "active" && organization.license.maxClinicians !== null && database.accounts.filter((a) => a.organizationId === organizationId && a.role === "clinician" && a.status === "active").length >= organization.license.maxClinicians) throw new Error("CLINICIAN_LIMIT");
      account.status = "active";
    } else if (operation === "suspend" || operation === "revoke") {
      if (operation === "suspend") account.status = "suspended";
      account.credentialVersion = (account.credentialVersion ?? 1) + 1;
      database.sessions.filter((s) => s.userId === accountId).forEach((s) => { s.revokedAt = new Date().toISOString(); });
    } else throw new Error("INVALID_OPERATION");
  });
}
export async function registerOnlineSession(payload: SessionPayload): Promise<void> {
  return mutate((database) => {
    database.sessions = database.sessions.filter((s) => Date.parse(s.expiresAt) > Date.now());
    database.sessions.push({ id: payload.sessionId, userId: payload.user.id, organizationId: payload.user.organizationId, role: payload.user.role, createdAt: new Date(payload.issuedAt * 1000).toISOString(), expiresAt: new Date(payload.expiresAt * 1000).toISOString(), revokedAt: null, ...(payload.mfaVerifiedAt ? {mfaVerifiedAt:payload.mfaVerifiedAt} : {}) });
  });
}
export async function onlineSessionIsActive(payload: SessionPayload): Promise<boolean> {
  const database = usesPostgres()?{sessions:[await pgIdentityItem<OnlineSessionRecord>("sessions",payload.sessionId)].filter((s):s is OnlineSessionRecord=>Boolean(s))}:await readDatabase();
  return database.sessions.some((s) => s.id === payload.sessionId && s.userId === payload.user.id && s.role === payload.user.role && s.organizationId === payload.user.organizationId && s.mfaVerifiedAt === payload.mfaVerifiedAt && !s.revokedAt && Date.parse(s.expiresAt) > Date.now());
}
export async function listOnlineSessions(organizationId?: string): Promise<Array<OnlineSessionRecord & { displayName: string }>> {
  const database = await readDatabase();
  return database.sessions.filter((s) => {
    if (s.revokedAt || Date.parse(s.expiresAt) <= Date.now() || (organizationId && s.organizationId !== organizationId)) return false;
    if (s.role === "platform_admin") return true;
    const account = database.accounts.find(a => a.id === s.userId && a.status === "active");
    const organization = database.organizations.find(o => o.id === s.organizationId && o.status === "active");
    return Boolean(account && organization && (account.role !== "clinician" || licenseAllowsClinicalAccess(organization.license)));
  }).map((s) => ({ ...s, displayName: s.role === "platform_admin" ? "Platform administrator" : database.accounts.find((a) => a.id === s.userId)?.displayName ?? s.userId })).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export async function revokeOnlineSession(id: string, organizationId?: string): Promise<boolean> {
  return mutate((database) => {
    const session = database.sessions.find((s) => s.id === id && (!organizationId || s.organizationId === organizationId) && !s.revokedAt);
    if (!session) return false;
    session.revokedAt = new Date().toISOString(); return true;
  });
}
export async function registerOfflineDevice(accountId: string, organizationId: string, id: string, expiresAt: number): Promise<void> {
  return mutate((database) => {
    const device = database.devices.find((d) => d.id === id && d.accountId === accountId && d.organizationId === organizationId);
    if (device?.status === "suspended") throw new Error("DEVICE_BLOCKED");
    const record: OfflineDeviceRecord = { id, accountId, organizationId, status: "active", lastGrantedAt: new Date().toISOString(), expiresAt: new Date(expiresAt).toISOString() };
    if (device) Object.assign(device, record); else database.devices.push(record);
  });
}
export async function offlineDeviceIsActive(accountId: string, organizationId: string, id: string): Promise<boolean> {
  return (await readDatabase()).devices.some((d) => d.id === id && d.accountId === accountId && d.organizationId === organizationId && d.status === "active");
}
export async function listOfflineDevices(organizationId?: string): Promise<Array<OfflineDeviceRecord & { displayName: string }>> {
  const database = await readDatabase();
  return database.devices.filter((d) => !organizationId || d.organizationId === organizationId).map((d) => ({ ...d, displayName: database.accounts.find((a) => a.id === d.accountId)?.displayName ?? d.accountId }));
}
export async function setOfflineDeviceStatus(id: string, accountId: string, organizationId: string, status: IdentityStatus): Promise<void> {
  if (!["active", "suspended"].includes(status)) throw new Error("INVALID_STATUS");
  return mutate((database) => {
    const device = database.devices.find((d) => d.id === id && d.accountId === accountId && d.organizationId === organizationId);
    if (!device) throw new Error("DEVICE_NOT_FOUND");
    device.status = status;
  });
}

export async function listBillingEntries(organizationId?: string): Promise<BillingEntryRecord[]> {
  const database = usesPostgres()&&organizationId?{billingEntries:await pgIdentityTenantRows<BillingEntryRecord>("billingEntries",organizationId)}:await readDatabase();
  return database.billingEntries
    .filter((entry) => !organizationId || entry.organizationId === organizationId)
    .sort((left, right) => right.effectiveDate.localeCompare(left.effectiveDate) || right.createdAt.localeCompare(left.createdAt));
}
