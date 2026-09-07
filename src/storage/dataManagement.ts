import { requestToPromise, runTransaction } from "../db/database";
import { STORE_NAMES, type StoreName } from "../db/schema";
import { PREFERENCE_KEYS } from "../settings/preferences";

export interface DataClearPreview {
  recordCounts: Record<StoreName, number>;
  totalRecords: number;
  structuredRecords: number;
  textRecords: number;
  texts: number;
  blobs: number;
  blobRecords: number;
}

export interface ClearAllOptions {
  confirmed?: boolean;
  confirmationWord?: string;
}

export interface ClearAllResult {
  cleared: boolean;
  error?: Error;
}

const ALL_STORES = Object.values(STORE_NAMES) as StoreName[];
export const CLEAR_CONFIRMATION_WORD = "DELETE";
const TEXT_STORES = new Set<StoreName>([
  STORE_NAMES.resumeTexts,
  STORE_NAMES.jobDescriptionTexts,
]);

type Snapshot = Record<StoreName, unknown[]>;

async function snapshotData(database: IDBDatabase): Promise<Snapshot> {
  return runTransaction(database, ALL_STORES, "readonly", async (tx) => {
    const result = {} as Snapshot;
    await Promise.all(
      ALL_STORES.map(async (storeName) => {
        result[storeName] = await requestToPromise<unknown[]>(
          tx.objectStore(storeName).getAll(),
        );
      }),
    );
    return result;
  });
}

export async function previewDataClear(database: IDBDatabase): Promise<DataClearPreview> {
  const snapshot = await snapshotData(database);
  const recordCounts = {} as Record<StoreName, number>;
  let totalRecords = 0;
  let textRecords = 0;
  let blobs = 0;
  let structuredRecords = 0;
  for (const storeName of ALL_STORES) {
    const count = snapshot[storeName].length;
    recordCounts[storeName] = count;
    if (storeName !== STORE_NAMES.sensitiveSettings) totalRecords += count;
    if (TEXT_STORES.has(storeName)) textRecords += count;
    if (storeName === STORE_NAMES.originalFiles) blobs = count;
    if (!TEXT_STORES.has(storeName) && storeName !== STORE_NAMES.originalFiles && storeName !== STORE_NAMES.sensitiveSettings) {
      structuredRecords += count;
    }
  }
  return {
    recordCounts,
    totalRecords,
    structuredRecords,
    textRecords,
    texts: textRecords,
    blobs,
    blobRecords: blobs,
  };
}

async function restoreSnapshot(database: IDBDatabase, snapshot: Snapshot): Promise<void> {
  await runTransaction(database, ALL_STORES, "readwrite", (tx) => {
    const requests: Promise<unknown>[] = [];
    for (const storeName of ALL_STORES) {
      const store = tx.objectStore(storeName);
      requests.push(requestToPromise(store.clear()));
      for (const record of snapshot[storeName]) {
        requests.push(requestToPromise(store.put(record)));
      }
    }
    return Promise.all(requests).then(() => undefined);
  });
}

export async function clearAllData(
  database: IDBDatabase,
  options: ClearAllOptions = {},
): Promise<ClearAllResult> {
  if (!options.confirmed && options.confirmationWord !== CLEAR_CONFIRMATION_WORD) {
    return { cleared: false };
  }

  let snapshot: Snapshot;
  const localStorageSnapshot: Record<string, string> = {};
  try {
    snapshot = await snapshotData(database);
    for (const key of PREFERENCE_KEYS) {
      const value = localStorage.getItem(key);
      if (value !== null) localStorageSnapshot[key] = value;
    }
  } catch (cause) {
    return { cleared: false, error: cause instanceof Error ? cause : new Error(String(cause)) };
  }
  try {
    await runTransaction(database, ALL_STORES, "readwrite", async (tx) => {
      await Promise.all(
        ALL_STORES.map((storeName) =>
          requestToPromise(tx.objectStore(storeName).clear()),
        ),
      );
    });
    for (const key of PREFERENCE_KEYS) localStorage.removeItem(key);
    return { cleared: true };
  } catch (cause) {
    try {
      await restoreSnapshot(database, snapshot);
      for (const key of PREFERENCE_KEYS) localStorage.removeItem(key);
      for (const [key, value] of Object.entries(localStorageSnapshot)) {
        localStorage.setItem(key, value);
      }
    } catch (restoreError) {
      return { cleared: false, error: restoreError instanceof Error ? restoreError : new Error(String(restoreError)) };
    }
    return { cleared: false, error: cause instanceof Error ? cause : new Error(String(cause)) };
  }
}

export const SENSITIVE_SETTINGS_ID = "ai";
export const getDataClearPreview = previewDataClear;
export const clearAllLocalData = clearAllData;
