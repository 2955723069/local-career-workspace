import { afterEach, describe, expect, it } from "vitest";

import {
  getPreferences,
  savePreferences,
  updatePreferences,
} from "../../src/settings/preferences";

afterEach(() => localStorage.clear());

describe("local preferences", () => {
  it("saves and updates small preferences without storing business text", () => {
    savePreferences({
      defaultTimezone: "Asia/Shanghai",
      defaultReminders: [{ offsetMinutes: 30, channel: "in-app" }],
      uiPreferences: { theme: "dark" },
      migrationMarkers: { v2: true },
    });

    expect(getPreferences()).toMatchObject({ defaultTimezone: "Asia/Shanghai" });
    updatePreferences({ defaultTimezone: "UTC" });
    expect(getPreferences().defaultTimezone).toBe("UTC");
    expect(JSON.stringify({ ...localStorage })).not.toContain("resume text");
    expect(JSON.stringify({ ...localStorage })).not.toContain("Blob");
  });
});
