import { decryptBackup } from "./crypto";
import {
  allowedBackupStores,
  type BackupKind,
  type BackupPayload,
  type EncodedOriginalFile,
} from "./format";
import { requestToPromise, runTransaction } from "../db/database";
import { STORE_NAMES, type StoreName } from "../db/schema";
import {
  INTERVIEW_STATUSES,
  RESUME_STATUSES,
  STAGE_KINDS,
  type StoredFile,
} from "../db/types";
import { assertAbsoluteIsoTimestamp } from "../db/timestamps";

export type ImportableStoreName = Exclude<StoreName, "sensitiveSettings">;
export type ImportResolution = "keep-local" | "use-backup" | "import-copy";

export interface BackupConflict {
  storeName: ImportableStoreName;
  id: string;
  defaultResolution: "keep-local";
}

export interface BackupImportSession {
  version: number;
  kind: BackupKind;
  backupVersion: number;
  backupKind: BackupKind;
  payload: BackupPayload;
  storeCounts: Record<ImportableStoreName, number>;
  counts: Record<ImportableStoreName, number>;
  blobCount: number;
  originalFileCount: number;
  conflicts: BackupConflict[];
  decodedOriginalFiles: StoredFile[];
}

export interface BackupConflictResolution {
  storeName: ImportableStoreName;
  id: string;
  resolution: ImportResolution;
}

export interface ImportPlan {
  kind: BackupKind;
  records: Partial<Record<ImportableStoreName, unknown[]>>;
  operations: ImportOperation[];
}

interface ImportOperation {
  storeName: ImportableStoreName;
  record: unknown;
  overwrite: boolean;
}

export interface BuildImportPlanOptions {
  createId?: (storeName: ImportableStoreName, sourceId: string) => string;
}

export type BackupResolutions = readonly BackupConflictResolution[] | ReadonlyMap<string, ImportResolution> | Readonly<Record<string, ImportResolution>>;

const IMPORTABLE_STORES = [...allowedBackupStores(), STORE_NAMES.originalFiles] as ImportableStoreName[];
const DEFAULT_ID = (storeName: ImportableStoreName, sourceId: string): string =>
  `${storeName}-${crypto.randomUUID()}-${sourceId}`;

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function requireField(record: Record<string, unknown>, field: string, predicate: (value: unknown) => boolean, storeName: ImportableStoreName): void {
  if (!predicate(record[field])) throw new Error(`Invalid ${storeName}.${field}`);
}

const stringValue = (value: unknown): value is string => typeof value === "string";
const optionalIso = (value: unknown): boolean => value === undefined || (typeof value === "string" && (() => {
  try { assertAbsoluteIsoTimestamp(value, "timestamp"); return true; } catch { return false; }
})());
const isoString = (value: unknown): boolean => typeof value === "string" && optionalIso(value);
const stringArray = (value: unknown): boolean => Array.isArray(value) && value.every(stringValue);
const integer = (value: unknown): boolean => typeof value === "number" && Number.isInteger(value);

function requireCommon(record: Record<string, unknown>, storeName: ImportableStoreName, fields: Record<string, (value: unknown) => boolean>): void {
  for (const [field, predicate] of Object.entries(fields)) requireField(record, field, predicate, storeName);
}

function assertValidRecord(storeName: ImportableStoreName, value: unknown): asserts value is Record<string, unknown> {
  if (!isObject(value) || typeof value.id !== "string" || value.id.length === 0) {
    throw new Error(`Invalid record in store: ${storeName}`);
  }
  try {
    assertAbsoluteIsoTimestamp(String(value.createdAt), `${storeName}.createdAt`);
    assertAbsoluteIsoTimestamp(String(value.updatedAt), `${storeName}.updatedAt`);
  } catch {
    throw new Error(`Invalid record timestamp in store: ${storeName}`);
  }
  if (storeName === STORE_NAMES.resumes && !RESUME_STATUSES.includes(value.status as never)) {
    throw new Error("Invalid Resume.status");
  }
  if (storeName === STORE_NAMES.resumes) {
    requireCommon(value, storeName, { name: stringValue, type: (item) => item === "pdf" || item === "docx", fileName: stringValue, fileSize: (item) => integer(item) && Number(item) >= 0, fileHash: stringValue, uploadedAt: isoString, tags: stringArray, note: stringValue });
    if (!optionalIso(value.textConfirmedAt) || (value.textSource !== undefined && value.textSource !== "extracted" && value.textSource !== "manual")) throw new Error("Invalid resumes text metadata");
  }
  if (storeName === STORE_NAMES.resumeTexts) {
    requireCommon(value, storeName, { resumeId: stringValue, kind: (item) => item === "extracted" || item === "confirmed" || item === "manual", text: stringValue });
    if (!optionalIso(value.confirmedAt)) throw new Error("Invalid resumeTexts.confirmedAt");
  }
  if (storeName === STORE_NAMES.jobDescriptions) {
    requireCommon(value, storeName, { applicationId: stringValue, textSource: (item) => item === "pasted" || item === "extracted" || item === "manual" });
    if ((value.fileName !== undefined && !stringValue(value.fileName)) || (value.fileType !== undefined && value.fileType !== "pdf" && value.fileType !== "docx") || (value.fileSize !== undefined && (!integer(value.fileSize) || Number(value.fileSize) < 0)) || (value.fileHash !== undefined && !stringValue(value.fileHash)) || !optionalIso(value.textConfirmedAt)) throw new Error("Invalid jobDescriptions metadata");
  }
  if (storeName === STORE_NAMES.jobDescriptionTexts) {
    requireCommon(value, storeName, { jobDescriptionId: stringValue, kind: (item) => ["pasted", "extracted", "confirmed", "manual"].includes(String(item)), text: stringValue });
    if (!optionalIso(value.confirmedAt)) throw new Error("Invalid jobDescriptionTexts.confirmedAt");
  }
  if (storeName === STORE_NAMES.applications) {
    requireCommon(value, storeName, { company: stringValue, position: stringValue, jobType: (item) => ["graduate", "internship", "tech", "general", "other"].includes(String(item)), location: stringValue, workMode: (item) => ["onsite", "remote", "hybrid", "unknown"].includes(String(item)), salaryText: stringValue, source: stringValue, jobUrl: stringValue, jdText: stringValue, stageId: stringValue, priority: integer, contact: stringValue, note: stringValue });
    for (const field of ["currentResumeId", "jdFileId"]) if (value[field] !== undefined && !stringValue(value[field])) throw new Error(`Invalid applications.${field}`);
    if (!optionalIso(value.deadline) || !optionalIso(value.archivedAt)) throw new Error("Invalid applications timestamp");
  }
  if (storeName === STORE_NAMES.resumeUsageHistory) requireCommon(value, storeName, { applicationId: stringValue, resumeId: stringValue, resumeNameSnapshot: stringValue, textSnapshot: stringValue, usedAt: isoString });
  if (storeName === STORE_NAMES.interviews) {
    if (!INTERVIEW_STATUSES.includes(value.status as never)) throw new Error("Invalid Interview.status");
    try {
      assertAbsoluteIsoTimestamp(String(value.startsAt), "Interview.startsAt");
      new Intl.DateTimeFormat("en", { timeZone: String(value.timezone) }).format();
    } catch {
      throw new Error("Invalid Interview timezone or startsAt");
    }
    requireCommon(value, storeName, { applicationId: stringValue, round: (item) => integer(item) && Number(item) >= 1, type: (item) => ["phone", "video", "onsite", "assessment", "other"].includes(String(item)), title: stringValue, timezone: stringValue, locationOrLink: stringValue, interviewer: stringValue, reminders: (item) => Array.isArray(item) && item.every((reminder) => isObject(reminder) && integer(reminder.offsetMinutes) && Number(reminder.offsetMinutes) > 0 && (reminder.channel === "in-app" || reminder.channel === "browser")), note: stringValue });
    if (!optionalIso(value.endsAt) || !optionalIso(value.calendarExportedAt)) throw new Error("Invalid interviews timestamp");
  }
  if (storeName === STORE_NAMES.interviewReviews) {
    requireCommon(value, storeName, { interviewId: stringValue, questions: (item) => Array.isArray(item) && item.every((question) => isObject(question) && stringValue(question.question) && (question.answer === undefined || stringValue(question.answer)) && (question.note === undefined || stringValue(question.note))), goodAnswers: stringValue, weakAnswers: stringValue, observedSignals: stringValue, salaryDiscussion: stringValue, nextStep: stringValue, privateNote: stringValue });
    if (value.overallRating !== undefined && (typeof value.overallRating !== "number" || value.overallRating < 0 || value.overallRating > 5)) throw new Error("Invalid interviewReviews.overallRating");
  }
  if (storeName === STORE_NAMES.reminderFailures) requireCommon(value, storeName, { interviewId: stringValue, reminderAt: isoString, reason: stringValue });
  if (storeName === STORE_NAMES.analysisResults) {
    requireCommon(value, storeName, { applicationId: stringValue, resumeId: stringValue, mode: (item) => item === "local" || item === "ai", matchedKeywords: stringArray, weakMatches: stringArray, missingKeywords: stringArray, uncertainItems: stringArray, recommendations: stringArray, evidence: (item) => Array.isArray(item) && item.every((evidence) => isObject(evidence) && stringValue(evidence.keyword) && stringValue(evidence.excerpt)), coverage: (item) => isObject(item) && ["overall", "required", "preferred"].every((field) => typeof item[field] === "number" && Number.isFinite(item[field])) });
  }
  if (storeName === STORE_NAMES.aiConversations) {
    requireCommon(value, storeName, { applicationId: stringValue, messages: (item) => Array.isArray(item) && item.every((message) => isObject(message) && stringValue(message.id) && ["system", "user", "assistant"].includes(String(message.role)) && stringValue(message.content) && typeof message.createdAt === "string" && (() => { try { assertAbsoluteIsoTimestamp(message.createdAt, "message.createdAt"); return true; } catch { return false; } })()) });
  }
  if (storeName === STORE_NAMES.stages) {
    requireCommon(value, storeName, { name: stringValue, color: stringValue, order: integer, kind: (item) => STAGE_KINDS.includes(item as never) });
  }
  if (storeName === STORE_NAMES.originalFiles) {
    if ((value.ownerType !== "resume" && value.ownerType !== "job-description") ||
      typeof value.ownerId !== "string" || value.ownerId.length === 0 ||
      (value.fileType !== "pdf" && value.fileType !== "docx") ||
      !isObject(value.blob) || typeof value.blob.size !== "number" ||
      typeof value.blob.type !== "string" || typeof value.blob.slice !== "function") {
      throw new Error("Invalid original file record");
    }
  }
}

function payloadRecords(payload: BackupPayload): Map<ImportableStoreName, unknown[]> {
  const records = new Map<ImportableStoreName, unknown[]>();
  for (const storeName of allowedBackupStores()) records.set(storeName, payload.stores[storeName] ?? []);
  records.set(STORE_NAMES.originalFiles, payload.originalFiles ?? []);
  return records;
}

async function decodeOriginalFile(file: EncodedOriginalFile): Promise<StoredFile> {
  const binary = atob(file.bytes);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  const blob = await new Response(bytes, { headers: { "content-type": file.mimeType } }).blob();
  return { id: file.id, createdAt: file.createdAt, updatedAt: file.updatedAt, ownerType: file.ownerType, ownerId: file.ownerId, fileName: file.fileName, fileType: file.fileType, blob };
}

async function readLocalIds(database: IDBDatabase): Promise<Map<ImportableStoreName, Set<string>>> {
  return runTransaction(database, IMPORTABLE_STORES, "readonly", async (transaction) => {
    const result = new Map<ImportableStoreName, Set<string>>();
    for (const storeName of IMPORTABLE_STORES) {
      const rows = await requestToPromise<Array<{ id?: unknown }>>(transaction.objectStore(storeName).getAll());
      result.set(storeName, new Set(rows.flatMap((row) => typeof row.id === "string" ? [row.id] : [])));
    }
    return result;
  });
}

export async function prepareBackupImport(
  database: IDBDatabase,
  encryptedInput: unknown,
  password: string,
): Promise<BackupImportSession> {
  const payload = await decryptBackup(encryptedInput, password);
  const records = payloadRecords(payload);
  for (const [storeName, rows] of records) {
    if (!Array.isArray(rows)) throw new Error(`Invalid backup store: ${storeName}`);
    const seenIds = new Set<string>();
    if (storeName !== STORE_NAMES.originalFiles) {
      for (const row of rows) {
        assertValidRecord(storeName, row);
        const id = String(row.id);
        if (seenIds.has(id)) throw new Error(`Duplicate record id in store: ${storeName}`);
        seenIds.add(id);
      }
    } else {
      for (const row of rows) {
        if (!isObject(row) || typeof row.id !== "string" || !row.id) throw new Error("Invalid original file record");
        if (seenIds.has(row.id)) throw new Error(`Duplicate record id in store: ${storeName}`);
        seenIds.add(row.id);
      }
    }
  }
  const localIds = await readLocalIds(database);
  const decodedOriginalFiles = await Promise.all((payload.originalFiles ?? []).map(decodeOriginalFile));
  for (const file of decodedOriginalFiles) assertValidRecord(STORE_NAMES.originalFiles, file);
  const conflicts: BackupConflict[] = [];
  for (const [storeName, rows] of records) {
    const ids = localIds.get(storeName) ?? new Set<string>();
    for (const row of rows as Array<{ id: string }>) {
      if (ids.has(row.id)) conflicts.push({ storeName, id: row.id, defaultResolution: "keep-local" });
    }
  }
  const storeCounts = Object.fromEntries(IMPORTABLE_STORES.map((storeName) => [storeName, records.get(storeName)?.length ?? 0])) as Record<ImportableStoreName, number>;
  const blobCount = payload.originalFiles?.length ?? 0;
  return { version: 1, kind: payload.kind, backupVersion: 1, backupKind: payload.kind, payload, storeCounts, counts: storeCounts, blobCount, originalFileCount: blobCount, conflicts, decodedOriginalFiles };
}

function resolutionMap(session: BackupImportSession, resolutions?: BackupResolutions | null): Map<string, ImportResolution> {
  if (resolutions === null) throw new Error("Import conflict resolution cancelled");
  const result = new Map<string, ImportResolution>();
  for (const conflict of session.conflicts) result.set(`${conflict.storeName}:${conflict.id}`, "keep-local");
  const entries: BackupConflictResolution[] = Array.isArray(resolutions)
    ? [...resolutions]
    : resolutions instanceof Map
      ? [...resolutions.entries()].map(([key, resolution]) => {
        const separator = key.indexOf(":");
        return { storeName: key.slice(0, separator) as ImportableStoreName, id: key.slice(separator + 1), resolution };
      })
      : Object.entries(resolutions ?? {}).map(([key, resolution]) => {
        const separator = key.indexOf(":");
        return { storeName: key.slice(0, separator) as ImportableStoreName, id: key.slice(separator + 1), resolution };
      });
  for (const resolution of entries) {
    if (!IMPORTABLE_STORES.includes(resolution.storeName) || !["keep-local", "use-backup", "import-copy"].includes(resolution.resolution)) {
      throw new Error("Invalid import conflict resolution");
    }
    if (!session.conflicts.some((item) => item.storeName === resolution.storeName && item.id === resolution.id)) {
      throw new Error("Resolution does not match a conflict");
    }
    result.set(`${resolution.storeName}:${resolution.id}`, resolution.resolution);
  }
  return result;
}

function remapValue(value: unknown, map: Map<string, string>, storeName?: ImportableStoreName): unknown {
  if (typeof value !== "string") return value;
  if (storeName) return map.get(`${storeName}:${value}`) ?? value;
  return value;
}

function remapRecord(storeName: ImportableStoreName, source: Record<string, unknown>, ids: Map<string, string>): Record<string, unknown> {
  const record: Record<string, unknown> = { ...source, id: ids.get(`${storeName}:${String(source.id)}`) ?? source.id };
  const fieldMap: Partial<Record<string, ImportableStoreName>> = {
    resumeId: STORE_NAMES.resumes,
    currentResumeId: STORE_NAMES.resumes,
    originalFileId: STORE_NAMES.originalFiles,
    jdFileId: STORE_NAMES.originalFiles,
    jobDescriptionId: STORE_NAMES.jobDescriptions,
    applicationId: STORE_NAMES.applications,
    stageId: STORE_NAMES.stages,
    interviewId: STORE_NAMES.interviews,
  };
  for (const [field, targetStore] of Object.entries(fieldMap)) {
    if (field in record) record[field] = remapValue(record[field], ids, targetStore);
  }
  if (storeName === STORE_NAMES.applicationTimelineEvents) {
    const type = record.type;
    const targetStore = type === "resume-changed" ? STORE_NAMES.resumes : type === "stage-changed" ? STORE_NAMES.stages : undefined;
    if (targetStore) {
      record.fromValue = remapValue(record.fromValue, ids, targetStore);
      record.toValue = remapValue(record.toValue, ids, targetStore);
    }
  }
  if (storeName === STORE_NAMES.originalFiles) record.ownerId = remapValue(record.ownerId, ids, record.ownerType === "resume" ? STORE_NAMES.resumes : STORE_NAMES.jobDescriptions);
  return record;
}

export function buildImportPlan(
  session: BackupImportSession,
  resolutions?: BackupResolutions | null,
  options: BuildImportPlanOptions = {},
): ImportPlan {
  const resolutionsByKey = resolutionMap(session, resolutions);
  const records = payloadRecords(session.payload);
  const ids = new Map<string, string>();
  for (const conflict of session.conflicts) {
    if (resolutionsByKey.get(`${conflict.storeName}:${conflict.id}`) === "import-copy") {
      const nextId = options.createId?.(conflict.storeName, conflict.id) ?? DEFAULT_ID(conflict.storeName, conflict.id);
      if (!nextId || nextId === conflict.id || [...ids.values()].includes(nextId)) throw new Error("Import copy ID must be a new unique ID");
      ids.set(`${conflict.storeName}:${conflict.id}`, nextId);
    }
  }
  const output: Partial<Record<ImportableStoreName, unknown[]>> = {};
  const operations: ImportOperation[] = [];
  for (const storeName of IMPORTABLE_STORES) {
    const rows = records.get(storeName) ?? [];
    const selected: unknown[] = [];
    for (const source of rows as Array<Record<string, unknown>>) {
      if (storeName !== STORE_NAMES.originalFiles) assertValidRecord(storeName, source);
      const key = `${storeName}:${String(source.id)}`;
      const resolution = resolutionsByKey.get(key);
      if (resolution === "keep-local") continue;
      const remapped = remapRecord(storeName, source, ids);
      if (storeName === STORE_NAMES.originalFiles) {
        const decoded = session.decodedOriginalFiles.find((file) => file.id === source.id);
        if (!decoded) throw new Error(`Missing decoded original file: ${String(source.id)}`);
        const file = { ...decoded, id: String(remapped.id), ownerId: String(remapped.ownerId) };
        assertValidRecord(storeName, file);
        selected.push(file);
        operations.push({ storeName, record: file, overwrite: resolution === "use-backup" });
      } else {
        selected.push(remapped);
        operations.push({ storeName, record: remapped, overwrite: resolution === "use-backup" });
      }
    }
    output[storeName] = selected;
  }
  return { kind: session.kind, records: output, operations };
}

export async function commitBackupImport(database: IDBDatabase, plan: ImportPlan): Promise<void> {
  for (const operation of plan.operations) assertValidRecord(operation.storeName, operation.record);
  const stores = IMPORTABLE_STORES;
  await runTransaction(database, stores, "readwrite", async (transaction) => {
    for (const operation of plan.operations) {
      const store = transaction.objectStore(operation.storeName);
      await requestToPromise(operation.overwrite ? store.put(operation.record) : store.add(operation.record));
    }
  });
}
