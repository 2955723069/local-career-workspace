import type { Reminder } from "../db/types";

export const REMINDER_PRESETS = [10, 30, 60, 1440] as const;
export const REMINDER_PRESET_MINUTES = REMINDER_PRESETS;
export function createReminder(offsetMinutes: number, channel: Reminder["channel"] = "in-app"): Reminder {
  if (!Number.isInteger(offsetMinutes) || offsetMinutes <= 0 || !["in-app", "browser"].includes(channel)) throw new Error("Invalid reminder");
  return { offsetMinutes, channel };
}
export function calculateReminderTime(startsAt: string, reminder: Reminder): string {
  const time = Date.parse(startsAt);
  if (!Number.isFinite(time) || !Number.isInteger(reminder.offsetMinutes) || reminder.offsetMinutes <= 0) throw new Error("Invalid reminder");
  return new Date(time - reminder.offsetMinutes * 60_000).toISOString();
}
export const computeReminderAt = calculateReminderTime;
export function formatInterviewLocalTime(startsAt: string, timezone: string, locale = "zh-CN"): string {
  return new Intl.DateTimeFormat(locale, { timeZone: timezone, dateStyle: "medium", timeStyle: "short" }).format(new Date(startsAt));
}
export const formatLocalInterviewTime = formatInterviewLocalTime;
export function formatReminderLocalTime(startsAt: string, timezone: string, reminder: Reminder, locale = "zh-CN"): string {
  return formatInterviewLocalTime(calculateReminderTime(startsAt, reminder), timezone, locale);
}
