import { afterEach, describe, expect, it } from "vitest";

const databaseName = "local-career-workspace-smoke";

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve());
    transaction.addEventListener("abort", () => reject(transaction.error));
    transaction.addEventListener("error", () => reject(transaction.error));
  });
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);

    request.addEventListener("upgradeneeded", () => {
      request.result.createObjectStore("records", { keyPath: "id" });
    });
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error));
  });
}

async function deleteDatabase(): Promise<void> {
  await requestResult(indexedDB.deleteDatabase(databaseName));
}

describe("browser IndexedDB test environment", () => {
  afterEach(deleteDatabase);

  it("creates a database and persists a structured record", async () => {
    const database = await openDatabase();
    const write = database.transaction("records", "readwrite");

    write.objectStore("records").put({ id: "record-1", value: "local" });
    await transactionDone(write);

    const read = database.transaction("records", "readonly");
    const record = await requestResult<{ id: string; value: string }>(
      read.objectStore("records").get("record-1"),
    );

    expect(record).toEqual({ id: "record-1", value: "local" });
    database.close();
  });
});
