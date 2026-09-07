import { afterEach, describe, expect, it } from "vitest";

import { deleteCareerDatabase, openCareerDatabase } from "../../src/db/database";
import { STORE_NAMES } from "../../src/db/schema";
import {
  clearAiSettings,
  getAiSettings,
  saveAiSettings,
} from "../../src/settings/secrets";

const names = new Set<string>();
const dbs = new Set<IDBDatabase>();

afterEach(async () => {
  dbs.forEach((db) => db.close());
  dbs.clear();
  await Promise.all([...names].map((name) => deleteCareerDatabase(name)));
  names.clear();
});

describe("sensitive AI settings", () => {
  it("persists through a dedicated store and is not exposed by domain repositories", async () => {
    const name = `secrets-${crypto.randomUUID()}`;
    names.add(name);
    const db = await openCareerDatabase({ name });
    dbs.add(db);
    await saveAiSettings(db, {
      apiUrl: "https://api.example.test/v1",
      model: "gpt-test",
      apiKey: "secret-key",
      organizationId: "org-test",
      customHeaders: { "X-Test": "yes" },
    });

    await expect(getAiSettings(db)).resolves.toMatchObject({ apiKey: "secret-key" });
    expect([...db.objectStoreNames]).toContain(STORE_NAMES.sensitiveSettings);
    await clearAiSettings(db);
    await expect(getAiSettings(db)).resolves.toBeUndefined();
    db.close();
  });
});
