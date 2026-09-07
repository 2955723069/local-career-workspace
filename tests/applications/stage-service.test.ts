import { afterEach, describe, expect, it } from "vitest";

import {
  deleteCareerDatabase,
  openCareerDatabase,
  requestToPromise,
  runTransaction,
} from "../../src/db/database";
import { STORE_NAMES } from "../../src/db/schema";
import type { Application, ApplicationTimelineEvent } from "../../src/db/types";
import {
  DEFAULT_STAGES,
  StageConfirmationRequired,
  StageReplacementRequired,
  StageService,
} from "../../src/features/stages/stageService";

const databaseNames = new Set<string>();
const databases = new Set<IDBDatabase>();

async function setup(createId?: () => string) {
  const name = `stage-service-${crypto.randomUUID()}`;
  databaseNames.add(name);
  const database = await openCareerDatabase({ name });
  databases.add(database);
  let now = "2026-09-01T08:00:00.000Z";
  let sequence = 0;
  const service = new StageService(database, {
    now: () => now,
    createId: createId ?? (() => `stage-generated-${++sequence}`),
  });
  return { database, service, setNow: (value: string) => { now = value; } };
}

async function addApplication(
  database: IDBDatabase,
  id: string,
  stageId: string,
): Promise<void> {
  const timestamp = "2026-09-01T09:00:00.000Z";
  const application: Application = {
    id,
    createdAt: timestamp,
    updatedAt: timestamp,
    company: "Example",
    position: "Engineer",
    jobType: "other",
    location: "",
    workMode: "unknown",
    salaryText: "",
    source: "",
    jobUrl: "",
    jdText: "",
    stageId,
    priority: 0,
    contact: "",
    note: "",
  };
  await runTransaction(database, STORE_NAMES.applications, "readwrite", (transaction) =>
    requestToPromise(transaction.objectStore(STORE_NAMES.applications).add(application)),
  );
}

afterEach(async () => {
  databases.forEach((database) => database.close());
  databases.clear();
  await Promise.all([...databaseNames].map((name) => deleteCareerDatabase(name)));
  databaseNames.clear();
});

describe("StageService", () => {
  it("creates the seven defaults idempotently and supports deterministic ordering", async () => {
    const { service, setNow } = await setup();
    await service.ensureDefaultStages();
    await service.ensureDefaultStages();
    expect(await service.listStages()).toMatchObject(
      DEFAULT_STAGES.map(({ id, name, kind, order }) => ({ id, name, kind, order })),
    );

    const reversed = DEFAULT_STAGES.map(({ id }) => id).reverse();
    setNow("2026-09-01T09:00:00.000Z");
    await service.reorderStages(reversed);
    expect((await service.listStages()).map(({ id }) => id)).toEqual(reversed);
  });

  it("keeps result kinds immutable and counts outcomes by kind after renaming", async () => {
    const { database, service } = await setup();
    await service.ensureDefaultStages();
    const offer = DEFAULT_STAGES.find(({ kind }) => kind === "offer")!;
    const rejected = DEFAULT_STAGES.find(({ kind }) => kind === "rejected")!;
    const withdrawn = DEFAULT_STAGES.find(({ kind }) => kind === "withdrawn")!;
    await service.updateStage(offer.id, { name: "已签约", color: "#15803d" });
    await service.updateStage(rejected.id, { name: "流程终止" });
    await service.updateStage(withdrawn.id, { name: "不再考虑" });
    await expect(
      service.updateStage(offer.id, { kind: "normal" } as never),
    ).rejects.toThrow(/kind.*cannot/i);

    await addApplication(database, "offer-1", offer.id);
    await addApplication(database, "offer-2", offer.id);
    await addApplication(database, "rejected-1", rejected.id);
    await addApplication(database, "withdrawn-1", withdrawn.id);

    expect((await service.getStage(offer.id))?.kind).toBe("offer");
    expect(await service.getOutcomeCounts()).toEqual({
      offer: 2,
      rejected: 1,
      withdrawn: 1,
    });
  });

  it("requires confirmation and migrates associated applications with stage events", async () => {
    const { database, service, setNow } = await setup();
    await service.ensureDefaultStages();
    const source = DEFAULT_STAGES[0]!;
    const replacement = DEFAULT_STAGES[1]!;
    await addApplication(database, "application-1", source.id);
    const preview = await service.previewDelete(source.id);
    expect(preview.applicationCount).toBe(1);

    await expect(service.deleteStage(source.id)).rejects.toBeInstanceOf(StageConfirmationRequired);
    await expect(service.deleteStage(source.id, { confirmed: true })).rejects.toBeInstanceOf(StageReplacementRequired);
    expect((await service.getStage(source.id))?.id).toBe(source.id);

    setNow("2026-09-01T10:00:00.000Z");
    await service.confirmDelete(source.id, preview, replacement.id);
    expect(await service.getStage(source.id)).toBeUndefined();
    const application = await runTransaction(database, STORE_NAMES.applications, "readonly", (transaction) =>
      requestToPromise<Application>(transaction.objectStore(STORE_NAMES.applications).get("application-1")),
    );
    expect(application.stageId).toBe(replacement.id);
    const events = await runTransaction(database, STORE_NAMES.applicationTimelineEvents, "readonly", (transaction) =>
      requestToPromise<ApplicationTimelineEvent[]>(
        transaction.objectStore(STORE_NAMES.applicationTimelineEvents).index("applicationId").getAll("application-1"),
      ),
    );
    expect(events).toMatchObject([
      { type: "stage-changed", fromValue: source.id, toValue: replacement.id },
    ]);
  });

  it("deletes an unused normal stage but not a result stage", async () => {
    const { service } = await setup();
    await service.ensureDefaultStages();
    const normal = DEFAULT_STAGES[0]!;
    const offer = DEFAULT_STAGES.find(({ kind }) => kind === "offer")!;

    await service.deleteStage(normal.id, { confirmed: true });
    expect(await service.getStage(normal.id)).toBeUndefined();
    await expect(service.deleteStage(offer.id, { confirmed: true })).rejects.toThrow(/result stage/i);
  });

  it("rolls back application migration and stage deletion when an event write fails", async () => {
    const { database, service } = await setup();
    await service.ensureDefaultStages();
    const source = DEFAULT_STAGES[0]!;
    const replacement = DEFAULT_STAGES[1]!;
    await addApplication(database, "application-rollback", source.id);
    const conflict: ApplicationTimelineEvent = {
      id: "event-conflict",
      createdAt: "2026-09-01T09:30:00.000Z",
      updatedAt: "2026-09-01T09:30:00.000Z",
      applicationId: "application-rollback",
      type: "stage-changed",
      note: "existing",
    };
    await runTransaction(database, STORE_NAMES.applicationTimelineEvents, "readwrite", (transaction) =>
      requestToPromise(transaction.objectStore(STORE_NAMES.applicationTimelineEvents).add(conflict)),
    );
    const failing = new StageService(database, {
      now: () => "2026-09-01T10:00:00.000Z",
      createId: () => "event-conflict",
    });

    await expect(failing.deleteStage(source.id, {
      confirmed: true,
      replacementStageId: replacement.id,
    })).rejects.toBeDefined();
    expect(await service.getStage(source.id)).toBeDefined();
    const application = await runTransaction(database, STORE_NAMES.applications, "readonly", (transaction) =>
      requestToPromise<Application>(transaction.objectStore(STORE_NAMES.applications).get("application-rollback")),
    );
    expect(application.stageId).toBe(source.id);
  });
});
