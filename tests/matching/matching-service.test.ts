import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";

import { openCareerDatabase, deleteCareerDatabase } from "../../src/db/database";
import { createRepositories } from "../../src/db/repositories";
import { MatchingService } from "../../src/features/matching/matchingService";

const names = new Set<string>();

afterEach(async () => {
  for (const name of names) await deleteCareerDatabase(name);
  names.clear();
});

async function setup() {
  const name = `matching-service-${crypto.randomUUID()}`;
  names.add(name);
  const database = await openCareerDatabase({ name });
  const repositories = createRepositories(database);
  const application = await repositories.applications.create({
    company: "Acme", position: "Frontend", jobType: "tech", location: "",
    workMode: "remote", salaryText: "", source: "", jobUrl: "", jdText: "",
    stageId: "stage", priority: 0, contact: "", note: "",
  });
  const resumeA = await repositories.resumes.create({
    name: "A", type: "pdf", fileName: "a.pdf", fileSize: 1, fileHash: "a",
    uploadedAt: "2026-09-01T00:00:00.000Z", tags: [], note: "", status: "ready", textSource: "extracted",
  });
  const resumeB = await repositories.resumes.create({
    name: "B", type: "pdf", fileName: "b.pdf", fileSize: 1, fileHash: "b",
    uploadedAt: "2026-09-01T00:00:00.000Z", tags: [], note: "", status: "ready", textSource: "manual",
  });
  const jd = await repositories.jobDescriptions.create({ applicationId: application.id, textSource: "pasted" });
  await repositories.jobDescriptionTexts.create({ jobDescriptionId: jd.id, kind: "confirmed", text: "TypeScript" });
  await repositories.resumeTexts.create({ resumeId: resumeA.id, kind: "confirmed", text: "TypeScript" });
  await repositories.resumeTexts.create({ resumeId: resumeB.id, kind: "manual", text: "Go" });
  return { database, repositories, application, resumeA, resumeB };
}

describe("MatchingService", () => {
  it("persists independent local results and reads history without network", async () => {
    const { database, repositories, application, resumeA, resumeB } = await setup();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const service = new MatchingService(database);

    const first = await service.run(application.id, resumeA.id);
    const second = await service.run(application.id, resumeB.id);

    expect(first.id).not.toBe(second.id);
    expect(first).toMatchObject({ applicationId: application.id, resumeId: resumeA.id, mode: "local" });
    expect(second.resumeId).toBe(resumeB.id);
    expect(await service.listHistory(application.id, resumeA.id, "local")).toHaveLength(1);
    expect(await repositories.analysisResults.list()).toHaveLength(2);
    expect(fetchSpy).not.toHaveBeenCalled();
    database.close();
  });

  it("does not write a result when confirmed text is unavailable", async () => {
    const { database, repositories, application, resumeA } = await setup();
    await repositories.jobDescriptionTexts.delete((await repositories.jobDescriptionTexts.findByIndex("jobDescriptionId", (await repositories.jobDescriptions.list())[0]!.id))[0]!.id);
    const service = new MatchingService(database);
    try {
      await expect(service.run(application.id, resumeA.id)).rejects.toThrow(/确认 JD/i);
      expect(await repositories.analysisResults.list()).toHaveLength(0);
    } finally {
      database.close();
    }
  });
});
