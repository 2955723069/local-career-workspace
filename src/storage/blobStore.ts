import { requestToPromise, runTransaction } from "../db/database";
import { STORE_NAMES } from "../db/schema";
import { assertAbsoluteIsoTimestamp } from "../db/timestamps";
import type { StoredFile } from "../db/types";

export type StoredFileInput = Omit<StoredFile, "id" | "createdAt" | "updatedAt">;

export interface BlobStoreDependencies {
  now?: () => string;
  createId?: () => string;
}

const MAX_FILE_SIZE = 25 * 1024 * 1024;

function validateInput(input: StoredFileInput): void {
  if (input.fileType !== "pdf" && input.fileType !== "docx") {
    throw new Error("Invalid original file type: only PDF and DOCX are supported");
  }
  if (
    typeof input.blob !== "object" ||
    typeof input.blob.size !== "number" ||
    typeof input.blob.type !== "string" ||
    typeof input.blob.slice !== "function"
  ) {
    throw new Error("Invalid original file Blob");
  }
  if (input.blob.size > MAX_FILE_SIZE) {
    throw new Error("Invalid original file size: maximum is 25 MB");
  }
}

export class BlobStore {
  readonly #database: IDBDatabase;
  readonly #now: () => string;
  readonly #createId: () => string;

  constructor(database: IDBDatabase, dependencies: BlobStoreDependencies = {}) {
    this.#database = database;
    this.#now = dependencies.now ?? (() => new Date().toISOString());
    this.#createId = dependencies.createId ?? (() => crypto.randomUUID());
  }

  async save(input: StoredFileInput): Promise<StoredFile> {
    validateInput(input);
    const timestamp = this.#now();
    assertAbsoluteIsoTimestamp(timestamp, "original file timestamp");
    const record: StoredFile = {
      ...input,
      id: this.#createId(),
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    await runTransaction(
      this.#database,
      STORE_NAMES.originalFiles,
      "readwrite",
      (transaction) =>
        requestToPromise(
          transaction.objectStore(STORE_NAMES.originalFiles).add(record),
        ),
    );
    return record;
  }

  get(id: string): Promise<StoredFile | undefined> {
    return runTransaction(
      this.#database,
      STORE_NAMES.originalFiles,
      "readonly",
      (transaction) =>
        requestToPromise<StoredFile | undefined>(
          transaction.objectStore(STORE_NAMES.originalFiles).get(id),
        ),
    );
  }

  list(): Promise<StoredFile[]> {
    return runTransaction(
      this.#database,
      STORE_NAMES.originalFiles,
      "readonly",
      (transaction) =>
        requestToPromise<StoredFile[]>(
          transaction.objectStore(STORE_NAMES.originalFiles).getAll(),
        ),
    );
  }

  async delete(id: string): Promise<void> {
    await runTransaction(
      this.#database,
      STORE_NAMES.originalFiles,
      "readwrite",
      (transaction) =>
        requestToPromise(
          transaction.objectStore(STORE_NAMES.originalFiles).delete(id),
        ),
    );
  }
}
