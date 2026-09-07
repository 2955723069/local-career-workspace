import { STORE_NAMES, type StoreName } from "../db/schema";
import type { StoredFile } from "../db/types";

export const BACKUP_FORMAT = "local-career-workspace-backup" as const;
export const BACKUP_VERSION = 1 as const;
export type BackupKind = "light" | "full";

export interface EncodedOriginalFile {
  id: string;
  createdAt: string;
  updatedAt: string;
  ownerType: StoredFile["ownerType"];
  ownerId: string;
  fileName: string;
  fileType: StoredFile["fileType"];
  mimeType: string;
  size: number;
  bytes: string;
}

export type BackupStores = Partial<Record<Exclude<StoreName, "sensitiveSettings" | "originalFiles">, unknown[]>> & {
  originalFiles?: never;
};

export interface BackupPayload {
  kind: BackupKind;
  exportedAt: string;
  stores: BackupStores;
  originalFiles?: EncodedOriginalFile[];
}

export interface BackupEnvelope {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  kind: BackupKind;
  salt: string;
  iv: string;
  kdf: { name: "PBKDF2"; hash: "SHA-256"; iterations: number; salt: string };
  cipher: { name: "AES-GCM"; iv: string; tagLength: 128 };
  ciphertext: string;
}

const ENVELOPE_FIELDS = new Set([
  "format",
  "version",
  "kind",
  "salt",
  "iv",
  "kdf",
  "cipher",
  "ciphertext",
]);
const PAYLOAD_FIELDS = new Set(["kind", "exportedAt", "stores", "originalFiles"]);
const SENSITIVE_FIELD_NAMES = new Set([
  "apiKey",
  "apiUrl",
  "organizationId",
  "customHeaders",
  "sensitiveSettings",
  "notificationAuthorization",
  "sendPreview",
  "sendingPreview",
  "temporaryAiContext",
  "temporaryAIContext",
]);

const ALLOWED_STORES = Object.values(STORE_NAMES).filter(
  (name): name is Exclude<StoreName, "sensitiveSettings" | "originalFiles"> =>
    name !== STORE_NAMES.sensitiveSettings && name !== STORE_NAMES.originalFiles,
);

export function allowedBackupStores(): readonly Exclude<StoreName, "sensitiveSettings" | "originalFiles">[] {
  return ALLOWED_STORES;
}

function isCanonicalBase64(value: unknown, allowEmpty = false): value is string {
  if (typeof value !== "string" || (!allowEmpty && value.length === 0) || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) return false;
  try {
    return btoa(atob(value)) === value;
  } catch {
    return false;
  }
}

function decodedByteLength(value: string): number {
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  return (value.length * 3) / 4 - padding;
}

function isIso(value: unknown): value is string {
  return typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    Number.isFinite(Date.parse(value));
}

function hasOnlyFields(value: Record<string, unknown>, fields: Set<string>, label: string): void {
  for (const field of Object.keys(value)) {
    if (!fields.has(field)) throw new Error(`Invalid ${label} field`);
  }
}

function validateJsonValue(value: unknown): void {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    if (typeof value === "number" && !Number.isFinite(value)) throw new Error("Invalid backup value");
    return;
  }
  if (typeof Blob !== "undefined" && value instanceof Blob) throw new Error("Binary data is not allowed in backup stores");
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) throw new Error("Binary data is not allowed in backup stores");
  if (Array.isArray(value)) {
    for (const item of value) validateJsonValue(item);
    return;
  }
  if (!value || typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error("Invalid backup value");
  }
  for (const [key, child] of Object.entries(value)) {
    if (SENSITIVE_FIELD_NAMES.has(key)) throw new Error("Sensitive data is not allowed in backup stores");
    validateJsonValue(child);
  }
}

export function validateBackupEnvelope(value: unknown): asserts value is BackupEnvelope {
  if (!value || typeof value !== "object") throw new Error("Invalid backup envelope");
  const envelope = value as Record<string, unknown>;
  hasOnlyFields(envelope, ENVELOPE_FIELDS, "backup envelope");
  if (envelope.format !== BACKUP_FORMAT) throw new Error("Invalid backup format");
  if (envelope.version !== BACKUP_VERSION) throw new Error("Unsupported backup version");
  if (envelope.kind !== "light" && envelope.kind !== "full") throw new Error("Invalid backup kind");
  if (!isCanonicalBase64(envelope.ciphertext) || !isCanonicalBase64(envelope.salt) || !isCanonicalBase64(envelope.iv)) throw new Error("Invalid backup ciphertext");
  const kdf = envelope.kdf as Record<string, unknown> | undefined;
  if (!kdf || Object.keys(kdf).length !== 4 || kdf.name !== "PBKDF2" || kdf.hash !== "SHA-256" || typeof kdf.iterations !== "number" || !Number.isInteger(kdf.iterations) || kdf.iterations < 100_000 || !isCanonicalBase64(kdf.salt)) {
    throw new Error("Invalid backup KDF parameters");
  }
  const cipher = envelope.cipher as Record<string, unknown> | undefined;
  if (!cipher || Object.keys(cipher).length !== 3 || cipher.name !== "AES-GCM" || cipher.tagLength !== 128 || !isCanonicalBase64(cipher.iv)) throw new Error("Invalid backup cipher parameters");
  if (kdf.salt !== envelope.salt || cipher.iv !== envelope.iv) throw new Error("Invalid backup parameter metadata");
  if (decodedByteLength(envelope.ciphertext) < 16 || decodedByteLength(envelope.salt) !== 16 || decodedByteLength(envelope.iv) !== 12) throw new Error("Invalid backup parameter length");
}

function validateRecordArray(value: unknown, storeName: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`Invalid backup store: ${storeName}`);
  for (const record of value) {
    if (!record || typeof record !== "object") throw new Error(`Invalid record in store: ${storeName}`);
    const item = record as Record<string, unknown>;
    if (typeof item.id !== "string" || !item.id || !isIso(item.createdAt) || !isIso(item.updatedAt)) throw new Error(`Invalid record in store: ${storeName}`);
    validateJsonValue(item);
  }
  return value;
}

export function validateBackupPayload(value: unknown, expectedKind?: BackupKind): asserts value is BackupPayload {
  if (!value || typeof value !== "object") throw new Error("Invalid backup payload");
  const payload = value as Record<string, unknown>;
  hasOnlyFields(payload, PAYLOAD_FIELDS, "backup payload");
  if (payload.kind !== "light" && payload.kind !== "full") throw new Error("Invalid backup payload kind");
  if (expectedKind && payload.kind !== expectedKind) throw new Error("Backup kind mismatch");
  if (!isIso(payload.exportedAt)) throw new Error("Invalid backup export timestamp");
  if (!payload.stores || typeof payload.stores !== "object" || Array.isArray(payload.stores)) throw new Error("Invalid backup stores");
  const stores = payload.stores as Record<string, unknown>;
  for (const key of Object.keys(stores)) {
    if (!ALLOWED_STORES.includes(key as (typeof ALLOWED_STORES)[number])) throw new Error(`Disallowed backup store: ${key}`);
    validateRecordArray(stores[key], key);
  }
  if (payload.kind === "light" && Object.prototype.hasOwnProperty.call(payload, "originalFiles")) throw new Error("Light backup cannot contain originalFiles");
  if (payload.kind === "full") {
    if (!Array.isArray(payload.originalFiles)) throw new Error("Full backup missing originalFiles");
    for (const file of payload.originalFiles) {
      if (!file || typeof file !== "object" || Object.getPrototypeOf(file) !== Object.prototype) throw new Error("Invalid original file record");
      const item = file as Record<string, unknown>;
      if (Object.keys(item).length !== 10 || typeof item.id !== "string" || !item.id || !isIso(item.createdAt) || !isIso(item.updatedAt) || (item.ownerType !== "resume" && item.ownerType !== "job-description") || typeof item.ownerId !== "string" || !item.ownerId || typeof item.fileName !== "string" || !item.fileName || (item.fileType !== "pdf" && item.fileType !== "docx") || typeof item.mimeType !== "string" || typeof item.size !== "number" || !Number.isInteger(item.size) || item.size < 0 || !isCanonicalBase64(item.bytes, item.size === 0) || decodedByteLength(item.bytes) !== item.size) throw new Error("Invalid original file record");
    }
  }
}
