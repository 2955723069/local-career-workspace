import { afterEach, describe, expect, it, vi } from "vitest";

import {
  deleteCareerDatabase,
  openCareerDatabase,
  requestToPromise,
  transactionToPromise,
} from "../../src/db/database";
import { STORE_NAMES } from "../../src/db/schema";
import type { Application, JobDescription, JobDescriptionText, StoredFile } from "../../src/db/types";
import {
  JobDescriptionIngestionError,
  JobDescriptionService,
  MAX_JOB_DESCRIPTION_FILE_SIZE,
} from "../../src/features/job-descriptions/jobDescriptionService";
import { DOCX_MIME, PDF_MIME, makeDocx, makePdf } from "../resume/fixtures";

const databaseNames = new Set<string>();
const connections = new Set<IDBDatabase>();
const now = "2026-09-01T08:30:00.000Z";

async function openTestDatabase(name: string) {
  const db = await openCareerDatabase({ name });
  connections.add(db);
  return db;
}

function service(db: IDBDatabase, overrides: ConstructorParameters<typeof JobDescriptionService>[1] = {}) {
  let sequence = 0;
  return new JobDescriptionService(db, {
    now: () => now,
    createId: () => `jd-${++sequence}`,
    ...overrides,
  });
}

async function record<T>(db: IDBDatabase, storeName: string): Promise<T[]> {
  const tx = db.transaction(storeName, "readonly");
  const values = await requestToPromise<T[]>(tx.objectStore(storeName).getAll());
  await transactionToPromise(tx);
  return values;
}

function bytesPart(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer as ArrayBuffer;
}

async function createApplication(db: IDBDatabase, id = "application-1") {
  const tx = db.transaction(STORE_NAMES.applications, "readwrite");
  await requestToPromise(tx.objectStore(STORE_NAMES.applications).add({
    id,
    createdAt: now,
    updatedAt: now,
    company: "Example",
    position: "Engineer",
    jobType: "general",
    location: "Remote",
    workMode: "remote",
    salaryText: "",
    source: "",
    jobUrl: "",
    jdText: "",
    stageId: "stage-1",
    priority: 0,
    contact: "",
    note: "",
  } satisfies Application));
  await transactionToPromise(tx);
}

afterEach(async () => {
  vi.unstubAllGlobals();
  connections.forEach((db) => db.close());
  connections.clear();
  await Promise.all([...databaseNames].map((name) => deleteCareerDatabase(name)));
  databaseNames.clear();
});

describe("job description ingestion", () => {
  it("stores pasted text separately and only exposes it to matching after confirmation", async () => {
    const name = `jd-paste-${crypto.randomUUID()}`;
    databaseNames.add(name);
    const db = await openTestDatabase(name);
    await createApplication(db);
    const ingestion = service(db);

    const imported = await ingestion.ingestPaste("application-1", "private pasted JD");
    expect(imported.jobDescription.textSource).toBe("pasted");
    expect(imported.text.kind).toBe("pasted");
    expect((await ingestion.getConfirmedText(imported.jobDescription.id))).toBeUndefined();
    expect((await record<Application>(db, STORE_NAMES.applications))[0]?.jdText).toBe("");

    const confirmed = await ingestion.confirmText(imported.jobDescription.id, "private pasted JD");
    expect(confirmed.text.kind).toBe("confirmed");
    expect((await ingestion.getConfirmedText(imported.jobDescription.id))).toBe("private pasted JD");
    expect((await record<Application>(db, STORE_NAMES.applications))[0]?.jdText).toBe("private pasted JD");
    expect(await record<JobDescriptionText>(db, STORE_NAMES.jobDescriptionTexts)).toHaveLength(2);
  });

  it.each([
    ["pdf", () => new File([bytesPart(makePdf("PDF JD body"))], "job.pdf", { type: PDF_MIME })],
    ["docx", () => new File([bytesPart(makeDocx("DOCX JD body"))], "job.docx", { type: DOCX_MIME })],
  ] as const)("imports a valid %s locally and keeps all representations independent", async (_kind, makeFile) => {
    const name = `jd-file-${crypto.randomUUID()}`;
    databaseNames.add(name);
    let db = await openTestDatabase(name);
    await createApplication(db);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const file = makeFile();
    const bytes = new Uint8Array(await file.arrayBuffer());
    const result = await service(db).ingestFile("application-1", file);
    expect(result.outcome).toBe("needs-review");
    expect(result.extractedText?.text).toContain("JD body");
    expect(result.jobDescription.fileHash).toMatch(/^[a-f0-9]{64}$/);
    expect(fetchSpy).not.toHaveBeenCalled();

    const confirmed = await service(db).confirmText(result.jobDescription.id, "Corrected JD");
    expect(confirmed.text.kind).toBe("manual");
    expect((await record<JobDescriptionText>(db, STORE_NAMES.jobDescriptionTexts)).map((text) => text.kind).sort())
      .toEqual(["extracted", "manual"]);
    db.close();
    db = await openTestDatabase(name);
    const reopened = service(db);
    const original = await reopened.getOriginalFile(result.jobDescription.id);
    expect(new Uint8Array(await original!.blob.arrayBuffer())).toEqual(bytes);
    expect((await reopened.getText(result.jobDescription.id, "extracted"))?.text).toContain("JD body");
    expect((await reopened.getText(result.jobDescription.id, "manual"))?.text).toBe("Corrected JD");
    expect((await record<Application>(db, STORE_NAMES.applications))[0]?.jdText).toBe("Corrected JD");
  });

  it("retains the original file and returns recoverable metadata when extraction fails", async () => {
    const name = `jd-failed-${crypto.randomUUID()}`;
    databaseNames.add(name);
    const db = await openTestDatabase(name);
    await createApplication(db);
    const file = new File([bytesPart(makePdf("private source"))], "job.pdf", { type: PDF_MIME });
    const result = await service(db, {
      parseText: async () => { throw new Error("parser echoed private source"); },
    }).ingestFile("application-1", file);
    expect(result.outcome).toBe("extraction-failed");
    expect(result.recovery?.action.code).toBe("paste-or-correct-text");
    expect(await record<StoredFile>(db, STORE_NAMES.originalFiles)).toHaveLength(1);
    expect(await record<JobDescriptionText>(db, STORE_NAMES.jobDescriptionTexts)).toHaveLength(0);
    expect(JSON.stringify(result)).not.toContain("private source");
    await expect(service(db).confirmText(result.jobDescription.id, "Manual JD")).resolves.toMatchObject({ text: { kind: "manual" } });
  });

  it.each([
    ["unsupported-format", new File(["secret"], "job.txt", { type: "text/plain" })],
    ["type-mismatch", new File([bytesPart(makePdf("secret"))], "job.pdf", { type: DOCX_MIME })],
    ["invalid-file", new File(["%PDF-1.7 secret"], "job.pdf", { type: PDF_MIME })],
    ["file-too-large", new File([new Uint8Array(MAX_JOB_DESCRIPTION_FILE_SIZE + 1)], "job.pdf", { type: PDF_MIME })],
  ] as const)("rejects %s before any write", async (code, file) => {
    const name = `jd-invalid-${crypto.randomUUID()}`;
    databaseNames.add(name);
    const db = await openTestDatabase(name);
    await createApplication(db);
    const rejection = await service(db).ingestFile("application-1", file).catch((error) => error);
    expect(rejection).toBeInstanceOf(JobDescriptionIngestionError);
    expect(rejection).toMatchObject({ code });
    expect(JSON.stringify(rejection)).not.toContain("secret");
    expect(await record<JobDescription>(db, STORE_NAMES.jobDescriptions)).toHaveLength(0);
    expect(await record<StoredFile>(db, STORE_NAMES.originalFiles)).toHaveLength(0);
    expect(vi.isMockFunction(fetch)).toBe(false);
  });

  it("rejects duplicate files for one application without a second write", async () => {
    const name = `jd-duplicate-${crypto.randomUUID()}`;
    databaseNames.add(name);
    const db = await openTestDatabase(name);
    await createApplication(db);
    const file = new File([bytesPart(makePdf("duplicate"))], "job.pdf", { type: PDF_MIME });
    const ingestion = service(db);
    await ingestion.ingestFile("application-1", file);
    const rejection = await ingestion.ingestFile("application-1", file).catch((error) => error);
    expect(rejection).toMatchObject({ code: "duplicate-file" });
    expect(await record<JobDescription>(db, STORE_NAMES.jobDescriptions)).toHaveLength(1);
  });
});
