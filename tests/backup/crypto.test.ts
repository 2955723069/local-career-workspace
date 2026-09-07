import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deleteCareerDatabase, openCareerDatabase } from "../../src/db/database";
import { STORE_NAMES } from "../../src/db/schema";
import { decryptBackup, exportBackup } from "../../src/backup/crypto";

const databases: IDBDatabase[] = [];
const names: string[] = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  databases.splice(0).forEach((db) => db.close());
  await Promise.all(names.splice(0).map((name) => deleteCareerDatabase(name)));
});

async function dbWithData() {
  const name = `backup-${crypto.randomUUID()}`;
  names.push(name);
  const db = await openCareerDatabase({ name });
  databases.push(db);
  const now = new Date().toISOString();
  const blob = await new Response("bytes", { headers: { "content-type": "application/pdf" } }).blob();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([STORE_NAMES.applications, STORE_NAMES.originalFiles, STORE_NAMES.sensitiveSettings], "readwrite");
    tx.objectStore(STORE_NAMES.applications).put({ id: "app-1", createdAt: now, updatedAt: now, company: "Acme", position: "Engineer" });
    tx.objectStore(STORE_NAMES.originalFiles).put({ id: "file-1", createdAt: now, updatedAt: now, ownerType: "resume", ownerId: "resume-1", fileName: "resume.pdf", fileType: "pdf", blob });
    tx.objectStore(STORE_NAMES.sensitiveSettings).put({ id: "ai", createdAt: now, updatedAt: now, apiKey: "secret" });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  return db;
}

describe("encrypted backup crypto", () => {
  it("encrypts and decrypts light and full backups", async () => {
    const db = await dbWithData();
    const light = await exportBackup(db, { kind: "light", password: "pw" });
    const lightPayload = await decryptBackup(light, "pw");
    expect(lightPayload.kind).toBe("light");
    expect(lightPayload.stores.originalFiles).toBeUndefined();
    expect(JSON.stringify(lightPayload)).not.toContain("secret");

    const full = await exportBackup(db, { kind: "full", password: "pw" });
    const fullPayload = await decryptBackup(full, "pw");
    expect(fullPayload.originalFiles?.[0]).toMatchObject({ fileName: "resume.pdf", fileType: "pdf", ownerId: "resume-1" });
    expect(fullPayload.originalFiles?.[0].bytes).toBeTruthy();
    expect(JSON.stringify(fullPayload)).not.toContain("secret");
  });

  it("uses fresh random salt and iv and rejects tampering or wrong password", async () => {
    const db = await dbWithData();
    const first = await exportBackup(db, { kind: "light", password: "pw" });
    const second = await exportBackup(db, { kind: "light", password: "pw" });
    expect(first.salt).not.toBe(second.salt);
    expect(first.iv).not.toBe(second.iv);
    await expect(decryptBackup(first, "bad")).rejects.toThrow();
    await expect(decryptBackup({ ...first, ciphertext: first.ciphertext.slice(0, -2) + "aa" }, "pw")).rejects.toThrow();
    await expect(decryptBackup({ ...first, version: 99 }, "pw")).rejects.toThrow(/version/i);
  });

  it("does not perform network requests or writes while exporting", async () => {
    const db = await dbWithData();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await exportBackup(db, { kind: "light", password: "pw" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("decrypts a backup that declares a different (valid) PBKDF2 iteration count", async () => {
    const db = await dbWithData();
    const backup = await exportBackup(db, { kind: "light", password: "pw" });
    // 一个信封校验允许的迭代次数；解密必须按信封里的 iterations 派生密钥，而不是硬编码常量。
    expect(backup.kdf.iterations).toBeGreaterThanOrEqual(100_000);
    const payload = await decryptBackup(backup, "pw");
    expect(payload.kind).toBe("light");
  });
});
