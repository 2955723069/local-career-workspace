import { afterEach, describe, expect, it, vi } from "vitest";

import {
  deleteCareerDatabase,
  openCareerDatabase,
  requestToPromise,
  transactionToPromise,
} from "../../src/db/database";
import { DATABASE_VERSION, STORE_NAMES } from "../../src/db/schema";
import type { Resume, ResumeText, StoredFile } from "../../src/db/types";
import {
  MAX_RESUME_FILE_SIZE,
  ResumeIngestionError,
  ResumeIngestionService,
  type ResumeIngestionLogEntry,
} from "../../src/features/resumes/ingestion";
import { DOCX_MIME, PDF_MIME, makePdf, makeResumeFile } from "./fixtures";

const databaseNames = new Set<string>();
const databaseConnections = new Set<IDBDatabase>();
const fixedNow = "2026-09-01T08:30:00.000Z";

async function openTestDatabase(name: string): Promise<IDBDatabase> {
  const database = await openCareerDatabase({ name });
  databaseConnections.add(database);
  return database;
}

function service(
  database: IDBDatabase,
  overrides: ConstructorParameters<typeof ResumeIngestionService>[1] = {},
): ResumeIngestionService {
  let sequence = 0;
  return new ResumeIngestionService(database, {
    now: () => fixedNow,
    createId: () => `generated-${++sequence}`,
    ...overrides,
  });
}

async function records<T>(database: IDBDatabase, storeName: string): Promise<T[]> {
  const transaction = database.transaction(storeName, "readonly");
  const result = await requestToPromise<T[]>(transaction.objectStore(storeName).getAll());
  await transactionToPromise(transaction);
  return result;
}

afterEach(async () => {
  vi.unstubAllGlobals();
  databaseConnections.forEach((database) => database.close());
  databaseConnections.clear();
  await Promise.all([...databaseNames].map((name) => deleteCareerDatabase(name)));
  databaseNames.clear();
});

describe("resume ingestion", () => {
  it.each([
    ["pdf", "PDF persisted text"],
    ["docx", "DOCX persisted text"],
  ] as const)(
    "hashes, extracts, and separately persists a valid %s file without network access",
    async (kind, expectedText) => {
      const fetchSpy = vi.fn();
      vi.stubGlobal("fetch", fetchSpy);
      const databaseName = `resume-ingest-${kind}-${crypto.randomUUID()}`;
      databaseNames.add(databaseName);
      let database = await openTestDatabase(databaseName);
      const file = makeResumeFile(kind, expectedText, `Candidate.${kind}`);
      const originalBytes = new Uint8Array(await file.arrayBuffer());

      const result = await service(database).ingest(file);

      expect(result.outcome).toBe("needs-review");
      expect(result.resume).toMatchObject({
        name: "Candidate",
        fileName: `Candidate.${kind}`,
        fileSize: file.size,
        type: kind,
        uploadedAt: fixedNow,
        status: "needs-review",
        textSource: "extracted",
      });
      expect(result.resume.fileHash).toMatch(/^[a-f0-9]{64}$/);
      expect(result.extractedText?.text).toContain(expectedText);
      expect(result.extractedText?.kind).toBe("extracted");
      expect(fetchSpy).not.toHaveBeenCalled();
      database.close();

      database = await openTestDatabase(databaseName);
      const reopenedService = service(database);
      const restored = await reopenedService.getOriginalFile(result.resume.id);
      const download = await reopenedService.getDownloadData(result.resume.id);
      const persistedResumes = await records<Resume>(database, STORE_NAMES.resumes);
      const persistedTexts = await records<ResumeText>(database, STORE_NAMES.resumeTexts);
      const persistedFiles = await records<StoredFile>(database, STORE_NAMES.originalFiles);

      expect(new Uint8Array(await restored!.blob.arrayBuffer())).toEqual(originalBytes);
      expect(restored).toMatchObject({
        fileName: `Candidate.${kind}`,
        fileType: kind,
      });
      expect(download.fileName).toBe(`Candidate.${kind}`);
      expect(download.blob.type).toBe(kind === "pdf" ? PDF_MIME : DOCX_MIME);
      expect(persistedResumes).toHaveLength(1);
      expect(persistedTexts).toHaveLength(1);
      expect(persistedFiles).toHaveLength(1);
      expect(persistedTexts[0]?.text).toContain(expectedText);
      expect(Object.prototype.toString.call(persistedFiles[0]?.blob)).toBe("[object Blob]");
      expect(Number.isNaN(Date.parse(persistedResumes[0]!.uploadedAt))).toBe(false);
      expect(persistedResumes[0]!.uploadedAt).toBe(new Date(persistedResumes[0]!.uploadedAt).toISOString());
      expect(fetchSpy).not.toHaveBeenCalled();
    },
  );

  it.each([
    {
      label: "unsupported extension",
      file: () => new File(["plain text"], "resume.txt", { type: "text/plain" }),
      code: "unsupported-format",
      action: "choose-pdf-or-docx",
    },
    {
      label: "mismatched MIME",
      file: () => new File([new Uint8Array(makePdf("secret body"))], "resume.pdf", { type: DOCX_MIME }),
      code: "type-mismatch",
      action: "choose-matching-file",
    },
    {
      label: "missing MIME",
      file: () => new File([new Uint8Array(makePdf("secret body"))], "resume.pdf", { type: "" }),
      code: "type-mismatch",
      action: "choose-matching-file",
    },
    {
      label: "forged PDF",
      file: () => new File(["secret forged bytes"], "resume.pdf", { type: PDF_MIME }),
      code: "invalid-file",
      action: "choose-valid-file",
    },
    {
      label: "truncated PDF signature",
      file: () => new File(["%PDF-1.7 secret forged bytes"], "resume.pdf", { type: PDF_MIME }),
      code: "invalid-file",
      action: "choose-valid-file",
    },
    {
      label: "forged DOCX",
      file: () => new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x73, 0x65, 0x63, 0x72, 0x65, 0x74])], "resume.docx", { type: DOCX_MIME }),
      code: "invalid-file",
      action: "choose-valid-file",
    },
    {
      label: "oversized file",
      file: () => new File([new Uint8Array(MAX_RESUME_FILE_SIZE + 1)], "resume.pdf", { type: PDF_MIME }),
      code: "file-too-large",
      action: "choose-smaller-file",
    },
  ])("rejects $label before writing and returns sanitized recovery metadata", async ({ file: makeFile, code, action }) => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const databaseName = `resume-invalid-${crypto.randomUUID()}`;
    databaseNames.add(databaseName);
    const database = await openTestDatabase(databaseName);
    const ingestion = service(database);

    const rejection = await ingestion.ingest(makeFile()).catch((error: unknown) => error);

    expect(rejection).toBeInstanceOf(ResumeIngestionError);
    expect(rejection).toMatchObject({ code, action: { code: action } });
    expect((rejection as ResumeIngestionError).metadata).toMatchObject({ fileName: expect.any(String) });
    expect(JSON.stringify(rejection)).not.toContain("secret");
    expect(await records(database, STORE_NAMES.resumes)).toHaveLength(0);
    expect(await records(database, STORE_NAMES.originalFiles)).toHaveLength(0);
    expect(await records(database, STORE_NAMES.resumeTexts)).toHaveLength(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("reports a duplicate hash without creating a second version", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const databaseName = `resume-duplicate-${crypto.randomUUID()}`;
    databaseNames.add(databaseName);
    const database = await openTestDatabase(databaseName);
    const ingestion = service(database);
    const file = makeResumeFile("pdf", "duplicate resume text");
    const first = await ingestion.ingest(file);

    const rejection = await ingestion.ingest(file).catch((error: unknown) => error);

    expect(rejection).toBeInstanceOf(ResumeIngestionError);
    expect(rejection).toMatchObject({
      code: "duplicate-file",
      action: { code: "use-existing-resume" },
      existingResumeId: first.resume.id,
    });
    expect(await records(database, STORE_NAMES.resumes)).toHaveLength(1);
    expect(await records(database, STORE_NAMES.originalFiles)).toHaveLength(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("keeps the exact original Blob and safe diagnostics when extraction fails", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const logs: ResumeIngestionLogEntry[] = [];
    const databaseName = `resume-failed-${crypto.randomUUID()}`;
    databaseNames.add(databaseName);
    const database = await openTestDatabase(databaseName);
    const file = makeResumeFile("pdf", "private source body");
    const originalBytes = new Uint8Array(await file.arrayBuffer());
    const ingestion = service(database, {
      parseText: async () => {
        throw new Error("parser accidentally echoed private source body");
      },
      logger: (entry) => logs.push(entry),
    });

    const result = await ingestion.ingest(file);

    expect(result).toMatchObject({
      outcome: "extraction-failed",
      resume: { status: "extraction-failed" },
      recovery: { action: { code: "paste-or-correct-text" } },
    });
    expect(result.extractedText).toBeUndefined();
    expect(await records(database, STORE_NAMES.resumeTexts)).toHaveLength(0);
    const restored = await ingestion.getOriginalFile(result.resume.id);
    expect(new Uint8Array(await restored!.blob.arrayBuffer())).toEqual(originalBytes);
    const serializedDiagnostics = JSON.stringify({ logs, recovery: result.recovery });
    expect(serializedDiagnostics).not.toContain("private source body");
    expect(serializedDiagnostics).not.toContain("parser accidentally echoed");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("retries extraction from the stored Blob and preserves the original bytes", async () => {
    const databaseName = `resume-retry-${crypto.randomUUID()}`;
    databaseNames.add(databaseName);
    const database = await openTestDatabase(databaseName);
    const file = makeResumeFile("docx", "retry source text");
    const originalBytes = new Uint8Array(await file.arrayBuffer());
    let fail = true;
    const ingestion = service(database, {
      parseText: async () => {
        if (fail) throw new Error("failed");
        return "retry extracted text";
      },
    });
    const failed = await ingestion.ingest(file);
    fail = false;

    const retried = await ingestion.retryExtraction(failed.resume.id);

    expect(retried).toMatchObject({
      outcome: "needs-review",
      resume: { id: failed.resume.id, status: "needs-review", textSource: "extracted" },
      extractedText: { kind: "extracted", text: "retry extracted text" },
    });
    expect(new Uint8Array(await (await ingestion.getOriginalFile(failed.resume.id))!.blob.arrayBuffer())).toEqual(originalBytes);
    expect(await records(database, STORE_NAMES.resumeTexts)).toHaveLength(1);
  });

  it("upgrades version-three resume records with the hash index without changing identity", async () => {
    const databaseName = `resume-migration-${crypto.randomUUID()}`;
    databaseNames.add(databaseName);
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(databaseName, 3);
      request.addEventListener("upgradeneeded", () => {
        const store = request.result.createObjectStore(STORE_NAMES.resumes, { keyPath: "id" });
        store.put({
          id: "legacy-resume",
          name: "Legacy",
          type: "pdf",
          fileName: "legacy.pdf",
          fileSize: 123,
          fileHash: "abc",
          uploadedAt: "2025-01-01T00:00:00.000Z",
          tags: [],
          note: "",
          status: "needs-review",
          createdAt: "2025-01-01T00:00:00.000Z",
          updatedAt: "2025-01-01T00:00:00.000Z",
        });
      });
      request.addEventListener("error", () => reject(request.error));
      request.addEventListener("success", () => {
        request.result.close();
        resolve();
      });
    });

    const database = await openTestDatabase(databaseName);
    const transaction = database.transaction(STORE_NAMES.resumes, "readonly");
    const store = transaction.objectStore(STORE_NAMES.resumes);
    const legacy = await requestToPromise<Resume>(store.get("legacy-resume"));
    const indexed = await requestToPromise<Resume[]>(store.index("fileHash").getAll("abc"));
    await transactionToPromise(transaction);

    expect(database.version).toBe(DATABASE_VERSION);
    expect(legacy.id).toBe("legacy-resume");
    expect(indexed).toHaveLength(1);
  });
});
