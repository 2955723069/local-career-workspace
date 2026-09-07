import { afterEach, describe, expect, it, vi } from "vitest";

import { deleteCareerDatabase, openCareerDatabase } from "../../src/db/database";
import { AiConversationService } from "../../src/features/ai/aiConversationService";

const names = new Set<string>();
const dbs = new Set<IDBDatabase>();

afterEach(async () => {
  dbs.forEach((db) => db.close());
  dbs.clear();
  await Promise.all([...names].map((name) => deleteCareerDatabase(name)));
  names.clear();
});

describe("AI conversation service", () => {
  it("isolates conversations by application and does not write on client failure", async () => {
    const name = `ai-conversation-${crypto.randomUUID()}`;
    names.add(name);
    const db = await openCareerDatabase({ name });
    dbs.add(db);
    const client = {
      complete: vi.fn().mockRejectedValue(new Error("offline")),
    };
    const service = new AiConversationService(db, { client, now: () => "2026-01-01T00:00:00.000Z", createId: () => crypto.randomUUID() });

    await expect(service.sendMessage("app-a", "hello", { resumeText: "r", jdText: "j" })).rejects.toThrow("offline");
    expect(await service.getConversation("app-a")).toBeUndefined();
    await service.appendMessage("app-a", { role: "user", content: "saved" });
    await service.appendMessage("app-b", { role: "user", content: "other" });
    expect((await service.getConversation("app-a"))?.messages[0]?.content).toBe("saved");
    expect((await service.getConversation("app-b"))?.messages[0]?.content).toBe("other");
  });
});
