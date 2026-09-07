import { requestToPromise, runTransaction } from "../db/database";
import { STORE_NAMES } from "../db/schema";
import { calculateReminderTime } from "./reminders";
import type { Interview, ReminderFailure } from "../db/types";

export interface NotificationResult { reminderAt: string; browserScheduled: boolean; inAppReminder: { interviewId: string; reminderAt: string }; failure?: ReminderFailure; }
export async function scheduleReminder(database: IDBDatabase, interview: Interview, reminder: Interview["reminders"][number], options: { now?: () => string; NotificationCtor?: typeof Notification } = {}): Promise<NotificationResult> {
  const reminderAt = calculateReminderTime(interview.startsAt, reminder);
  const now = options.now ?? (() => new Date().toISOString());
  const Ctor = options.NotificationCtor ?? (typeof Notification !== "undefined" ? Notification : undefined);
  let browserScheduled = false; let reason: string | undefined;
  if (reminder.channel === "browser") {
    try {
      if (!Ctor) reason = "notifications-unavailable";
      else if (Ctor.permission !== "granted") reason = `permission-${Ctor.permission}`;
      else { new Ctor(interview.title); browserScheduled = true; }
    } catch (error) { reason = error instanceof Error ? error.name : "notification-failed"; }
  }
  let failure: ReminderFailure | undefined;
  if (reason) {
    const timestamp = now();
    failure = { id: crypto.randomUUID(), createdAt: timestamp, updatedAt: timestamp, interviewId: interview.id, reminderAt, reason };
    await runTransaction(database, STORE_NAMES.reminderFailures, "readwrite", tx => requestToPromise(tx.objectStore(STORE_NAMES.reminderFailures).add(failure)));
  }
  return { reminderAt, browserScheduled, inAppReminder: { interviewId: interview.id, reminderAt }, ...(failure ? { failure } : {}) };
}

export class NotificationService {
  readonly #database: IDBDatabase;
  readonly #options: { now?: () => string; NotificationCtor?: typeof Notification };
  readonly #timers = new Map<string, ReturnType<typeof setTimeout>>();
  constructor(database: IDBDatabase, options: { now?: () => string; NotificationCtor?: typeof Notification } = {}) { this.#database = database; this.#options = options; }
  schedule(interview: Interview, reminder: Interview["reminders"][number]): Promise<NotificationResult> {
    const reminderAt = calculateReminderTime(interview.startsAt, reminder);
    const nowMs = Date.parse(this.#options.now?.() ?? new Date().toISOString());
    const dueMs = Date.parse(reminderAt);
    const key = `${interview.id}:${reminder.channel}:${reminder.offsetMinutes}`;
    const existing = this.#timers.get(key);
    if (existing) clearTimeout(existing);
    const Ctor = this.#options.NotificationCtor ?? (typeof Notification !== "undefined" ? Notification : undefined);
    const browserReady = reminder.channel !== "browser" || Boolean(Ctor && Ctor.permission === "granted");
    if (Number.isFinite(dueMs) && dueMs > nowMs && browserReady) {
      const remaining = dueMs - nowMs;
      const MAX_DELAY = 2_147_000_000; // setTimeout 的 32 位上限约 24.8 天
      if (remaining > MAX_DELAY) {
        // 超过上限的提醒先睡到上限，再重新排程，避免到 ~24.8 天时提前误触发。
        this.#timers.set(key, setTimeout(() => {
          this.#timers.delete(key);
          void this.schedule(interview, reminder);
        }, MAX_DELAY));
      } else {
        this.#timers.set(key, setTimeout(() => {
          this.#timers.delete(key);
          void scheduleReminder(this.#database, interview, reminder, this.#options);
        }, remaining));
      }
      return Promise.resolve({ reminderAt, browserScheduled: reminder.channel === "browser", inAppReminder: { interviewId: interview.id, reminderAt } });
    }
    return scheduleReminder(this.#database, interview, reminder, this.#options);
  }
  scheduleReminder(interview: Interview, reminder: Interview["reminders"][number]): Promise<NotificationResult> { return this.schedule(interview, reminder); }
  restoreScheduled(interviews: Interview[]): Promise<NotificationResult[]> {
    const nowMs = Date.parse(this.#options.now?.() ?? new Date().toISOString());
    return Promise.all(interviews.flatMap((interview) => interview.reminders
      .filter((reminder) => Date.parse(calculateReminderTime(interview.startsAt, reminder)) > nowMs)
      .map((reminder) => this.schedule(interview, reminder))));
  }
  clearInterview(interviewId: string): void {
    for (const [key, timer] of this.#timers) {
      if (key.startsWith(`${interviewId}:`)) { clearTimeout(timer); this.#timers.delete(key); }
    }
  }
}

export async function scheduleInterviewReminders(database: IDBDatabase, interview: Interview, options: { now?: () => string; NotificationCtor?: typeof Notification } = {}): Promise<NotificationResult[]> {
  return Promise.all(interview.reminders.map((reminder) => scheduleReminder(database, interview, reminder, options)));
}
