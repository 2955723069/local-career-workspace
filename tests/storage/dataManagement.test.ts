import { afterEach, describe, expect, it } from "vitest";

import { deleteCareerDatabase, openCareerDatabase } from "../../src/db/database";
import { createRepositories } from "../../src/db/repositories";
import { BlobStore } from "../../src/storage/blobStore";
import { clearAllData, previewDataClear } from "../../src/storage/dataManagement";
import { saveAiSettings } from "../../src/settings/secrets";
import { savePreferences, PREFERENCE_KEYS } from "../../src/settings/preferences";

const names = new Set<string>();
const dbs = new Set<IDBDatabase>();

afterEach(async () => {
  dbs.forEach((db) => db.close());
  dbs.clear();
  localStorage.clear();
  await Promise.all([...names].map((name) => deleteCareerDatabase(name)));
  names.clear();
});

describe("data management", () => {
  it("previews counts and keeps data when confirmation is cancelled", async () => {
    const name = `clear-${crypto.randomUUID()}`;
    names.add(name);
    const db = await openCareerDatabase({ name });
    dbs.add(db);
    const repositories = createRepositories(db);
    await repositories.resumes.create({
      name: "Resume",
      type: "pdf",
      fileName: "resume.pdf",
      fileSize: 4,
      fileHash: "hash",
      uploadedAt: "2026-09-01T00:00:00.000Z",
      tags: [],
      note: "",
      status: "ready",
    });
    await repositories.resumeTexts.create({ resumeId: "r1", kind: "confirmed", text: "long text" });
    await new BlobStore(db).save({ ownerType: "resume", ownerId: "r1", fileName: "resume.pdf", fileType: "pdf", blob: new Blob(["bytes"], { type: "application/pdf" }) });
    await saveAiSettings(db, { apiUrl: "https://api.example.test", model: "m", apiKey: "k", organizationId: "", customHeaders: {} });
    savePreferences({ defaultTimezone: "UTC" });

    const preview = await previewDataClear(db);
    expect(preview.totalRecords).toBe(3);
    expect(preview.blobs).toBe(1);
    expect(await clearAllData(db, { confirmed: false })).toEqual({ cleared: false });
    expect((await repositories.resumes.list())).toHaveLength(1);
    expect(localStorage.length).toBeGreaterThan(0);
  });

  it("clears every store and local settings after confirmation", async () => {
    const name = `clear-confirm-${crypto.randomUUID()}`;
    names.add(name);
    const db = await openCareerDatabase({ name });
    dbs.add(db);
    const repositories = createRepositories(db);
    await repositories.stages.create({ name: "Applied", color: "#000", order: 1, kind: "normal" });
    await saveAiSettings(db, { apiUrl: "https://api.example.test", model: "m", apiKey: "k", organizationId: "", customHeaders: {} });
    savePreferences({ defaultTimezone: "UTC" });
    localStorage.setItem("unrelated-user-setting", "keep-me");
    await expect(clearAllData(db, { confirmationWord: "DELETE" })).resolves.toEqual({ cleared: true });
    expect(await repositories.stages.list()).toEqual([]);
    expect(localStorage.getItem("unrelated-user-setting")).toBe("keep-me");
    expect(PREFERENCE_KEYS.every((key) => localStorage.getItem(key) === null)).toBe(true);
  });

  it("returns an error and leaves local settings untouched when the database is unavailable", async () => {
    const name = `clear-failure-${crypto.randomUUID()}`;
    names.add(name);
    const db = await openCareerDatabase({ name });
    dbs.add(db);
    savePreferences({ defaultTimezone: "UTC" });
    db.close();

    const result = await clearAllData(db, { confirmed: true });
    expect(result.cleared).toBe(false);
    expect(result.error).toBeInstanceOf(Error);
    expect(localStorage.length).toBeGreaterThan(0);
  });
});
