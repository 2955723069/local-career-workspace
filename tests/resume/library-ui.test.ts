import { afterEach, describe, expect, it } from "vitest";

import { createApp } from "../../src/app/createApp";
import type { ResumeLibraryService } from "../../src/features/resumes/resumeLibrary";
import { createResumeLibrary } from "../../src/components/ResumeLibrary/ResumeLibrary";

function libraryWithResume(): ResumeLibraryService {
  return {
    search: async () => [{
      id: "resume-1",
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
      name: "Frontend CV",
      type: "pdf",
      fileName: "a-very-long-candidate-resume-file-name.pdf",
      fileSize: 123,
      fileHash: "hash",
      uploadedAt: "2026-09-01T00:00:00.000Z",
      tags: ["frontend"],
      note: "",
      status: "ready",
    }],
  } as unknown as ResumeLibraryService;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("resume library UI", () => {
  it("renders semantic upload, search and status controls", () => {
    document.body.innerHTML = '<div id="app"></div>';
    const root = createApp(document);
    expect(root.querySelector('input[type="file"]')).toBeTruthy();
    expect(root.querySelector('input[type="search"]')).toBeTruthy();
    expect(root.querySelector('[role="status"]')?.getAttribute("aria-live")).toBe("polite");
    expect(root.querySelector("button")?.getAttribute("type")).toBe("button");
  });

  it("keeps long names from obscuring controls and exposes the library heading", () => {
    document.body.innerHTML = '<div id="app"></div>';
    const root = createApp(document);
    expect(root.querySelector("#resume-library-title")?.textContent).toContain("简历版本库");
    expect(root.querySelector(".resume-library-list")).toBeTruthy();
  });

  it("renders metadata, retry, download and two-stage deletion controls", async () => {
    document.body.innerHTML = '<div id="app"></div>';
    const root = createApp(document, { resumeLibrary: libraryWithResume() });
    await Promise.resolve();
    expect(root.querySelector('[data-action="edit-metadata"]')).toBeTruthy();
    expect(root.querySelector('[data-action="download"]')).toBeTruthy();
    expect(root.querySelector('[data-action="delete"]')).toBeTruthy();
    expect(root.querySelector(".resume-delete-preview [data-action='confirm-delete']")).toBeTruthy();
  });

  it("createResumeLibrary renders the library section standalone with core controls", () => {
    const section = createResumeLibrary(document);
    expect(section.matches("section.resume-library")).toBe(true);
    expect(section.querySelector("#resume-library-title")?.textContent).toContain("简历版本库");
    expect(section.querySelector(".resume-file-input")).toBeTruthy();
    expect(section.querySelector("#resume-search")).toBeTruthy();
    expect(section.querySelector(".resume-library-list")).toBeTruthy();
    expect(section.querySelector(".resume-delete-preview")?.hasAttribute("hidden")).toBe(true);
  });
});
