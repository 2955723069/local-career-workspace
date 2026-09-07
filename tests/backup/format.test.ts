import { describe, expect, it } from "vitest";
import { validateBackupEnvelope, validateBackupPayload } from "../../src/backup/format";

describe("backup format validation", () => {
  it("rejects malformed payloads and disallowed stores", () => {
    expect(() => validateBackupPayload({ kind: "light", exportedAt: new Date().toISOString(), stores: { sensitiveSettings: [] } })).toThrow(/Disallowed/);
    expect(() => validateBackupPayload({ kind: "full", exportedAt: new Date().toISOString(), stores: {}, originalFiles: [{ id: "x" }] })).toThrow(/original file/i);
  });

  it("rejects binary and sensitive values in allowed business stores", () => {
    const timestamp = new Date().toISOString();
    const binaryRecord = {
      id: "resume-1",
      createdAt: timestamp,
      updatedAt: timestamp,
      blob: new Blob(["resume source"]),
    };

    expect(() =>
      validateBackupPayload({
        kind: "light",
        exportedAt: timestamp,
        stores: { resumes: [binaryRecord] },
      }),
    ).toThrow(/binary/i);
    expect(() =>
      validateBackupPayload({
        kind: "light",
        exportedAt: timestamp,
        stores: {
          applications: [
            { id: "app-1", createdAt: timestamp, updatedAt: timestamp, apiKey: "secret" },
          ],
        },
      }),
    ).toThrow(/sensitive/i);
  });

  it("rejects envelopes with mismatched metadata", () => {
    expect(() => validateBackupEnvelope({ format: "local-career-workspace-backup", version: 1, kind: "light", salt: "YQ==", iv: "Yg==", kdf: { name: "PBKDF2", hash: "SHA-256", iterations: 210000, salt: "YQ==" }, cipher: { name: "AES-GCM", iv: "Yw==", tagLength: 128 }, ciphertext: "YQ==" })).toThrow(/metadata/);
  });
});
