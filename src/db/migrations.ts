import {
  INTERVIEW_STATUSES,
  RESUME_STATUSES,
  STAGE_KINDS,
} from "./types";
import { STORE_NAMES, type StoreName } from "./schema";

type StoredRecord = Record<string, unknown>;

const EPOCH = "1970-01-01T00:00:00.000Z";

const DEFAULTS: Partial<Record<StoreName, StoredRecord>> = {
  resumes: { tags: [], note: "", status: "needs-review" },
  jobDescriptions: { textSource: "pasted" },
  applications: { jobType: "other", workMode: "unknown", priority: 0 },
  resumeUsageHistory: {},
  stages: { kind: "normal" },
  applicationTimelineEvents: { note: "" },
  interviews: { status: "scheduled", reminders: [], note: "" },
  interviewReviews: {
    questions: [],
    goodAnswers: "",
    weakAnswers: "",
    observedSignals: "",
    salaryDiscussion: "",
    nextStep: "",
    privateNote: "",
  },
  analysisResults: {
    mode: "local",
    coverage: { overall: 0, required: 0, preferred: 0 },
    matchedKeywords: [],
    weakMatches: [],
    missingKeywords: [],
    evidence: [],
    uncertainItems: [],
    recommendations: [],
  },
  aiConversations: { messages: [] },
};

function cloneDefault(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cloneDefault);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, cloneDefault(child)]));
  return value;
}

function addMissingDefaults(record: StoredRecord, defaults: StoredRecord): boolean {
  let changed = false;

  for (const [key, value] of Object.entries(defaults)) {
    if (record[key] === undefined) {
      // 深拷贝，避免多条记录共享同一份 DEFAULTS 里的数组/对象实例（aliasing 陷阱）。
      record[key] = cloneDefault(value);
      changed = true;
    }
  }

  const createdAt =
    record.createdAt ?? record.uploadedAt ?? record.usedAt ?? record.startsAt ?? EPOCH;
  if (record.createdAt === undefined) {
    record.createdAt = createdAt;
    changed = true;
  }
  if (record.updatedAt === undefined) {
    record.updatedAt = createdAt;
    changed = true;
  }

  return changed;
}

function hasValue<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && values.includes(value as T);
}

/**
 * 把非法的枚举值（beta 遗留、导入脏数据）回填为安全默认值，而不是让整个升级事务 abort。
 * 之前的实现会因单条坏记录反复 abort，导致数据库永久打不开、只能删库。
 * 返回是否发生了修正，供上层决定是否写回。
 */
function coerceMigratedRecord(storeName: StoreName, record: StoredRecord): boolean {
  let changed = false;
  if (storeName === STORE_NAMES.resumes && !hasValue(RESUME_STATUSES, record.status)) {
    record.status = "needs-review";
    changed = true;
  }
  if (storeName === STORE_NAMES.interviews && !hasValue(INTERVIEW_STATUSES, record.status)) {
    record.status = "scheduled";
    changed = true;
  }
  if (storeName === STORE_NAMES.stages && !hasValue(STAGE_KINDS, record.kind)) {
    record.kind = "normal";
    changed = true;
  }
  return changed;
}

function migrateStore(
  transaction: IDBTransaction,
  storeName: StoreName,
  defaults: StoredRecord,
  onError: (error: unknown) => void,
): void {
  const request = transaction.objectStore(storeName).openCursor();

  request.addEventListener("success", () => {
    try {
      const cursor = request.result;
      if (!cursor) {
        return;
      }

      const record = cursor.value as StoredRecord;
      const filled = addMissingDefaults(record, defaults);
      const coerced = coerceMigratedRecord(storeName, record);
      if (filled || coerced) {
        const updateRequest = cursor.update(record);
        updateRequest.addEventListener("error", () => onError(updateRequest.error));
      }
      cursor.continue();
    } catch (error) {
      onError(error);
      try {
        transaction.abort();
      } catch {
        // A request error may already have aborted the upgrade transaction.
      }
    }
  });
  request.addEventListener("error", () => onError(request.error));
}

export function runMigrations(
  transaction: IDBTransaction,
  oldVersion: number,
  onError: (error: unknown) => void = () => undefined,
): void {
  if (oldVersion === 0 || oldVersion >= 6) {
    return;
  }

  for (const [storeName, defaults] of Object.entries(DEFAULTS) as Array<
    [StoreName, StoredRecord]
  >) {
    if (transaction.db.objectStoreNames.contains(storeName)) {
      migrateStore(transaction, storeName, defaults, onError);
    }
  }
}
