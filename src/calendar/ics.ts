import { requestToPromise, runTransaction } from "../db/database";
import { STORE_NAMES } from "../db/schema";
import { nextUpdatedTimestamp } from "../db/timestamps";
import type { Application, Interview } from "../db/types";
function esc(value: string): string { return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n"); }
function localStamp(value: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${get("year")}${get("month")}${get("day")}T${get("hour")}${get("minute")}${get("second")}`;
}
function utcStamp(value: string): string {
  const date = new Date(value);
  const pad = (input: number) => String(input).padStart(2, "0");
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}
/** 计算某时刻在指定时区的 UTC 偏移，形如 +0800 / -0500，用于最小 VTIMEZONE。 */
function zoneOffset(value: string, timezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, timeZoneName: "longOffset" }).formatToParts(new Date(value));
    const raw = parts.find((part) => part.type === "timeZoneName")?.value ?? "GMT+00:00";
    const match = /GMT([+-])(\d{2}):?(\d{2})?/.exec(raw);
    if (!match) return "+0000";
    return `${match[1]}${match[2]}${match[3] ?? "00"}`;
  } catch {
    return "+0000";
  }
}
/** 按 RFC 5545 将超过 75 字节的行折叠（续行以单个空格开头）。 */
function foldLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const out: string[] = [];
  let current = "";
  let currentBytes = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    const limit = out.length === 0 ? 75 : 74; // 续行首部的空格占 1 字节
    if (currentBytes + size > limit) {
      out.push(current);
      current = "";
      currentBytes = 0;
    }
    current += char;
    currentBytes += size;
  }
  if (current) out.push(current);
  return out.join("\r\n ");
}
export function generateICS(input: { interview: Pick<Interview, "title" | "startsAt" | "endsAt" | "timezone" | "locationOrLink">; application: Pick<Application, "company" | "position" | "jobUrl"> }): string {
  const { interview, application } = input;
  const offset = zoneOffset(interview.startsAt, interview.timezone);
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Local Career Workspace//EN", "CALSCALE:GREGORIAN",
    "BEGIN:VTIMEZONE", `TZID:${esc(interview.timezone)}`,
    "BEGIN:STANDARD", `DTSTART:${localStamp(interview.startsAt, interview.timezone)}`, `TZOFFSETFROM:${offset}`, `TZOFFSETTO:${offset}`, `TZNAME:${esc(interview.timezone)}`, "END:STANDARD",
    "END:VTIMEZONE",
    "BEGIN:VEVENT", `UID:${crypto.randomUUID()}`, `DTSTAMP:${utcStamp(new Date().toISOString())}`,
    `SUMMARY:${esc(`${interview.title} - ${application.company} / ${application.position}`)}`,
    `DTSTART;TZID=${esc(interview.timezone)}:${localStamp(interview.startsAt, interview.timezone)}`,
  ];
  if (interview.endsAt) lines.push(`DTEND;TZID=${esc(interview.timezone)}:${localStamp(interview.endsAt, interview.timezone)}`);
  if (interview.locationOrLink) lines.push(`LOCATION:${esc(interview.locationOrLink)}`);
  if (application.jobUrl) lines.push(`URL:${esc(application.jobUrl)}`);
  lines.push(`DESCRIPTION:${esc(`${application.company} / ${application.position}`)}`, "END:VEVENT", "END:VCALENDAR");
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}
export const generateIcs = generateICS;

export async function exportInterviewICS(database: IDBDatabase, interviewId: string): Promise<string> {
  return runTransaction(database, [STORE_NAMES.interviews, STORE_NAMES.applications], "readwrite", async (tx) => {
    const interviewStore = tx.objectStore(STORE_NAMES.interviews);
    const interview = await requestToPromise<Interview | undefined>(interviewStore.get(interviewId));
    if (!interview) throw new Error(`Interview not found: ${interviewId}`);
    const application = await requestToPromise<Application | undefined>(tx.objectStore(STORE_NAMES.applications).get(interview.applicationId));
    if (!application) throw new Error(`Application not found: ${interview.applicationId}`);
    const ics = generateICS({ interview, application });
    const exportedAt = new Date().toISOString();
    await requestToPromise(interviewStore.put({ ...interview, calendarExportedAt: exportedAt, updatedAt: nextUpdatedTimestamp(exportedAt, interview.updatedAt) }));
    return ics;
  });
}
export const exportCalendarICS = exportInterviewICS;
