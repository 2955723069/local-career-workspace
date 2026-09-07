import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../../src/app/createApp";

const stage = (id: string, name: string, order: number, kind: "normal" | "offer" | "rejected" | "withdrawn" = "normal") => ({
  id,
  name,
  order,
  kind,
  color: "#2563eb",
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
});

const application = {
  id: "application-1",
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  company: "Acme",
  position: "Frontend Engineer",
  jobType: "tech" as const,
  location: "上海",
  workMode: "hybrid" as const,
  salaryText: "15-20K",
  source: "官网",
  jobUrl: "https://example.test/jobs/1",
  jdText: "TypeScript React",
  stageId: "stage-a",
  priority: 1,
  contact: "hr@example.test",
  note: "初筛",
};

function services() {
  return {
    applicationService: {
      listApplications: vi.fn(async () => [application]),
      createApplication: vi.fn(async (input: Record<string, unknown>) => ({ ...application, ...input, id: "created-1" })),
      updateApplication: vi.fn(async (id: string, patch: Record<string, unknown>) => ({ ...application, ...patch, id })),
      changeStage: vi.fn(async (_id: string, stageId: string) => ({ ...application, stageId })),
      bindResume: vi.fn(async (_id: string, resumeId: string) => ({ ...application, currentResumeId: resumeId })),
      updateNote: vi.fn(async (_id: string, note: string) => ({ ...application, note })),
      listTimeline: vi.fn(async () => [{ ...application, id: "event-1", type: "stage-changed", note: "阶段推进" }]),
      listResumeUsageHistory: vi.fn(async () => [{ ...application, id: "usage-1", resumeNameSnapshot: "简历 A", textSnapshot: "A text" }]),
      previewArchive: vi.fn(async () => ({ id: application.id, company: application.company, position: application.position, archived: false, resumeUsageCount: 1, timelineEventCount: 2 })),
      confirmArchive: vi.fn(async () => ({ ...application, archivedAt: "2026-09-01T01:00:00.000Z" })),
      previewDelete: vi.fn(async () => ({ id: application.id, company: application.company, position: application.position, archived: false, resumeUsageCount: 1, timelineEventCount: 2 })),
      confirmDelete: vi.fn(async () => undefined),
    },
    stageService: {
      ensureDefaultStages: vi.fn(async () => [stage("stage-a", "待申请", 0), stage("stage-offer", "Offer", 1, "offer")]),
      listStages: vi.fn(async () => [stage("stage-a", "待申请", 0), stage("stage-offer", "Offer", 1, "offer")]),
      updateStage: vi.fn(async (id: string, patch: Record<string, unknown>) => ({ ...stage(id, "待申请", 0), ...patch })),
      reorderStages: vi.fn(async () => []),
      previewDelete: vi.fn(async () => ({ id: "stage-a", name: "待申请", kind: "normal", applicationCount: 1 })),
      deleteStage: vi.fn(async () => undefined),
      getOutcomeCounts: vi.fn(async () => ({ offer: 1, rejected: 0, withdrawn: 0 })),
    },
    jobDescriptionService: {
      ingestPaste: vi.fn(async () => ({ jobDescription: { id: "jd-1" }, text: { text: "JD" } })),
      confirmText: vi.fn(async () => undefined),
    },
    resumeLibrary: {
      search: vi.fn(async () => [{ id: "resume-a", name: "简历 A", fileName: "a.pdf", status: "ready", tags: [] }]),
      getConfirmedText: vi.fn(async () => "resume text"),
    },
  };
}

afterEach(() => {
  document.body.innerHTML = "";
});

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("application board UI", () => {
  it("renders a create form, board/list controls, and stage columns from one dataset", async () => {
    document.body.innerHTML = '<div id="app"></div>';
    const root = createApp(document, services());
    await flush();
    expect(root.querySelector("#application-board-title")?.textContent).toContain("职位申请");
    expect(root.querySelector('button[data-view="board"]')).toBeTruthy();
    expect(root.querySelector('button[data-view="list"]')).toBeTruthy();
    expect(root.querySelector('form[data-form="application"]')).toBeTruthy();
    expect(root.querySelector(".application-stage-column")).toBeTruthy();
    expect(root.textContent).toContain("Acme");
  });

  it("creates an application with JD and URL and persists through the service", async () => {
    document.body.innerHTML = '<div id="app"></div>';
    const deps = services();
    const root = createApp(document, deps);
    await flush();
    const form = root.querySelector<HTMLFormElement>('form[data-form="application"]')!;
    (form.elements.namedItem("company") as HTMLInputElement).value = "New Co";
    (form.elements.namedItem("position") as HTMLInputElement).value = "实习生";
    (form.elements.namedItem("jobUrl") as HTMLInputElement).value = "https://example.test/new";
    (form.elements.namedItem("jdText") as HTMLTextAreaElement).value = "要求 TypeScript";
    form.requestSubmit();
    await flush();
    expect(deps.applicationService.createApplication).toHaveBeenCalledWith(expect.objectContaining({
      company: "New Co",
      position: "实习生",
      jobUrl: "https://example.test/new",
      jdText: "要求 TypeScript",
    }));
  });

  it("shows details and keeps cancelled deletion side-effect free", async () => {
    document.body.innerHTML = '<div id="app"></div>';
    const deps = services();
    const root = createApp(document, deps);
    await flush();
    root.querySelector<HTMLButtonElement>('[data-action="details"][data-application-id="application-1"]')?.click();
    await flush();
    const detailView = root.querySelector<HTMLElement>(".application-detail-view");
    expect(detailView).toBeTruthy();
    expect(detailView?.hasAttribute("hidden")).toBe(false);
    expect(detailView?.textContent).toContain("简历 A");
    detailView?.querySelector<HTMLButtonElement>('[data-action="delete"][data-application-id="application-1"]')?.click();
    await flush();
    detailView?.querySelector<HTMLButtonElement>('[data-action="cancel-application-action"]')?.click();
    expect(deps.applicationService.confirmDelete).not.toHaveBeenCalled();
    expect(detailView?.querySelector(".application-detail__status")?.textContent).toContain("已取消操作，数据未改变");
  });

  it("runs local matching from details and reopens a saved history result", async () => {
    document.body.innerHTML = '<div id="app"></div>';
    const deps = services();
    const result = { id: "analysis-1", applicationId: "application-1", resumeId: "resume-a", mode: "local" as const, createdAt: "2026-09-01T02:00:00.000Z", updatedAt: "2026-09-01T02:00:00.000Z", coverage: { overall: 50, required: 50, preferred: 0 }, matchedKeywords: ["TypeScript"], weakMatches: [], missingKeywords: [], evidence: [{ keyword: "TypeScript", excerpt: "used TypeScript" }], uncertainItems: [], recommendations: [] };
    const matchingService = { run: vi.fn(async () => result), listHistory: vi.fn(async () => result.id ? [result] : []), get: vi.fn(async () => result) };
    const root = createApp(document, { ...deps, matchingService: matchingService as any });
    await flush();
    root.querySelector<HTMLButtonElement>('[data-action="details"][data-application-id="application-1"]')?.click();
    await flush();
    const detailView = root.querySelector<HTMLElement>(".application-detail-view");
    detailView?.querySelector<HTMLButtonElement>('[data-detail-tab="matching"]')?.click();
    await flush();
    expect(detailView?.querySelector('[data-action="run-matching"]')).toBeTruthy();
    detailView?.querySelector<HTMLButtonElement>('[data-action="run-matching"]')?.click();
    await flush();
    expect(matchingService.run).toHaveBeenCalledWith("application-1", "resume-a");
    expect(detailView?.querySelector(".matching-result")?.textContent).toContain("仅代表文本证据");
  });

  it("drag-and-drops a card onto another column and changes its stage", async () => {
    document.body.innerHTML = '<div id="app"></div>';
    const deps = services();
    const root = createApp(document, deps);
    await flush();
    const card = root.querySelector<HTMLElement>('.application-card[data-application-id="application-1"]')!;
    expect(card.getAttribute("draggable")).toBe("true");
    card.dispatchEvent(new Event("dragstart", { bubbles: true }));
    const target = root.querySelector<HTMLElement>('.application-stage-column[data-stage-id="stage-offer"]')!;
    target.dispatchEvent(new Event("dragover", { bubbles: true, cancelable: true }));
    target.dispatchEvent(new Event("drop", { bubbles: true }));
    await flush();
    expect(deps.applicationService.changeStage).toHaveBeenCalledWith("application-1", "stage-offer");
  });

  it("dropping a card back on its own column does not call changeStage", async () => {
    document.body.innerHTML = '<div id="app"></div>';
    const deps = services();
    const root = createApp(document, deps);
    await flush();
    const card = root.querySelector<HTMLElement>('.application-card[data-application-id="application-1"]')!;
    card.dispatchEvent(new Event("dragstart", { bubbles: true }));
    const same = root.querySelector<HTMLElement>('.application-stage-column[data-stage-id="stage-a"]')!;
    same.dispatchEvent(new Event("drop", { bubbles: true }));
    await flush();
    expect(deps.applicationService.changeStage).not.toHaveBeenCalled();
  });
});
