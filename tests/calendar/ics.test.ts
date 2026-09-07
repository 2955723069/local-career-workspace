import { describe, expect, it } from "vitest";
import { generateICS } from "../../src/calendar/ics";

describe("ICS", () => {
  it("contains standard event fields", () => {
    const ics = generateICS({ interview: { title: "Tech", startsAt: "2026-01-01T00:00:00.000Z", endsAt: "2026-01-01T01:00:00.000Z", timezone: "UTC", locationOrLink: "Room 1" }, application: { company: "Acme", position: "Engineer", jobUrl: "https://acme.test" } });
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("SUMMARY:Tech - Acme / Engineer");
    expect(ics).toContain("DTSTART;TZID=UTC:");
    expect(ics).toContain("DTEND;TZID=UTC:");
    expect(ics).toContain("LOCATION:Room 1");
    expect(ics).toContain("URL:https://acme.test");
    expect(ics).toContain("BEGIN:VTIMEZONE");
    expect(ics).toContain("TZID:UTC");
    expect(ics).toMatch(/DTSTAMP:\d{8}T\d{6}Z/);
  });
});
