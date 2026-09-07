import { afterEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app/createApp";
import { ResumeIngestionError } from "../src/features/resumes/ingestion";

describe("application startup", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
  });

  it("renders a perceptible local-ready state without an HTTP request", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    document.body.innerHTML = '<div id="app"></div>';

    const root = createApp(document);

    expect(root.querySelector("h1")?.textContent).toBe("求职工作台");
    expect(root.querySelector('[role="status"]')?.textContent).toContain(
      "本地数据已就绪",
    );
    expect(root.textContent).toContain("0 份简历");
    expect(root.textContent).toContain("0 个职位");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("starts on the overview page and keeps other pages hidden", () => {
    document.body.innerHTML = '<div id="app"></div>';

    const root = createApp(document);

    expect(root.querySelectorAll(".app-nav__tab")).toHaveLength(7);
    expect(root.querySelector<HTMLButtonElement>('[data-view="overview"]')?.getAttribute("aria-selected")).toBe("true");
    expect(root.querySelector<HTMLElement>('[data-view-panel="overview"]')?.hidden).toBe(false);
    expect(root.querySelector<HTMLElement>('[data-view-panel="applications"]')?.hidden).toBe(true);
  });

  it("switches pages without hiding the application board and supports hash deep links", async () => {
    document.body.innerHTML = '<div id="app"></div>';
    window.history.replaceState(null, "", "#applications");

    const root = createApp(document);

    expect(root.querySelector<HTMLElement>('[data-view-panel="applications"]')?.hidden).toBe(false);
    expect(root.querySelector<HTMLButtonElement>('[data-view="applications"]')?.getAttribute("aria-selected")).toBe("true");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(root.querySelector<HTMLElement>(".application-board-view")?.hidden).toBe(false);

    root.querySelector<HTMLButtonElement>('[data-view="resumes"]')?.click();

    expect(root.querySelector<HTMLElement>('[data-view-panel="applications"]')?.hidden).toBe(true);
    expect(root.querySelector<HTMLElement>('[data-view-panel="resumes"]')?.hidden).toBe(false);
    expect(window.location.hash).toBe("#resumes");
  });

  it("provides local preference, notification, and data-management controls in settings", () => {
    document.body.innerHTML = '<div id="app"></div>';

    const root = createApp(document);
    const settings = root.querySelector<HTMLElement>('[data-view-panel="settings"]');

    expect(settings?.textContent).toContain("默认时区");
    expect(settings?.querySelector("#settings-default-timezone")).not.toBeNull();
    expect(settings?.querySelector('[data-action="request-notifications"]')).not.toBeNull();
    expect(settings?.querySelector('[data-action="refresh-data-preview"]')).not.toBeNull();
    expect(settings?.querySelector('[data-action="open-clear-data"]')).not.toBeNull();
  });

  it("rejects startup when the application root is missing", () => {
    expect(() => createApp(document)).toThrowError("找不到应用挂载节点 #app");
  });

  it("does not expose underlying errors in resumé status feedback", async () => {
    document.body.innerHTML = '<div id="app"></div>';
    const secret = "resume body secret / api key";
    const root = createApp(document, {
      resumeIngestion: { ingest: vi.fn(async () => { throw new Error(secret); }) } as any,
    });
    const input = root.querySelector<HTMLInputElement>(".resume-file-input")!;
    const file = new File(["content"], "resume.pdf", { type: "application/pdf" });
    Object.defineProperty(input, "files", { configurable: true, value: [file] });
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(root.querySelector(".resume-library-status")?.textContent).toBe("简历保存失败，请重试");
    expect(root.textContent).not.toContain(secret);
  });

  it("surfaces the actionable reason for a known resume ingestion failure", async () => {
    document.body.innerHTML = '<div id="app"></div>';
    const error = new ResumeIngestionError({
      code: "file-too-large",
      message: "The resume file exceeds the 25 MB limit.",
      action: { code: "choose-smaller-file", message: "Choose a file no larger than 25 MB." },
      metadata: { fileName: "big.pdf", mimeType: "application/pdf", fileSize: 99 },
    });
    const root = createApp(document, {
      resumeIngestion: { ingest: vi.fn(async () => { throw error; }) } as any,
    });
    const input = root.querySelector<HTMLInputElement>(".resume-file-input")!;
    const file = new File(["content"], "big.pdf", { type: "application/pdf" });
    Object.defineProperty(input, "files", { configurable: true, value: [file] });
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(root.querySelector(".resume-library-status")?.textContent).toContain("25 MB");
  });

  it("re-enables the resume upload input after an upload attempt", async () => {
    document.body.innerHTML = '<div id="app"></div>';
    const root = createApp(document, {
      resumeIngestion: { ingest: vi.fn(async () => ({ outcome: "needs-review", resume: {}, extractedText: {} })) } as any,
    });
    const input = root.querySelector<HTMLInputElement>(".resume-file-input")!;
    const file = new File(["content"], "resume.pdf", { type: "application/pdf" });
    Object.defineProperty(input, "files", { configurable: true, value: [file] });
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(input.disabled).toBe(false);
  });
});
