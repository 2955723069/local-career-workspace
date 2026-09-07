import { afterEach, describe, expect, it, vi } from "vitest";

import { deleteCareerDatabase, openCareerDatabase } from "../../src/db/database";
import { ResumeIngestionService } from "../../src/features/resumes/ingestion";
import {
  ResumeLibraryService,
  type ResumeDeletePreview,
} from "../../src/features/resumes/resumeLibrary";
import { createResumeUsageSnapshot } from "../../src/features/resumes/resumeUsageSnapshots";
import { makeResumeFile } from "./fixtures";

const databaseNames = new Set<string>();
const databases = new Set<IDBDatabase>();
const now = "2026-09-01T08:30:00.000Z";

async function setup(parseText?: (type: "pdf" | "docx", data: ArrayBuffer) => Promise<string>) {
  const name = `resume-library-${crypto.randomUUID()}`;
  databaseNames.add(name);
  const database = await openCareerDatabase({ name });
  databases.add(database);
  let id = 0;
  const ingestion = new ResumeIngestionService(database, {
    now: () => now,
    createId: () => `id-${++id}`,
    parseText,
  });
  return { database, ingestion, library: new ResumeLibraryService(database, { now: () => now, createId: () => `lib-${++id}` }) };
}

afterEach(async () => {
  databases.forEach((database) => database.close());
  databases.clear();
  await Promise.all([...databaseNames].map((name) => deleteCareerDatabase(name)));
  databaseNames.clear();
  vi.unstubAllGlobals();
});

describe("resume library service", () => {
  it("confirms extracted text without changing original blob or extracted record", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { ingestion, library } = await setup(async () => "Extracted profile");
    const file = makeResumeFile("pdf", "source bytes");
    const first = await ingestion.ingest(file);
    const original = new Uint8Array(await (await ingestion.getOriginalFile(first.resume.id))!.blob.arrayBuffer());

    const confirmed = await library.confirmText(first.resume.id, "Extracted profile");
    expect(confirmed.resume.status).toBe("ready");
    expect(confirmed.resume.textSource).toBe("extracted");
    expect(confirmed.resume.textConfirmedAt).toBe(now);
    expect(confirmed.text.text).toBe("Extracted profile");
    expect(await library.getText(first.resume.id, "extracted")).toMatchObject({ text: "Extracted profile" });
    expect(new Uint8Array(await (await ingestion.getOriginalFile(first.resume.id))!.blob.arrayBuffer())).toEqual(original);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("reads the current manual revision after an extracted confirmation", async () => {
    const { ingestion, library } = await setup(async () => "Extracted profile");
    const first = await ingestion.ingest(makeResumeFile("pdf", "source bytes"));
    await library.confirmText(first.resume.id, "Extracted profile");
    await library.confirmText(first.resume.id, "Corrected profile");
    expect((await library.getResume(first.resume.id))?.textSource).toBe("manual");
    expect(await library.getConfirmedText(first.resume.id)).toBe("Corrected profile");
    expect(await library.getText(first.resume.id, "extracted")).toMatchObject({ text: "Extracted profile" });
  });

  it("recovers an extraction failure with manually confirmed text", async () => {
    const { ingestion, library } = await setup(async () => { throw new Error("parser failed"); });
    const failed = await ingestion.ingest(makeResumeFile("docx", "private source"));
    const confirmed = await library.confirmText(failed.resume.id, "Pasted profile");
    expect(confirmed.resume).toMatchObject({ status: "ready", textSource: "manual" });
    expect(await library.getConfirmedText(failed.resume.id)).toBe("Pasted profile");
    expect(await ingestion.getOriginalFile(failed.resume.id)).toBeDefined();
  });

  it("searches, renames, edits tags, and preserves usage snapshots after deletion", async () => {
    const { ingestion, library } = await setup(async () => "Confirmed profile");
    const first = await ingestion.ingest(makeResumeFile("pdf", "one", "Long Candidate Name.pdf"));
    await library.confirmText(first.resume.id, "Confirmed profile");
    await library.updateMetadata(first.resume.id, { name: "Frontend CV", tags: ["frontend", "2026"] });
    expect((await library.search("frontend"))[0]?.id).toBe(first.resume.id);
    const snapshot = await createResumeUsageSnapshot(library, { applicationId: "app-1", resumeId: first.resume.id });
    const preview: ResumeDeletePreview = await library.previewDelete(first.resume.id);
    expect(preview.name).toBe("Frontend CV");
    await library.deleteResume(first.resume.id, { confirmed: true, deleteOriginalFile: true });
    expect((await library.getResume(first.resume.id))?.status).toBe("deleted");
    expect(await ingestion.getOriginalFile(first.resume.id)).toBeUndefined();
    expect(await library.getUsageSnapshot(snapshot.id)).toMatchObject({ resumeNameSnapshot: "Frontend CV", textSnapshot: "Confirmed profile" });
  });

  it("marks a single resume as the default and moves it when reassigned", async () => {
    const { ingestion, library } = await setup(async () => "Confirmed profile");
    const first = await ingestion.ingest(makeResumeFile("pdf", "one", "General.pdf"));
    const second = await ingestion.ingest(makeResumeFile("pdf", "two", "Backend.pdf"));

    expect(await library.getDefaultResume()).toBeUndefined();

    await library.setDefaultResume(first.resume.id);
    expect((await library.getDefaultResume())?.id).toBe(first.resume.id);
    expect((await library.getResume(first.resume.id))?.isDefault).toBe(true);

    // Reassigning the default clears the previous one — only one can be default.
    await library.setDefaultResume(second.resume.id);
    expect((await library.getDefaultResume())?.id).toBe(second.resume.id);
    expect((await library.getResume(first.resume.id))?.isDefault).toBeFalsy();

    // The default resume sorts to the top of the list.
    expect((await library.listResumes())[0]?.id).toBe(second.resume.id);
  });

  it("clears the default flag with null and when the default resume is deleted", async () => {
    const { ingestion, library } = await setup(async () => "Confirmed profile");
    const first = await ingestion.ingest(makeResumeFile("pdf", "one", "General.pdf"));

    await library.setDefaultResume(first.resume.id);
    await library.setDefaultResume(null);
    expect(await library.getDefaultResume()).toBeUndefined();
    expect((await library.getResume(first.resume.id))?.isDefault).toBeFalsy();

    await library.setDefaultResume(first.resume.id);
    await library.deleteResume(first.resume.id, { confirmed: true });
    expect(await library.getDefaultResume()).toBeUndefined();
    expect((await library.getResume(first.resume.id))?.isDefault).toBeFalsy();
  });

  it("rejects setting a deleted resume as default", async () => {
    const { ingestion, library } = await setup(async () => "Confirmed profile");
    const first = await ingestion.ingest(makeResumeFile("pdf", "one", "General.pdf"));
    await library.deleteResume(first.resume.id, { confirmed: true });
    await expect(library.setDefaultResume(first.resume.id)).rejects.toThrow(/deleted/i);
  });
});
