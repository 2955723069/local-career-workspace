import { afterEach, describe, expect, it, vi } from "vitest";
import { createApplicationDetail, type ApplicationDetailElement } from "../../src/components/ApplicationDetail/ApplicationDetail";

const application = { id: "app-1", company: "Acme", position: "Engineer", jobType: "tech", workMode: "onsite", location: "SF", stageId: "s1", currentResumeId: "resume-a", jobUrl: "", jdText: "JD text", note: "note text", priority: 0 };
const stages = [{ id: "s1", name: "已申请", color: "#888", order: 0, kind: "normal" }];
const resumes = [{ id: "resume-a", name: "简历 A", status: "ready", tags: [], fileName: "a.pdf" }];

function baseServices(overrides: Record<string, unknown> = {}) {
  return {
    applicationService: {
      listApplications: async () => [application],
      listTimeline: async () => [{ id: "t1", type: "stage-changed", note: "→ 已申请" }],
      listResumeUsageHistory: async () => [{ id: "u1", resumeNameSnapshot: "简历 A", textSnapshot: "文本快照" }],
      changeStage: vi.fn(async () => application), bindResume: vi.fn(async () => application), updateNote: vi.fn(async () => application),
      previewArchive: async () => ({ id: "app-1", company: "Acme", position: "Engineer", resumeUsageCount: 1, timelineEventCount: 1 }),
      confirmArchive: vi.fn(async () => application), previewDelete: async () => ({ id: "app-1", company: "Acme", position: "Engineer", resumeUsageCount: 1, timelineEventCount: 1 }), confirmDelete: vi.fn(async () => undefined),
    },
    stageService: { listStages: async () => stages },
    resumeLibrary: { search: async () => resumes },
    ...overrides,
  } as any;
}

describe("application detail hub", () => {
  afterEach(() => { document.body.innerHTML = ""; });

  it("renders sub-tabs and the overview tab facts for an application", async () => {
    const el = createApplicationDetail(document, baseServices()) as ApplicationDetailElement;
    document.body.append(el);
    await el.show("app-1");
    expect(el.matches("section.application-detail-view")).toBe(true);
    expect(el.querySelector('[data-detail-tab="overview"]')).toBeTruthy();
    expect(el.querySelector('[data-detail-tab="matching"]')).toBeTruthy();
    expect(el.querySelector('[data-detail-tab="ai"]')).toBeTruthy();
    expect(el.textContent).toContain("Acme");
    expect(el.textContent).toContain("Engineer");
  });

  it("runs local matching from the matching tab and shows the disclaimer", async () => {
    const result = { id: "an-1", applicationId: "app-1", resumeId: "resume-a", mode: "local", createdAt: "2026-09-02T00:00:00.000Z", coverage: { overall: 50, required: 40, preferred: 60 }, matchedKeywords: ["TS"], weakMatches: [], missingKeywords: [], uncertainItems: [], evidence: [] };
    const matchingService = { run: vi.fn(async () => result), listHistory: vi.fn(async () => [result]), get: vi.fn(async () => result) };
    const el = createApplicationDetail(document, baseServices({ matchingService })) as ApplicationDetailElement;
    document.body.append(el);
    await el.show("app-1", "matching");
    expect(el.querySelector('[data-action="run-matching"]')).toBeTruthy();
    (el.querySelector('[data-action="run-matching"]') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 0));
    expect(matchingService.run).toHaveBeenCalledWith("app-1", "resume-a");
    expect(el.querySelector(".matching-result")?.textContent).toContain("仅代表文本证据");
  });

  it("opens the AI preview from the ai tab", async () => {
    const aiAdvisorService = { createPreview: vi.fn(async () => ({ applicationId: "app-1", prompt: "hi", resumeName: "简历 A", resumeTextLength: 10, jdLength: 5, messageCount: 0, apiUrl: "https://x" })), send: vi.fn(), getConversation: vi.fn(async () => undefined) };
    const el = createApplicationDetail(document, baseServices({ aiAdvisorService })) as ApplicationDetailElement;
    document.body.append(el);
    await el.show("app-1", "ai");
    const form = el.querySelector<HTMLFormElement>("[data-ai-form]")!;
    (form.elements.namedItem("prompt") as HTMLTextAreaElement).value = "如何优化？";
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 0));
    expect(aiAdvisorService.createPreview).toHaveBeenCalledWith("app-1", "如何优化？");
  });

  it("switches active tab via the tab bar", async () => {
    const el = createApplicationDetail(document, baseServices()) as ApplicationDetailElement;
    document.body.append(el);
    await el.show("app-1");
    (el.querySelector('[data-detail-tab="timeline"]') as HTMLButtonElement).click();
    expect(el.querySelector('[data-detail-tab="timeline"]')?.getAttribute("aria-selected")).toBe("true");
    expect(el.querySelector('[data-detail-panel="timeline"]')?.hasAttribute("hidden")).toBe(false);
    expect(el.querySelector('[data-detail-panel="overview"]')?.hasAttribute("hidden")).toBe(true);
  });

  it("show() resolves without throwing when services are absent (skeleton pass)", async () => {
    const el = createApplicationDetail(document, {} as any) as ApplicationDetailElement;
    document.body.append(el);
    await expect(el.show("app-1")).resolves.toBeUndefined();
  });
});
