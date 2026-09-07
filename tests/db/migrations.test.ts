import { afterEach, describe, expect, it } from "vitest";

import {
  deleteCareerDatabase,
  openCareerDatabase,
  requestToPromise,
  transactionToPromise,
} from "../../src/db/database";
import { DATABASE_VERSION, STORE_NAMES } from "../../src/db/schema";

const databaseNames = new Set<string>();
const databaseConnections = new Set<IDBDatabase>();

async function openTestDatabase(name: string): Promise<IDBDatabase> {
  const database = await openCareerDatabase({ name });
  databaseConnections.add(database);
  return database;
}

function createLegacyDatabase(
  name: string,
  overrides: Record<string, unknown> = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);

    request.addEventListener("upgradeneeded", () => {
      request.result.createObjectStore(STORE_NAMES.resumes, { keyPath: "id" });
    });
    request.addEventListener("error", () => reject(request.error));
    request.addEventListener("success", async () => {
      const database = request.result;
      const transaction = database.transaction(STORE_NAMES.resumes, "readwrite");
      transaction.objectStore(STORE_NAMES.resumes).put({
        id: "legacy-resume",
        name: "旧版记录",
        type: "pdf",
        fileName: "legacy.pdf",
        fileSize: 64,
        fileHash: "legacy-hash",
        uploadedAt: "2025-01-01T00:00:00.000Z",
        createdAt: "2025-01-01T00:00:00.000Z",
        updatedAt: "2025-01-02T00:00:00.000Z",
        legacyLabel: "must-survive",
        ...overrides,
      });
      await transactionToPromise(transaction);
      database.close();
      resolve();
    });
  });
}

afterEach(async () => {
  databaseConnections.forEach((database) => database.close());
  databaseConnections.clear();
  await Promise.all([...databaseNames].map((name) => deleteCareerDatabase(name)));
  databaseNames.clear();
});

describe("database migrations", () => {
  it("upgrades version-one records without changing identity, timestamps, or old fields", async () => {
    const name = `career-migration-${crypto.randomUUID()}`;
    databaseNames.add(name);
    await createLegacyDatabase(name);

    const database = await openTestDatabase(name);
    expect(database.version).toBe(DATABASE_VERSION);
    const transaction = database.transaction(STORE_NAMES.resumes, "readonly");
    const migrated = await requestToPromise<Record<string, unknown>>(
      transaction.objectStore(STORE_NAMES.resumes).get("legacy-resume"),
    );
    await transactionToPromise(transaction);

    expect(migrated).toMatchObject({
      id: "legacy-resume",
      name: "旧版记录",
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-02T00:00:00.000Z",
      legacyLabel: "must-survive",
      tags: [],
      note: "",
      status: "needs-review",
    });
    database.close();
  });

  it("coerces an invalid legacy enum to a safe default instead of locking the database", async () => {
    const name = `career-invalid-migration-${crypto.randomUUID()}`;
    databaseNames.add(name);
    await createLegacyDatabase(name, { status: "uploaded" });

    const database = await openCareerDatabase({ name });
    expect(database.version).toBe(DATABASE_VERSION);
    const transaction = database.transaction(STORE_NAMES.resumes, "readonly");
    const migrated = await requestToPromise<Record<string, unknown>>(
      transaction.objectStore(STORE_NAMES.resumes).get("legacy-resume"),
    );
    await transactionToPromise(transaction);
    expect(migrated.status).toBe("needs-review");
    database.close();
  });
});
