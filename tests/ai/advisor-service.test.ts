import { afterEach, describe, expect, it, vi } from "vitest";
import { openCareerDatabase } from "../../src/db/database";
import { createRepositories } from "../../src/db/repositories";
import { AiAdvisorService } from "../../src/features/ai/aiAdvisorService";

const dbNames = new Set<string>();
const dbs = new Set<IDBDatabase>();
afterEach(async () => { dbs.forEach((db) => db.close()); dbs.clear(); dbNames.clear(); });

async function fixture() {
  const name = `advisor-${crypto.randomUUID()}`; dbNames.add(name);
  const db = await openCareerDatabase({ name }); dbs.add(db);
  const repos = createRepositories(db);
  const stage = await repos.stages.create({ name: "待申请", color: "#000", order: 0, kind: "normal" });
  const resume = await repos.resumes.create({ name: "简历 A", type: "pdf", fileName: "a.pdf", fileSize: 1, fileHash: crypto.randomUUID(), uploadedAt: new Date().toISOString(), tags: [], note: "", status: "ready" });
  await repos.resumeTexts.create({ resumeId: resume.id, kind: "confirmed", text: "TypeScript experience", confirmedAt: new Date().toISOString() });
  const app = await repos.applications.create({ company: "Acme", position: "Engineer", jobType: "tech", location: "", workMode: "remote", salaryText: "", source: "", jobUrl: "", jdText: "TypeScript required", stageId: stage.id, priority: 0, contact: "", note: "", currentResumeId: resume.id });
  const jd = await repos.jobDescriptions.create({ applicationId: app.id, textSource: "pasted" });
  await repos.jobDescriptionTexts.create({ jobDescriptionId: jd.id, kind: "confirmed", text: app.jdText, confirmedAt: new Date().toISOString() });
  return { db, app, resume };
}

describe("AI advisor orchestration", () => {
  it("builds an accurate preview without calling the client", async () => {
    const { db, app } = await fixture();
    const client = { complete: vi.fn(), testConnection: vi.fn() };
    const service = new AiAdvisorService(db, { client, settings: { apiUrl: "https://api.example.test/v1", model: "m", apiKey: "secret", organizationId: "", customHeaders: {} } });
    const preview = await service.createPreview(app.id, "请给建议");
    expect(preview).toEqual(expect.objectContaining({ resumeVersion: "简历 A", resumeTextLength: 21, jdLength: 19, messageCount: 0, apiUrl: "https://api.example.test/v1" }));
    expect(client.complete).not.toHaveBeenCalled();
    expect(client.testConnection).not.toHaveBeenCalled();
  });

  it("saves only current application messages and parses structured result", async () => {
    const { db, app } = await fixture();
    const client = { complete: vi.fn().mockResolvedValue(JSON.stringify({ matchOverview: "80%", issues: ["缺少例子"], suggestions: ["补充项目"], rewrites: [{ original: "old", rewrite: "new" }], missingInfo: ["时间"], risks: ["无法核验"], authenticityRisk: true })), testConnection: vi.fn() };
    const service = new AiAdvisorService(db, { client, settings: { apiUrl: "https://api.example.test/v1", model: "m", apiKey: "secret", organizationId: "", customHeaders: {} } });
    const result = await service.send(app.id, "请给建议");
    expect(result.conversation.applicationId).toBe(app.id);
    expect(result.conversation.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(result.result.suggestions[0]).toContain("建议");
    expect(result.result.authenticityRisk).toBe(true);
  });
});
