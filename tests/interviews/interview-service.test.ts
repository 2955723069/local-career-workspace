import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { openCareerDatabase } from "../../src/db/database";
import { InterviewService } from "../../src/features/interviews/interviewService";

describe("InterviewService", () => {
  it("creates multiple rounds and validates timestamps/timezone/reminders", async () => {
    const db = await openCareerDatabase({ name: `interview-${crypto.randomUUID()}` });
    const service = new InterviewService(db);
    const base = { applicationId: "app-1", type: "video" as const, title: "技术面", timezone: "Asia/Shanghai", locationOrLink: "https://meet.test", interviewer: "A", note: "", reminders: [{ offsetMinutes: 30, channel: "in-app" as const }] };
    const one = await service.createInterview({ ...base, round: 1, startsAt: "2026-09-01T09:00:00.000Z" });
    const two = await service.createInterview({ ...base, round: 2, startsAt: "2026-09-02T09:00:00.000Z" });
    expect(one.round).toBe(1);
    expect(two.round).toBe(2);
    await expect(service.createInterview({ ...base, round: 3, startsAt: "bad" })).rejects.toThrow();
    await expect(service.createInterview({ ...base, round: 3, startsAt: "2026-09-01T09:00:00.000Z", timezone: "Nope/Zone" })).rejects.toThrow();
    await expect(service.createInterview({ ...base, round: 3, startsAt: "2026-09-01T09:00:00.000Z", reminders: [{ offsetMinutes: 0, channel: "in-app" }] })).rejects.toThrow();
    db.close();
  });

  it("reschedules and appends a timeline event", async () => {
    const db = await openCareerDatabase({ name: `interview-${crypto.randomUUID()}` });
    const service = new InterviewService(db);
    const interview = await service.createInterview({ applicationId: "app-1", round: 1, type: "phone", title: "Screen", startsAt: "2026-09-01T09:00:00.000Z", timezone: "UTC", locationOrLink: "", interviewer: "", status: "scheduled", reminders: [], note: "" });
    const updated = await service.rescheduleInterview(interview.id, { startsAt: "2026-09-02T09:00:00.000Z", timezone: "Europe/London" });
    expect(updated.status).toBe("rescheduled");
    expect(updated.startsAt).toBe("2026-09-02T09:00:00.000Z");
    const events = await service.listTimeline("app-1");
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("interview-rescheduled");
    db.close();
  });
});
