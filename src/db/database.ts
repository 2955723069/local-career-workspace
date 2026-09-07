import {
  DATABASE_NAME,
  DATABASE_VERSION,
  ensureSchema,
  type StoreName,
} from "./schema";
import { runMigrations } from "./migrations";

export interface OpenDatabaseOptions {
  name?: string;
  version?: number;
  factory?: IDBFactory;
}

export function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () =>
      reject(request.error ?? new Error("IndexedDB request failed")),
    );
  });
}

export function transactionToPromise(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve());
    transaction.addEventListener("abort", () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted")),
    );
    transaction.addEventListener("error", () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed")),
    );
  });
}

export async function runTransaction<T>(
  database: IDBDatabase,
  storeNames: StoreName | readonly StoreName[],
  mode: IDBTransactionMode,
  operation: (transaction: IDBTransaction) => T | Promise<T>,
): Promise<T> {
  const transaction = database.transaction(storeNames, mode);
  const completion = transactionToPromise(transaction);

  try {
    const result = await operation(transaction);
    await completion;
    return result;
  } catch (error) {
    try {
      transaction.abort();
    } catch {
      // The transaction may already have completed or aborted.
    }
    await completion.catch(() => undefined);
    throw error;
  }
}

export function openCareerDatabase(
  options: OpenDatabaseOptions = {},
): Promise<IDBDatabase> {
  const factory = options.factory ?? indexedDB;
  const name = options.name ?? DATABASE_NAME;
  const version = options.version ?? DATABASE_VERSION;

  return new Promise((resolve, reject) => {
    const request = factory.open(name, version);
    let upgradeError: unknown;

    request.addEventListener("upgradeneeded", (event) => {
      try {
        const transaction = request.transaction;
        if (!transaction) {
          throw new Error("IndexedDB upgrade transaction is unavailable");
        }
        ensureSchema(request.result, transaction);
        runMigrations(transaction, event.oldVersion, (error) => {
          if (upgradeError === undefined) {
            upgradeError = error;
          }
        });
      } catch (error) {
        upgradeError = error;
        request.transaction?.abort();
      }
    });
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () =>
      reject(
        upgradeError ?? request.error ?? new Error("Unable to open IndexedDB"),
      ),
    );
    request.addEventListener("blocked", () =>
      reject(new Error(`IndexedDB upgrade is blocked for ${name}`)),
    );
  });
}

export function deleteCareerDatabase(
  name = DATABASE_NAME,
  factory: IDBFactory = indexedDB,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = factory.deleteDatabase(name);
    request.addEventListener("success", () => resolve());
    request.addEventListener("error", () =>
      reject(request.error ?? new Error(`Unable to delete IndexedDB ${name}`)),
    );
    request.addEventListener("blocked", () =>
      reject(new Error(`IndexedDB deletion is blocked for ${name}`)),
    );
  });
}

export const openDatabase = openCareerDatabase;
