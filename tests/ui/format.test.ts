import { describe, expect, it } from "vitest";
import { formatJobType, formatWorkMode, formatInterviewType, formatInterviewStatus, formatResumeStatus, formatTimelineEventType, formatDateTime } from "../../src/ui/format";

describe("format", () => {
  it("maps known enums to Chinese and falls back to raw for unknown", () => {
    expect(formatJobType("graduate")).toBe("应届");
    expect(formatJobType("weird")).toBe("weird");
    expect(formatWorkMode("onsite")).toBe("现场");
    expect(formatInterviewType("video")).toBe("视频");
    expect(formatInterviewStatus("scheduled")).toBe("已安排");
    expect(formatResumeStatus("needs-review")).toBe("待确认");
    expect(formatTimelineEventType("stage-changed")).toBe("阶段变更");
    expect(formatTimelineEventType("mystery")).toBe("mystery");
  });
  it("formats ISO into a friendly local string and passes through invalid input", () => {
    const out = formatDateTime("2026-09-04T12:00:00.000Z", "UTC");
    expect(out).toContain("2026");
    expect(out).not.toContain("T12:00:00.000Z");
    expect(formatDateTime("")).toBe("");
    expect(formatDateTime("not-a-date")).toBe("not-a-date");
  });
});
