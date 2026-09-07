import { afterEach, describe, expect, it, vi } from "vitest";

import {
  deleteCareerDatabase,
  openCareerDatabase,
  requestToPromise,
  runTransaction,
} from "../../src/db/database";
import { STORE_NAMES } from "../../src/db/schema";
import type {
  ApplicationTimelineEvent,
  Resume,
  ResumeText,
  Stage,
} from "../../src/db/types";
import {
  ApplicationConfirmationRequired,
  ApplicationService,
} from "../../src/features/applications/applicationService";

const databaseNames = new Set<string>();
const databases = new Set<IDBDatabase>();

async function setup() {
  const name = `application-service-${crypto.randomUUID()}`;
  databaseNames.add(name);
  const database = await openCareerDatabase({ name });
  databases.add(database);
  let now = "2026-09-01T08:00:00.000Z";
  let sequence = 0;
  const service = new ApplicationService(database, {
    now: () => now,
    createId: () => `generated-${++sequence}`,
  });
  const setNow = (value: string) => { now = value; };
  return { database, service, setNow };
}

async function addStage(database: IDBDatabase, id: string, name: string): Promise<void> {
  const timestamp = "2026-09-01T07:00:00.000Z";
  const stage: Stage = {
    id,
    createdAt: timestamp,
    updatedAt: timestamp,
    name,
    color: "#334155",
    order: 0,
    kind: "normal",
  };
  await runTransaction(database, STORE_NAMES.stages, "readwrite", (transaction) =>
    requestToPromise(transaction.objectStore(STORE_NAMES.stages).add(stage)),
  );
}

async function addReadyResume(
  database: IDBDatabase,
  id: string,
  name: string,
  text: string,
): Promise<void> {
  const timestamp = "2026-09-01T07:00:00.000Z";
  const resume: Resume = {
    id,
    createdAt: timestamp,
    updatedAt: timestamp,
    name,
    type: "pdf",
    fileName: `${name}.pdf`,
    fileSize: 10,
    fileHash: `hash-${id}`,
    uploadedAt: timestamp,
    tags: [],
    note: "",
    status: "ready",
    textSource: "extracted",
    textConfirmedAt: timestamp,
  };
  const confirmed: ResumeText = {
    id: `text-${id}`,
    createdAt: timestamp,
    updatedAt: timestamp,
    resumeId: id,
    kind: "confirmed",
    text,
    confirmedAt: timestamp,
  };
  await runTransaction(
    database,
    [STORE_NAMES.resumes, STORE_NAMES.resumeTexts],
    "readwrite",
    async (transaction) => {
      await requestToPromise(transaction.objectStore(STORE_NAMES.resumes).add(resume));
      await requestToPromise(transaction.objectStore(STORE_NAMES.resumeTexts).add(confirmed));
    },
  );
}

afterEach(async () => {
  vi.unstubAllGlobals();
  databases.forEach((database) => database.close());
  databases.clear();
  await Promise.all([...databaseNames].map((name) => deleteCareerDatabase(name)));
  databaseNames.clear();
});

describe("ApplicationService", () => {
  it("creates and edits every application field while preserving stable metadata", async () => {
    const { database, service, setNow } = await setup();
    await addStage(database, "stage-saved", "收藏");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const created = await service.createApplication({
      company: "Example Inc",
      position: "Frontend Engineer",
      jobType: "graduate",
      location: "Shanghai",
      workMode: "hybrid",
      salaryText: "20k-25k",
      source: "Career fair",
      jobUrl: "https://jobs.example.test/role/1",
      deadline: "2026-10-01T18:00:00+08:00",
      contact: "Recruiter",
      priority: 3,
      note: "Initial note",
      stageId: "stage-saved",
      jdText: "Confirmed pasted JD",
    });

    expect(await service.getApplication(created.id)).toEqual(created);
    expect(await service.getConfirmedJobDescription(created.id)).toBe("Confirmed pasted JD");
    expect(fetchSpy).not.toHaveBeenCalled();

    setNow("2026-09-01T09:00:00.000Z");
    const updated = await service.updateApplication(created.id, {
      company: "Example Technology",
      position: "Senior Frontend Engineer",
      jobType: "tech",
      location: "Shenzhen",
      workMode: "remote",
      salaryText: "25k-30k",
      source: "Referral",
      jobUrl: "https://jobs.example.test/role/2",
      deadline: "2026-10-08T10:00:00.000Z",
      contact: "Hiring manager",
      priority: 5,
      note: "Updated note",
    });

    expect(updated).toMatchObject({
      id: created.id,
      createdAt: created.createdAt,
      updatedAt: "2026-09-01T09:00:00.000Z",
      company: "Example Technology",
      position: "Senior Frontend Engineer",
      jobType: "tech",
      location: "Shenzhen",
      workMode: "remote",
      salaryText: "25k-30k",
      source: "Referral",
      jobUrl: "https://jobs.example.test/role/2",
      deadline: "2026-10-08T10:00:00.000Z",
      contact: "Hiring manager",
      priority: 5,
      note: "Updated note",
    });

    await expect(service.updateApplication(created.id, {
      deadline: "October 8, 2026",
    })).rejects.toThrow(/deadline.*ISO/i);
  });

  it("rejects protected workflow fields passed through an untyped metadata patch", async () => {
    const { database, service } = await setup();
    await addStage(database, "stage-one", "One");
    await addStage(database, "stage-two", "Two");
    const application = await service.createApplication({
      company: "Protected",
      position: "Engineer",
      jobType: "other",
      location: "",
      workMode: "unknown",
      salaryText: "",
      source: "",
      jobUrl: "",
      contact: "",
      priority: 0,
      note: "",
      stageId: "stage-one",
    });

    await expect(service.updateApplication(application.id, {
      stageId: "stage-two",
      currentResumeId: "resume-without-snapshot",
      archivedAt: "2026-09-01T09:00:00.000Z",
      jdText: "untracked replacement",
    } as never)).rejects.toThrow(/workflow field/i);
    expect(await service.getApplication(application.id)).toMatchObject({
      stageId: "stage-one",
      jdText: "",
    });
    expect(await service.listTimeline(application.id)).toHaveLength(0);
  });

  it("keeps one current resume and appends immutable snapshots and timeline events", async () => {
    const { database, service, setNow } = await setup();
    await addStage(database, "stage-applied", "已申请");
    await addReadyResume(database, "resume-a", "Resume A", "Confirmed A");
    await addReadyResume(database, "resume-b", "Resume B", "Confirmed B");
    const application = await service.createApplication({
      company: "Example",
      position: "Engineer",
      jobType: "general",
      location: "",
      workMode: "unknown",
      salaryText: "",
      source: "",
      jobUrl: "",
      contact: "",
      priority: 0,
      note: "",
      stageId: "stage-applied",
    });

    setNow("2026-09-01T08:30:00.000Z");
    await service.bindResume(application.id, "resume-a");
    setNow("2026-09-01T09:30:00.000Z");
    await service.bindResume(application.id, "resume-b");

    expect((await service.getApplication(application.id))?.currentResumeId).toBe("resume-b");
    expect(await service.listResumeUsageHistory(application.id)).toMatchObject([
      { resumeId: "resume-a", resumeNameSnapshot: "Resume A", textSnapshot: "Confirmed A" },
      { resumeId: "resume-b", resumeNameSnapshot: "Resume B", textSnapshot: "Confirmed B" },
    ]);
    const resumeEvents = (await service.listTimeline(application.id))
      .filter(({ type }) => type === "resume-changed");
    expect(resumeEvents[0]?.fromValue).toBeUndefined();
    expect(resumeEvents).toMatchObject([
      { toValue: "resume-a" },
      { fromValue: "resume-a", toValue: "resume-b" },
    ]);
  });

  it("commits stage, note, and archive changes with ordered events and rolls back failed events", async () => {
    const { database, service, setNow } = await setup();
    await addStage(database, "stage-one", "One");
    await addStage(database, "stage-two", "Two");
    const application = await service.createApplication({
      company: "Atomic",
      position: "Engineer",
      jobType: "other",
      location: "",
      workMode: "unknown",
      salaryText: "",
      source: "",
      jobUrl: "",
      contact: "",
      priority: 0,
      note: "",
      stageId: "stage-one",
    });

    setNow("2026-09-01T08:10:00.000Z");
    await service.changeStage(application.id, "stage-two");
    setNow("2026-09-01T08:20:00.000Z");
    await service.updateNote(application.id, "Follow up");
    const archivePreview = await service.previewArchive(application.id);
    await expect(service.archiveApplication(application.id)).rejects.toBeInstanceOf(ApplicationConfirmationRequired);
    expect((await service.getApplication(application.id))?.archivedAt).toBeUndefined();
    setNow("2026-09-01T08:30:00.000Z");
    await service.confirmArchive(application.id, archivePreview);

    expect((await service.listTimeline(application.id)).map(({ type }) => type)).toEqual([
      "stage-changed",
      "note-added",
      "archived",
    ]);

    const conflict: ApplicationTimelineEvent = {
      id: "event-conflict",
      createdAt: "2026-09-01T09:00:00.000Z",
      updatedAt: "2026-09-01T09:00:00.000Z",
      applicationId: application.id,
      type: "note-added",
      note: "existing",
    };
    await runTransaction(database, STORE_NAMES.applicationTimelineEvents, "readwrite", (transaction) =>
      requestToPromise(transaction.objectStore(STORE_NAMES.applicationTimelineEvents).add(conflict)),
    );
    const failingService = new ApplicationService(database, {
      now: () => "2026-09-01T10:00:00.000Z",
      createId: () => "event-conflict",
    });
    await expect(failingService.changeStage(application.id, "stage-one")).rejects.toBeDefined();
    expect((await service.getApplication(application.id))?.stageId).toBe("stage-two");
  });

  it("requires matching delete confirmation and preserves history after deletion", async () => {
    const { database, service } = await setup();
    await addStage(database, "stage", "Stage");
    await addReadyResume(database, "resume", "Resume", "Snapshot");
    const application = await service.createApplication({
      company: "Delete Me",
      position: "Engineer",
      jobType: "other",
      location: "",
      workMode: "unknown",
      salaryText: "",
      source: "",
      jobUrl: "",
      contact: "",
      priority: 0,
      note: "",
      stageId: "stage",
    });
    await service.bindResume(application.id, "resume");
    const preview = await service.previewDelete(application.id);

    await expect(service.deleteApplication(application.id)).rejects.toBeInstanceOf(ApplicationConfirmationRequired);
    await expect(service.confirmDelete(application.id, { ...preview, id: "other" })).rejects.toThrow(/preview/i);
    expect(await service.getApplication(application.id)).toBeDefined();

    await service.confirmDelete(application.id, preview);
    expect(await service.getApplication(application.id)).toBeUndefined();
    expect(await service.listResumeUsageHistory(application.id)).toHaveLength(1);
    expect(await service.listTimeline(application.id)).toHaveLength(1);
  });

  it("cascades deletion to interviews, analysis results, and AI conversations", async () => {
    const { database, service } = await setup();
    await addStage(database, "stage", "Stage");
    const application = await service.createApplication({
      company: "Cascade", position: "Engineer", jobType: "other", location: "", workMode: "unknown",
      salaryText: "", source: "", jobUrl: "", contact: "", priority: 0, note: "", stageId: "stage",
    });
    const now = "2026-09-01T09:00:00.000Z";
    await runTransaction(database, [STORE_NAMES.interviews, STORE_NAMES.analysisResults, STORE_NAMES.aiConversations], "readwrite", async (tx) => {
      await requestToPromise(tx.objectStore(STORE_NAMES.interviews).add({ id: "iv-1", createdAt: now, updatedAt: now, applicationId: application.id, round: 1, type: "video", title: "T", startsAt: now, timezone: "UTC", locationOrLink: "", interviewer: "", status: "scheduled", reminders: [], note: "" }));
      await requestToPromise(tx.objectStore(STORE_NAMES.analysisResults).add({ id: "an-1", createdAt: now, updatedAt: now, applicationId: application.id, resumeId: "r-1", mode: "local", coverage: { overall: 0, required: 0, preferred: 0 }, matchedKeywords: [], weakMatches: [], missingKeywords: [], evidence: [], uncertainItems: [], recommendations: [] }));
      await requestToPromise(tx.objectStore(STORE_NAMES.aiConversations).add({ id: "ai-1", createdAt: now, updatedAt: now, applicationId: application.id, messages: [] }));
    });

    const preview = await service.previewDelete(application.id);
    await service.confirmDelete(application.id, preview);

    const remaining = await runTransaction(database, [STORE_NAMES.interviews, STORE_NAMES.analysisResults, STORE_NAMES.aiConversations], "readonly", async (tx) => ({
      interviews: await requestToPromise<unknown[]>(tx.objectStore(STORE_NAMES.interviews).index("applicationId").getAll(application.id)),
      analyses: await requestToPromise<unknown[]>(tx.objectStore(STORE_NAMES.analysisResults).index("applicationId").getAll(application.id)),
      conversations: await requestToPromise<unknown[]>(tx.objectStore(STORE_NAMES.aiConversations).index("applicationId").getAll(application.id)),
    }));
    expect(remaining.interviews).toHaveLength(0);
    expect(remaining.analyses).toHaveLength(0);
    expect(remaining.conversations).toHaveLength(0);
  });
});
