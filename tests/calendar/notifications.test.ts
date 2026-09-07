import "fake-indexeddb/auto";
import { describe, expect, it, vi } from "vitest";
import { openCareerDatabase } from "../../src/db/database";
import { scheduleReminder } from "../../src/calendar/notifications";
import type { Interview } from "../../src/db/types";

describe("notifications", () => {
  it("falls back to an in-app reminder and persists failure when denied", async () => {
    const db = await openCareerDatabase({ name: `notify-${crypto.randomUUID()}` });
    const fetchSpy = vi.fn(); vi.stubGlobal("fetch", fetchSpy);
    const interview = { id: "i-1", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", applicationId: "a-1", round: 1, type: "video", title: "面试", startsAt: "2026-01-01T01:00:00.000Z", timezone: "UTC", locationOrLink: "", interviewer: "", status: "scheduled", reminders: [], note: "" } as Interview;
    class DeniedNotification { static permission = "denied" as NotificationPermission; constructor(_title: string) {} }
    const result = await scheduleReminder(db, interview, { offsetMinutes: 10, channel: "browser" }, { NotificationCtor: DeniedNotification as unknown as typeof Notification });
    expect(result.browserScheduled).toBe(false);
    expect(result.failure?.reason).toContain("permission");
    expect(fetchSpy).not.toHaveBeenCalled();
    db.close();
  });
});
