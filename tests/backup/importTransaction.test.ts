import { afterEach, describe, expect, it } from "vitest";

import { exportBackup } from "../../src/backup/crypto";
import {
  buildImportPlan,
  commitBackupImport,
  prepareBackupImport,
  type BackupConflictResolution,
} from "../../src/backup/importTransaction";
import {
  deleteCareerDatabase,
  openCareerDatabase,
  requestToPromise,
  transactionToPromise,
} from "../../src/db/database";
import { STORE_NAMES, type StoreName } from "../../src/db/schema";

const databaseNames = new Set<string>();
const connections = new Set<IDBDatabase>();
const timestamp = "2026-09-03T08:00:00.000Z";

function nextName(label: string): string {
  const name = `${label}-${crypto.randomUUID()}`;
  databaseNames.add(name);
  return name;
}

async function openDatabase(name: string): Promise<IDBDatabase> {
  const database = await openCareerDatabase({ name });
  connections.add(database);
  return database;
}

async function writeRecords(
  database: IDBDatabase,
  records: Partial<Record<StoreName, Array<Record<string, unknown>>>>,
): Promise<void> {
  const storeNames = Object.keys(records) as StoreName[];
  const transaction = database.transaction(storeNames, "readwrite");
  for (const storeName of storeNames) {
    for (const record of records[storeName] ?? []) {
      transaction.objectStore(storeName).add(record);
    }
  }
  await transactionToPromise(transaction);
}

async function readAll(database: IDBDatabase, storeName: StoreName): Promise<unknown[]> {
  const transaction = database.transaction(storeName, "readonly");
  const records = await requestToPromise<unknown[]>(transaction.objectStore(storeName).getAll());
  await transactionToPromise(transaction);
  return records;
}

async function snapshot(database: IDBDatabase): Promise<Record<string, unknown[]>> {
  return Object.fromEntries(
    await Promise.all(
      Object.values(STORE_NAMES).map(async (storeName) => [storeName, await readAll(database, storeName)]),
    ),
  );
}

function stage(id = "stage-1", name = "Applied") {
  return { id, createdAt: timestamp, updatedAt: timestamp, name, color: "#334155", order: 1, kind: "normal" };
}

function resume(id = "resume-1", name = "Backup resume") {
  return {
    id,
    createdAt: timestamp,
    updatedAt: timestamp,
    name,
    type: "pdf",
    fileName: "resume.pdf",
    fileSize: 6,
    fileHash: "hash-1",
    uploadedAt: timestamp,
    tags: [],
    note: "",
    status: "ready",
    textSource: "extracted",
    textConfirmedAt: timestamp,
    originalFileId: "file-1",
  };
}

function application(id = "app-1", company = "Backup Co") {
  return {
    id,
    createdAt: timestamp,
    updatedAt: timestamp,
    company,
    position: "Engineer",
    jobType: "tech",
    location: "Shanghai",
    workMode: "hybrid",
    salaryText: "",
    source: "manual",
    jobUrl: "",
    jdText: "TypeScript",
    currentResumeId: "resume-1",
    stageId: "stage-1",
    priority: 1,
    contact: "",
    note: "",
  };
}

async function createBackupDatabase(name: string): Promise<IDBDatabase> {
  const database = await openDatabase(name);
  const blob = await new Response("resume", { headers: { "content-type": "application/pdf" } }).blob();
  await writeRecords(database, {
    stages: [stage()],
    resumes: [resume()],
    resumeTexts: [
      { id: "text-1", createdAt: timestamp, updatedAt: timestamp, resumeId: "resume-1", kind: "confirmed", text: "TypeScript" },
    ],
    applications: [application()],
    resumeUsageHistory: [
      { id: "usage-1", createdAt: timestamp, updatedAt: timestamp, applicationId: "app-1", resumeId: "resume-1", resumeNameSnapshot: "Backup resume", textSnapshot: "TypeScript", usedAt: timestamp },
    ],
    applicationTimelineEvents: [
      { id: "timeline-1", createdAt: timestamp, updatedAt: timestamp, applicationId: "app-1", type: "resume-changed", toValue: "resume-1", note: "" },
    ],
    interviews: [
      { id: "interview-1", createdAt: timestamp, updatedAt: timestamp, applicationId: "app-1", round: 1, type: "video", title: "Interview", startsAt: "2026-09-10T08:00:00.000Z", timezone: "Asia/Shanghai", locationOrLink: "https://example.test", interviewer: "", status: "scheduled", reminders: [], note: "" },
    ],
    interviewReviews: [
      { id: "review-1", createdAt: timestamp, updatedAt: timestamp, interviewId: "interview-1", questions: [], goodAnswers: "", weakAnswers: "", observedSignals: "", salaryDiscussion: "", nextStep: "", privateNote: "" },
    ],
    reminderFailures: [
      { id: "failure-1", createdAt: timestamp, updatedAt: timestamp, interviewId: "interview-1", reminderAt: timestamp, reason: "denied" },
    ],
    analysisResults: [
      { id: "analysis-1", createdAt: timestamp, updatedAt: timestamp, applicationId: "app-1", resumeId: "resume-1", mode: "local", coverage: { overall: 100, required: 100, preferred: 100 }, matchedKeywords: ["TypeScript"], weakMatches: [], missingKeywords: [], evidence: [], uncertainItems: [], recommendations: [] },
    ],
    aiConversations: [
      { id: "conversation-1", createdAt: timestamp, updatedAt: timestamp, applicationId: "app-1", messages: [] },
    ],
    originalFiles: [
      { id: "file-1", createdAt: timestamp, updatedAt: timestamp, ownerType: "resume", ownerId: "resume-1", fileName: "resume.pdf", fileType: "pdf", blob },
    ],
  });
  return database;
}

afterEach(async () => {
  connections.forEach((database) => database.close());
  connections.clear();
  await Promise.all([...databaseNames].map((name) => deleteCareerDatabase(name)));
  databaseNames.clear();
});

describe("atomic backup import", () => {
  it("prepares a read-only summary and defaults every conflict to keep-local", async () => {
    const source = await createBackupDatabase(nextName("backup-source"));
    const envelope = await exportBackup(source, { kind: "full", password: "pw" });
    const target = await openDatabase(nextName("backup-target"));
    await writeRecords(target, {
      stages: [stage("stage-1", "Local stage")],
      resumes: [resume("resume-1", "Local resume")],
      applications: [application("app-1", "Local Co")],
    });
    const before = await snapshot(target);

    const session = await prepareBackupImport(target, envelope, "pw");

    expect(session.version).toBe(1);
    expect(session.kind).toBe("full");
    expect(session.storeCounts).toMatchObject({ applications: 1, resumes: 1, resumeTexts: 1 });
    expect(session.blobCount).toBe(1);
    expect(session.conflicts).toEqual(expect.arrayContaining([
      expect.objectContaining({ storeName: "applications", id: "app-1", defaultResolution: "keep-local" }),
      expect.objectContaining({ storeName: "resumes", id: "resume-1", defaultResolution: "keep-local" }),
    ]));
    expect(buildImportPlan(session).records.applications).toEqual([]);
    expect(await snapshot(target)).toEqual(before);
  });

  it("imports conflict copies with stable new ids and remaps every relationship", async () => {
    const source = await createBackupDatabase(nextName("copy-source"));
    const envelope = await exportBackup(source, { kind: "full", password: "pw" });
    const target = await openDatabase(nextName("copy-target"));
    await writeRecords(target, {
      stages: [stage("stage-1", "Local stage")],
      resumes: [resume("resume-1", "Local resume")],
      applications: [application("app-1", "Local Co")],
      interviews: [{ id: "interview-1", createdAt: timestamp, updatedAt: timestamp, applicationId: "app-1", round: 1, type: "video", title: "Local interview", startsAt: "2026-09-11T08:00:00.000Z", timezone: "Asia/Shanghai", locationOrLink: "", interviewer: "", status: "scheduled", reminders: [], note: "" }],
      originalFiles: [{ id: "file-1", createdAt: timestamp, updatedAt: timestamp, ownerType: "resume", ownerId: "resume-1", fileName: "local.pdf", fileType: "pdf", blob: await new Response("local", { headers: { "content-type": "application/pdf" } }).blob() }],
    });
    const session = await prepareBackupImport(target, envelope, "pw");
    const resolutions: BackupConflictResolution[] = session.conflicts.map((conflict) => ({
      storeName: conflict.storeName,
      id: conflict.id,
      resolution: "import-copy",
    }));

    const plan = buildImportPlan(session, resolutions, {
      createId: (storeName, id) => `copy-${storeName}-${id}`,
    });
    await commitBackupImport(target, plan);

    const copiedResume = (await readAll(target, STORE_NAMES.resumes)).find((item) => (item as { id: string }).id.startsWith("copy-resumes")) as Record<string, unknown>;
    const copiedApplication = (await readAll(target, STORE_NAMES.applications)).find((item) => (item as { id: string }).id.startsWith("copy-applications")) as Record<string, unknown>;
    const copiedInterview = (await readAll(target, STORE_NAMES.interviews)).find((item) => (item as { id: string }).id.startsWith("copy-interviews")) as Record<string, unknown>;
    const copiedFile = (await readAll(target, STORE_NAMES.originalFiles)).find((item) => (item as { id: string }).id.startsWith("copy-originalFiles")) as Record<string, unknown>;

    expect(copiedApplication).toMatchObject({ currentResumeId: copiedResume.id });
    expect(copiedResume.originalFileId).toBe(copiedFile.id);
    expect(copiedFile.ownerId).toBe(copiedResume.id);
    expect((copiedFile.blob as Blob).size).toBe(6);
    expect(copiedInterview.applicationId).toBe(copiedApplication.id);
    expect(await readAll(target, STORE_NAMES.resumeTexts)).toContainEqual(expect.objectContaining({ resumeId: copiedResume.id }));
    expect(await readAll(target, STORE_NAMES.resumeUsageHistory)).toContainEqual(expect.objectContaining({ applicationId: copiedApplication.id, resumeId: copiedResume.id }));
    expect(await readAll(target, STORE_NAMES.applicationTimelineEvents)).toContainEqual(expect.objectContaining({ applicationId: copiedApplication.id, toValue: copiedResume.id }));
    expect(await readAll(target, STORE_NAMES.analysisResults)).toContainEqual(expect.objectContaining({ applicationId: copiedApplication.id, resumeId: copiedResume.id }));
    expect(await readAll(target, STORE_NAMES.aiConversations)).toContainEqual(expect.objectContaining({ applicationId: copiedApplication.id }));
    expect(await readAll(target, STORE_NAMES.interviewReviews)).toContainEqual(expect.objectContaining({ interviewId: copiedInterview.id }));
    expect(await readAll(target, STORE_NAMES.reminderFailures)).toContainEqual(expect.objectContaining({ interviewId: copiedInterview.id }));
  });

  it("uses the backup record only for conflicts explicitly selected for overwrite", async () => {
    const source = await createBackupDatabase(nextName("overwrite-source"));
    const envelope = await exportBackup(source, { kind: "light", password: "pw" });
    const target = await openDatabase(nextName("overwrite-target"));
    await writeRecords(target, { applications: [application("app-1", "Local Co")] });
    const session = await prepareBackupImport(target, envelope, "pw");

    await commitBackupImport(target, buildImportPlan(session, [
      { storeName: STORE_NAMES.applications, id: "app-1", resolution: "use-backup" },
    ]));

    expect(await readAll(target, STORE_NAMES.applications)).toContainEqual(expect.objectContaining({ id: "app-1", company: "Backup Co" }));
  });

  it("aborts all stores on an index failure and persists a successful import after reopening", async () => {
    const source = await createBackupDatabase(nextName("atomic-source"));
    const envelope = await exportBackup(source, { kind: "full", password: "pw" });
    const targetName = nextName("atomic-target");
    let target = await openDatabase(targetName);
    await writeRecords(target, {
      resumeTexts: [{ id: "local-text", createdAt: timestamp, updatedAt: timestamp, resumeId: "resume-1", kind: "confirmed", text: "local" }],
      aiConversations: [{ id: "local-chat", createdAt: timestamp, updatedAt: timestamp, applicationId: "local-app", messages: [] }],
    });
    const before = await snapshot(target);
    const failingPlan = buildImportPlan(await prepareBackupImport(target, envelope, "pw"));

    await expect(commitBackupImport(target, failingPlan)).rejects.toThrow();
    expect(await snapshot(target)).toEqual(before);

    const cleanName = nextName("persistent-target");
    let clean = await openDatabase(cleanName);
    const plan = buildImportPlan(await prepareBackupImport(clean, envelope, "pw"));
    await commitBackupImport(clean, plan);
    clean.close();
    connections.delete(clean);
    clean = await openDatabase(cleanName);

    expect(await readAll(clean, STORE_NAMES.applications)).toContainEqual(expect.objectContaining({ id: "app-1" }));
    const files = await readAll(clean, STORE_NAMES.originalFiles) as Array<{ id: string; blob: Blob }>;
    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({ id: "file-1" });
    expect(files[0].blob.size).toBe(6);
    expect(files[0].blob.type).toBe("application/pdf");

    const repeated = await prepareBackupImport(clean, envelope, "pw");
    expect(repeated.conflicts.length).toBeGreaterThan(0);
    expect(buildImportPlan(repeated).records.applications).toEqual([]);
  });

  it("rejects invalid backup records and cancellation without changing local data", async () => {
    const source = await createBackupDatabase(nextName("invalid-source"));
    const target = await openDatabase(nextName("invalid-target"));
    await writeRecords(target, { resumes: [resume("resume-local", "Must remain")] });
    const before = await snapshot(target);
    const envelope = await exportBackup(source, { kind: "full", password: "pw" });

    await expect(prepareBackupImport(target, envelope, "wrong-password")).rejects.toThrow();
    const session = await prepareBackupImport(target, envelope, "pw");
    expect(() => buildImportPlan(session, null)).toThrow(/cancel/i);
    expect(await snapshot(target)).toEqual(before);

    const malformedSource = await openDatabase(nextName("malformed-source"));
    const malformedApplication = application("malformed-app");
    delete (malformedApplication as Record<string, unknown>).company;
    await writeRecords(malformedSource, { applications: [malformedApplication] });
    const malformedEnvelope = await exportBackup(malformedSource, { kind: "light", password: "pw" });
    await expect(prepareBackupImport(target, malformedEnvelope, "pw")).rejects.toThrow(/applications.company/);
    expect(await snapshot(target)).toEqual(before);
  });
});
