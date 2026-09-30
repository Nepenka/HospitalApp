import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SessionUser } from "@/server/auth/types";
import type { ExaminationSummary, StoredExamination } from "@/domain/examinations/types";
import { paginateExaminations, type ExaminationHistoryPage, type ExaminationHistoryQuery } from "@/domain/examinations/history-query";
export type { ExaminationHistoryPage, ExaminationHistoryQuery } from "@/domain/examinations/history-query";

interface EncryptedEnvelope {
  version: 1;
  iv: string;
  tag: string;
  ciphertext: string;
}

const dataDirectory = path.join(process.cwd(), ".data");
const storePath = process.env.EXAMINATION_STORE_PATH || path.join(dataDirectory, "examinations.enc");
let mutationQueue: Promise<void> = Promise.resolve();

function encryptionKey(): Buffer {
  const secret = process.env.EXAMINATION_DATA_KEY;
  if (secret && secret.length >= 32) return createHash("sha256").update(secret).digest();
  if (process.env.NODE_ENV !== "production") {
    return createHash("sha256").update("development-examination-key-change-before-deploy-2026").digest();
  }
  throw new Error("EXAMINATION_DATA_KEY must contain at least 32 characters");
}

function encrypt(records: StoredExamination[]): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(records), "utf8"), cipher.final()]);
  const envelope: EncryptedEnvelope = {
    version: 1,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
  return JSON.stringify(envelope);
}

function decrypt(raw: string): StoredExamination[] {
  const envelope = JSON.parse(raw) as EncryptedEnvelope;
  if (envelope.version !== 1 || !envelope.iv || !envelope.tag || !envelope.ciphertext) {
    throw new Error("Unsupported examination store format");
  }
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(envelope.iv, "base64"));
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
  const parsed: unknown = JSON.parse(plaintext);
  if (!Array.isArray(parsed)) throw new Error("Invalid examination store payload");
  return parsed as StoredExamination[];
}

async function readAll(): Promise<StoredExamination[]> {
  try {
    return decrypt(await readFile(/* turbopackIgnore: true */ storePath, "utf8")).map((record) => ({
      ...record,
      updatedAt: record.updatedAt ?? record.createdAt,
      updatedBy: record.updatedBy ?? record.createdBy,
      rowVersion: record.rowVersion ?? 1,
      deletedAt: record.deletedAt ?? null,
      deletedBy: record.deletedBy ?? null,
      catalogVersion: record.catalogVersion ?? "legacy-flat-2026.09.30",
    }));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function writeAll(records: StoredExamination[]): Promise<void> {
  await mkdir(path.dirname(storePath), { recursive: true });
  const temporaryPath = `${storePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporaryPath, encrypt(records), { encoding: "utf8", mode: 0o600 });
  await rename(temporaryPath, storePath);
}

function canAccess(record: StoredExamination, user: SessionUser): boolean {
  if (user.role !== "clinician" && user.role !== "organization_owner") return false;
  return Boolean(user.organizationId && record.organizationId === user.organizationId);
}

export function createExamination(record: StoredExamination): Promise<void> {
  const operation = mutationQueue.then(async () => {
    const records = await readAll();
    if (records.some((item) => item.id === record.id)) throw new Error("Duplicate examination id");
    records.push(record);
    await writeAll(records);
  });
  mutationQueue = operation.catch(() => undefined);
  return operation;
}

export async function listExaminations(user: SessionUser): Promise<ExaminationSummary[]> {
  const records = (await readAll()).filter((record) => !record.deletedAt && canAccess(record, user));
  return records
    .sort((left, right) => right.examinedAt.localeCompare(left.examinedAt))
    .map((record) => ({
      id: record.id,
      patientName: record.patient.fullName,
      examinedAt: record.examinedAt,
      probableAllergen: record.probableAllergen,
      severityGrade: record.severity.grade,
      diagnosis: record.conclusion.text,
      anaphylaxisConfirmed: record.conclusion.anyConfirmed,
    }));
}

export async function searchExaminations(user: SessionUser, query: ExaminationHistoryQuery): Promise<ExaminationHistoryPage> {
  const accessible = (await readAll()).filter((record) => !record.deletedAt && canAccess(record, user));
  return paginateExaminations(accessible.map((record) => ({
      id: record.id,
      patientName: record.patient.fullName,
      examinedAt: record.examinedAt,
      probableAllergen: record.probableAllergen,
      severityGrade: record.severity.grade,
      diagnosis: record.conclusion.text,
      anaphylaxisConfirmed: record.conclusion.anyConfirmed,
    })), query);
}

export async function getExamination(id: string, user: SessionUser): Promise<StoredExamination | null> {
  const record = (await readAll()).find((item) => item.id === id);
  return record && !record.deletedAt && canAccess(record, user) ? record : null;
}

export function updateExamination(
  id: string,
  expectedVersion: number,
  user: SessionUser,
  replacement: StoredExamination,
): Promise<StoredExamination> {
  const operation = mutationQueue.then(async () => {
    const records = await readAll();
    const index = records.findIndex((item) => item.id === id);
    const current = records[index];
    if (!current || current.deletedAt || !canAccess(current, user)) throw new Error("EXAMINATION_NOT_FOUND");
    if (current.rowVersion !== expectedVersion) throw new Error("EXAMINATION_CONFLICT");
    records[index] = replacement;
    await writeAll(records);
    return replacement;
  });
  mutationQueue = operation.then(() => undefined, () => undefined);
  return operation;
}

export function softDeleteExamination(id: string, user: SessionUser): Promise<void> {
  const operation = mutationQueue.then(async () => {
    const records = await readAll();
    const record = records.find((item) => item.id === id);
    if (!record || record.deletedAt || !canAccess(record, user)) throw new Error("EXAMINATION_NOT_FOUND");
    const now = new Date().toISOString();
    record.deletedAt = now;
    record.deletedBy = user.id;
    record.updatedAt = now;
    record.updatedBy = user.id;
    record.rowVersion += 1;
    await writeAll(records);
  });
  mutationQueue = operation.catch(() => undefined);
  return operation;
}
