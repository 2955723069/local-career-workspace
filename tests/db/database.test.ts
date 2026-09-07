import { afterEach, describe, expect, it, vi } from "vitest";

import {
  deleteCareerDatabase,
  openCareerDatabase,
} from "../../src/db/database";
import { createRepositories } from "../../src/db/repositories";
import { STORE_NAMES } from "../../src/db/schema";

const databaseNames = new Set<string>();
const databaseConnections = new Set<IDBDatabase>();

function nextDatabaseName(): string {
  const name = `career-db-test-${crypto.randomUUID()}`;
  databaseNames.add(name);
  return name;
}

async function openTestDatabase(name: string): Promise<IDBDatabase> {
  const database = await openCareerDatabase({ name });
  databaseConnections.add(database);
  return database;
}

afterEach(async () => {
  vi.unstubAllGlobals();
  localStorage.clear();
  databaseConnections.forEach((database) => database.close());
  databaseConnections.clear();
  await Promise.all([...databaseNames].map((name) => deleteCareerDatabase(name)));
  databaseNames.clear();
});

describe("career database repositories", () => {
  it("creates every domain and content store in the current schema", async () => {
    const database = await openTestDatabase(nextDatabaseName());

    expect([...database.objectStoreNames]).toEqual(
      expect.arrayContaining(Object.values(STORE_NAMES)),
    );

    database.close();
  });

  it("persists a structured record across a database refresh without networking", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const name = nextDatabaseName();
    let database = await openTestDatabase(name);
    let repositories = createRepositories(database);

    const resume = await repositories.resumes.create({
      name: "前端工程师简历",
      type: "pdf",
      fileName: "resume.pdf",
      fileSize: 128,
      fileHash: "sha256-local",
      uploadedAt: "2026-09-01T07:00:00.000Z",
      tags: ["校招"],
      note: "",
      status: "ready",
    });

    expect(resume.id).toBeTruthy();
    expect(Number.isNaN(Date.parse(resume.createdAt))).toBe(false);
    expect(Number.isNaN(Date.parse(resume.updatedAt))).toBe(false);
    database.close();

    database = await openTestDatabase(name);
    repositories = createRepositories(database);
    await expect(repositories.resumes.get(resume.id)).resolves.toEqual(resume);
    expect(fetchSpy).not.toHaveBeenCalled();
    database.close();
  });

  it("keeps id and createdAt stable while advancing updatedAt", async () => {
    const database = await openTestDatabase(nextDatabaseName());
    let now = "2026-09-01T08:00:00.000Z";
    const repositories = createRepositories(database, {
      now: () => now,
      createId: () => "resume-stable-id",
    });
    const resume = await repositories.resumes.create({
      name: "初版",
      type: "docx",
      fileName: "resume.docx",
      fileSize: 256,
      fileHash: "hash-1",
      uploadedAt: "2026-09-01T07:30:00.000Z",
      tags: [],
      note: "",
      status: "needs-review",
    });

    now = "2026-09-01T09:00:00.000Z";
    const updated = await repositories.resumes.update(resume.id, {
      name: "定稿",
      id: "attempted-replacement",
      createdAt: "1999-01-01T00:00:00.000Z",
    });

    expect(updated).toMatchObject({
      id: "resume-stable-id",
      createdAt: "2026-09-01T08:00:00.000Z",
      updatedAt: "2026-09-01T09:00:00.000Z",
      name: "定稿",
    });
    database.close();
  });

  it("compares offset timestamps by instant when updating a record", async () => {
    let now = "2026-09-01T09:00:00.000Z";
    const database = await openTestDatabase(nextDatabaseName());
    const repositories = createRepositories(database, {
      now: () => now,
      createId: () => "stage-offset-id",
    });
    const stage = await repositories.stages.create({
      name: "已申请",
      color: "#334155",
      order: 1,
      kind: "normal",
    });

    now = "2026-09-01T08:30:00.000-01:00";
    const updated = await repositories.stages.update(stage.id, { order: 2 });

    expect(updated.updatedAt).toBe("2026-09-01T08:30:00.000-01:00");
    database.close();
  });

  it("stores raw, confirmed, and manually corrected resume text independently", async () => {
    const database = await openTestDatabase(nextDatabaseName());
    const repositories = createRepositories(database);

    const extracted = await repositories.resumeTexts.create({
      resumeId: "resume-1",
      kind: "extracted",
      text: "raw extracted text",
    });
    const confirmed = await repositories.resumeTexts.create({
      resumeId: "resume-1",
      kind: "confirmed",
      text: "confirmed extracted text",
    });
    const manual = await repositories.resumeTexts.create({
      resumeId: "resume-1",
      kind: "manual",
      text: "manual correction",
    });

    await expect(repositories.resumeTexts.get(extracted.id)).resolves.toEqual(
      extracted,
    );
    await expect(repositories.resumeTexts.get(confirmed.id)).resolves.toEqual(
      confirmed,
    );
    await expect(repositories.resumeTexts.get(manual.id)).resolves.toEqual(manual);
    expect(localStorage.length).toBe(0);
    database.close();
  });

  it("keeps analysis results and AI conversations in independent stores", async () => {
    const database = await openTestDatabase(nextDatabaseName());
    const repositories = createRepositories(database);

    const analysis = await repositories.analysisResults.create({
      applicationId: "application-1",
      resumeId: "resume-1",
      mode: "local",
      coverage: { overall: 50, required: 40, preferred: 60 },
      matchedKeywords: ["TypeScript"],
      weakMatches: [],
      missingKeywords: ["IndexedDB"],
      evidence: [{ keyword: "TypeScript", excerpt: "used TypeScript" }],
      uncertainItems: [],
      recommendations: [],
    });
    const conversation = await repositories.aiConversations.create({
      applicationId: "application-1",
      messages: [
        {
          id: "message-1",
          role: "user",
          content: "Only local persisted content",
          createdAt: "2026-09-01T10:00:00.000Z",
        },
      ],
    });

    await expect(repositories.analysisResults.get(analysis.id)).resolves.toEqual(
      analysis,
    );
    await expect(
      repositories.aiConversations.get(conversation.id),
    ).resolves.toEqual(conversation);
    database.close();
  });

  it.each([
    ["resumes", { status: "uploaded" }],
    ["interviews", { status: "pending" }],
    ["stages", { kind: "hired" }],
  ] as const)("rejects invalid enum values in %s", async (repositoryName, invalid) => {
    const database = await openTestDatabase(nextDatabaseName());
    const repositories = createRepositories(database);
    const repository = repositories[repositoryName];

    await expect(repository.create(invalid as never)).rejects.toThrow(/invalid/i);
    database.close();
  });

  it.each(["normal", "offer", "rejected", "withdrawn"] as const)(
    "accepts the stable Stage.kind value %s",
    async (kind) => {
      const database = await openTestDatabase(nextDatabaseName());
      const repositories = createRepositories(database);

      const stage = await repositories.stages.create({
        name: kind,
        color: "#334155",
        order: 1,
        kind,
      });

      expect(stage.kind).toBe(kind);
      database.close();
    },
  );

  it("rejects a parseable but non-ISO repository timestamp", async () => {
    const database = await openTestDatabase(nextDatabaseName());
    const repositories = createRepositories(database, {
      now: () => "September 1, 2026 10:00:00 UTC",
    });

    await expect(
      repositories.stages.create({
        name: "已申请",
        color: "#334155",
        order: 1,
        kind: "normal",
      }),
    ).rejects.toThrow(/ISO timestamp/);
    database.close();
  });

  it.each([
    ["September 2, 2026 10:00:00 UTC", "Asia/Shanghai"],
    ["2026-09-02T10:00:00.000Z", "Invalid/Timezone"],
  ])("rejects an interview with invalid time data", async (startsAt, timezone) => {
    const database = await openTestDatabase(nextDatabaseName());
    const repositories = createRepositories(database);

    await expect(
      repositories.interviews.create({
        applicationId: "application-1",
        round: 1,
        type: "video",
        title: "技术面试",
        startsAt,
        timezone,
        locationOrLink: "",
        interviewer: "",
        status: "scheduled",
        reminders: [],
        note: "",
      }),
    ).rejects.toThrow(/Invalid Interview|ISO timestamp/);
    database.close();
  });
});
