import { requestToPromise, runTransaction } from "../db/database";
import { STORE_NAMES } from "../db/schema";
import type { StoredFile } from "../db/types";
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  allowedBackupStores,
  type BackupEnvelope,
  type BackupKind,
  type BackupPayload,
  type EncodedOriginalFile,
  validateBackupEnvelope,
  validateBackupPayload,
} from "./format";

const PBKDF2_ITERATIONS = 210_000;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deriveKey(password: string, salt: Uint8Array, iterations: number = PBKDF2_ITERATIONS): Promise<CryptoKey> {
  if (typeof password !== "string" || password.length === 0) throw new Error("Backup password is required");
  const material = await crypto.subtle.importKey("raw", textEncoder.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

async function blobBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === "function") return new Uint8Array(await blob.arrayBuffer());
  if (typeof (blob as Blob & { text?: () => Promise<string> }).text === "function") {
    return textEncoder.encode(await (blob as Blob & { text: () => Promise<string> }).text());
  }
  return new Uint8Array(await new Response(blob).arrayBuffer());
}

async function readStores(database: IDBDatabase, kind: BackupKind): Promise<BackupPayload> {
  const storeNames = [...allowedBackupStores(), ...(kind === "full" ? [STORE_NAMES.originalFiles] : [])] as const;
  const result = await runTransaction(database, storeNames, "readonly", async (tx) => {
    const stores: Record<string, unknown[]> = {};
    for (const storeName of allowedBackupStores()) stores[storeName] = await requestToPromise<unknown[]>(tx.objectStore(storeName).getAll());
    let originalFiles: EncodedOriginalFile[] | undefined;
    if (kind === "full") {
      const files = await requestToPromise<StoredFile[]>(tx.objectStore(STORE_NAMES.originalFiles).getAll());
      originalFiles = [];
      for (const file of files) {
        const bytes = await blobBytes(file.blob);
        originalFiles.push({ id: file.id, createdAt: file.createdAt, updatedAt: file.updatedAt, ownerType: file.ownerType, ownerId: file.ownerId, fileName: file.fileName, fileType: file.fileType, mimeType: file.blob.type, size: bytes.byteLength, bytes: bytesToBase64(bytes) });
      }
    }
    return { kind, exportedAt: new Date().toISOString(), stores, ...(originalFiles ? { originalFiles } : {}) } as BackupPayload;
  });
  validateBackupPayload(result, kind);
  return result;
}

export async function exportBackup(database: IDBDatabase, options: { kind: BackupKind; password: string }): Promise<BackupEnvelope> {
  const payload = await readStores(database, options.kind);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(options.password, salt);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource, tagLength: 128 }, key, textEncoder.encode(JSON.stringify(payload))));
  const saltBase64 = bytesToBase64(salt);
  const ivBase64 = bytesToBase64(iv);
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, kind: options.kind, salt: saltBase64, iv: ivBase64, kdf: { name: "PBKDF2", hash: "SHA-256", iterations: PBKDF2_ITERATIONS, salt: saltBase64 }, cipher: { name: "AES-GCM", iv: ivBase64, tagLength: 128 }, ciphertext: bytesToBase64(ciphertext) };
}

export async function decryptBackup(input: unknown, password: string): Promise<BackupPayload> {
  validateBackupEnvelope(input);
  let plain: ArrayBuffer;
  try {
    const key = await deriveKey(password, base64ToBytes(input.salt), input.kdf.iterations);
    plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(input.iv) as BufferSource, tagLength: 128 }, key, base64ToBytes(input.ciphertext) as BufferSource);
  } catch {
    // 只有 KDF/AES-GCM 认证失败（密码错误或密文被篡改）才落到这里，统一按“无法解密”处理。
    throw new Error("Unable to decrypt backup");
  }
  // 解密成功后的负载校验错误（结构非法、含敏感字段、被篡改的合法密文）如实抛出，
  // 不再被吞成“密码错误”，以免误导用户反复重试密码。
  const payload: unknown = JSON.parse(textDecoder.decode(plain));
  validateBackupPayload(payload, input.kind);
  return payload;
}
