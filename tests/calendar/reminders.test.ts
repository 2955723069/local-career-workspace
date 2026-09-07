import { describe, expect, it } from "vitest";
import { calculateReminderTime, formatInterviewLocalTime } from "../../src/calendar/reminders";

describe("reminders", () => {
  it("calculates absolute reminder and formats in interview timezone", () => {
    const startsAt = "2026-01-01T00:00:00.000Z";
    expect(calculateReminderTime(startsAt, { offsetMinutes: 30, channel: "in-app" })).toBe("2025-12-31T23:30:00.000Z");
    expect(formatInterviewLocalTime(startsAt, "Asia/Shanghai")).toContain("08:00");
  });
});
