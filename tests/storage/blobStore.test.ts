import { afterEach, describe, expect, it, vi } from "vitest";

import {
  deleteCareerDatabase,
  openCareerDatabase,
} from "../../src/db/database";
import { BlobStore } from "../../src/storage/blobStore";

const databaseNames = new Set<string>();
const databaseConnections = new Set<IDBDatabase>();

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

describe("original file blob storage", () => {
  it.each([
    ["pdf", "application/pdf", "PDF private bytes"],
    [
      "docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "DOCX private bytes",
    ],
  ] as const)(
    "persists a %s Blob after refresh without localStorage or network writes",
    async (fileType, mimeType, contents) => {
      const fetchSpy = vi.fn();
      vi.stubGlobal("fetch", fetchSpy);
      const name = `career-blob-${crypto.randomUUID()}`;
      databaseNames.add(name);
      let database = await openTestDatabase(name);
      let blobStore = new BlobStore(database);
      localStorage.setItem("ui-theme", "system");
      const blob = await new Response(contents, {
        headers: { "content-type": mimeType },
      }).blob();

      const stored = await blobStore.save({
        ownerType: "resume",
        ownerId: `resume-${fileType}`,
        fileName: `resume.${fileType}`,
        fileType,
        blob,
      });
      database.close();

      database = await openTestDatabase(name);
      blobStore = new BlobStore(database);
      const restored = await blobStore.get(stored.id);
      database.close();

      expect(restored?.fileName).toBe(`resume.${fileType}`);
      expect(restored?.blob.size).toBe(blob.size);
      expect(restored?.blob.type).toBe(mimeType);
      await expect(restored?.blob.text()).resolves.toBe(contents);
      expect(localStorage.getItem("ui-theme")).toBe("system");
      expect(JSON.stringify({ ...localStorage })).not.toContain(contents);
      expect(fetchSpy).not.toHaveBeenCalled();
    },
  );

  it("rejects a parseable but non-ISO file timestamp", async () => {
    const name = `career-blob-time-${crypto.randomUUID()}`;
    databaseNames.add(name);
    const database = await openTestDatabase(name);
    const blobStore = new BlobStore(database, {
      now: () => "September 1, 2026 10:00:00 UTC",
    });
    const blob = await new Response("private bytes").blob();

    await expect(
      blobStore.save({
        ownerType: "resume",
        ownerId: "resume-invalid-time",
        fileName: "resume.pdf",
        fileType: "pdf",
        blob,
      }),
    ).rejects.toThrow(/ISO timestamp/);
    database.close();
  });
});
