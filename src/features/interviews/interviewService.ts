import { requestToPromise, runTransaction } from "../../db/database";
import { STORE_NAMES } from "../../db/schema";
import { assertAbsoluteIsoTimestamp, nextUpdatedTimestamp } from "../../db/timestamps";
import type { ApplicationTimelineEvent, Interview, Reminder } from "../../db/types";

export type CreateInterviewInput = Omit<Interview, "id" | "createdAt" | "updatedAt" | "status"> & { status?: Interview["status"] };
export type RescheduleInput = Pick<Interview, "startsAt" | "timezone"> & Partial<Pick<Interview, "endsAt">>;
export type UpdateInterviewInput = Partial<Omit<CreateInterviewInput, "status">>;

function validTimezone(value: string): boolean {
  try { new Intl.DateTimeFormat("en", { timeZone: value }).format(); return true; } catch { return false; }
}
function validateInput(input: CreateInterviewInput): void {
  assertAbsoluteIsoTimestamp(input.startsAt, "Interview.startsAt");
  if (input.endsAt !== undefined) {
    assertAbsoluteIsoTimestamp(input.endsAt, "Interview.endsAt");
    if (Date.parse(input.endsAt) <= Date.parse(input.startsAt)) throw new Error("Invalid Interview.endsAt");
  }
  if (!validTimezone(input.timezone)) throw new Error("Invalid Interview.timezone");
  if (!Number.isInteger(input.round) || input.round < 1) throw new Error("Invalid Interview.round");
  if (!Array.isArray(input.reminders)) throw new Error("Invalid Interview.reminders");
  for (const reminder of input.reminders) {
    if (!Number.isInteger(reminder.offsetMinutes) || reminder.offsetMinutes <= 0 || !["in-app", "browser"].includes(reminder.channel)) throw new Error("Invalid Interview.reminder");
  }
  if (input.status && !["scheduled", "completed", "cancelled", "rescheduled"].includes(input.status)) throw new Error("Invalid Interview.status");
}

export class InterviewService {
  readonly #database: IDBDatabase;
  readonly #now: () => string;
  readonly #createId: () => string;
  constructor(database: IDBDatabase, dependencies: { now?: () => string; createId?: () => string } = {}) {
    this.#database = database; this.#now = dependencies.now ?? (() => new Date().toISOString()); this.#createId = dependencies.createId ?? (() => crypto.randomUUID());
  }
  async createInterview(input: CreateInterviewInput): Promise<Interview> {
    validateInput(input);
    const timestamp = this.#now(); assertAbsoluteIsoTimestamp(timestamp, "Interview.createdAt");
    const interview: Interview = { ...input, id: this.#createId(), createdAt: timestamp, updatedAt: timestamp, status: input.status ?? "scheduled" };
    await runTransaction(this.#database, STORE_NAMES.interviews, "readwrite", tx => requestToPromise(tx.objectStore(STORE_NAMES.interviews).add(interview)));
    return interview;
  }
  create(input: CreateInterviewInput): Promise<Interview> { return this.createInterview(input); }
  get(id: string): Promise<Interview | undefined> { return this.getInterview(id); }
  list(applicationId?: string): Promise<Interview[]> { return this.listInterviews(applicationId); }
  getInterview(id: string): Promise<Interview | undefined> { return runTransaction(this.#database, STORE_NAMES.interviews, "readonly", tx => requestToPromise(tx.objectStore(STORE_NAMES.interviews).get(id))); }
  listInterviews(applicationId?: string): Promise<Interview[]> { return runTransaction(this.#database, STORE_NAMES.interviews, "readonly", async tx => { const store = tx.objectStore(STORE_NAMES.interviews); const records = applicationId === undefined ? await requestToPromise<Interview[]>(store.getAll()) : await requestToPromise<Interview[]>(store.index("applicationId").getAll(applicationId)); return records.sort((a,b)=>a.startsAt.localeCompare(b.startsAt)||a.round-b.round); }); }
  async updateInterview(id: string, patch: UpdateInterviewInput): Promise<Interview> {
    const current = await this.getInterview(id); if (!current) throw new Error(`Interview not found: ${id}`);
    validateInput({ ...current, ...patch });
    const timestamp = this.#now(); assertAbsoluteIsoTimestamp(timestamp, "Interview.updatedAt");
    const scheduleChanged = (patch.startsAt !== undefined && patch.startsAt !== current.startsAt) || (patch.endsAt !== undefined && patch.endsAt !== current.endsAt) || (patch.timezone !== undefined && patch.timezone !== current.timezone);
    const stores = scheduleChanged ? [STORE_NAMES.interviews, STORE_NAMES.applicationTimelineEvents] : [STORE_NAMES.interviews];
    return runTransaction(this.#database, stores, "readwrite", async tx => {
      const store = tx.objectStore(STORE_NAMES.interviews); const existing = await requestToPromise<Interview | undefined>(store.get(id)); if (!existing) throw new Error(`Interview not found: ${id}`);
      const updatedAt = nextUpdatedTimestamp(timestamp, existing.updatedAt); const updated: Interview = { ...existing, ...patch, ...(scheduleChanged ? { status: "rescheduled" as const } : {}), id: existing.id, createdAt: existing.createdAt, updatedAt };
      await requestToPromise(store.put(updated));
      if (scheduleChanged) { const event: ApplicationTimelineEvent = { id: this.#createId(), createdAt: updatedAt, updatedAt, applicationId: existing.applicationId, type: "interview-rescheduled", fromValue: JSON.stringify({ startsAt: existing.startsAt, endsAt: existing.endsAt, timezone: existing.timezone }), toValue: JSON.stringify({ startsAt: updated.startsAt, endsAt: updated.endsAt, timezone: updated.timezone }), note: "Interview rescheduled." }; await requestToPromise(tx.objectStore(STORE_NAMES.applicationTimelineEvents).add(event)); }
      return updated;
    });
  }
  update(id: string, patch: UpdateInterviewInput): Promise<Interview> { return this.updateInterview(id, patch); }
  async rescheduleInterview(id: string, input: RescheduleInput): Promise<Interview> {
    const current = await this.getInterview(id); if (!current) throw new Error(`Interview not found: ${id}`);
    validateInput({ ...current, ...input });
    const candidate = this.#now(); assertAbsoluteIsoTimestamp(candidate, "Interview.updatedAt");
    return runTransaction(this.#database, [STORE_NAMES.interviews, STORE_NAMES.applicationTimelineEvents], "readwrite", async tx => {
      const store = tx.objectStore(STORE_NAMES.interviews);
      const existing = await requestToPromise<Interview | undefined>(store.get(id)); if (!existing) throw new Error(`Interview not found: ${id}`);
      const updatedAt = nextUpdatedTimestamp(candidate, existing.updatedAt);
      const updated = { ...existing, ...input, status: "rescheduled" as const, updatedAt };
      await requestToPromise(store.put(updated));
      const event: ApplicationTimelineEvent = { id: this.#createId(), createdAt: updatedAt, updatedAt, applicationId: existing.applicationId, type: "interview-rescheduled", fromValue: JSON.stringify({ startsAt: existing.startsAt, endsAt: existing.endsAt, timezone: existing.timezone }), toValue: JSON.stringify({ startsAt: updated.startsAt, endsAt: updated.endsAt, timezone: updated.timezone }), note: "Interview rescheduled." };
      await requestToPromise(tx.objectStore(STORE_NAMES.applicationTimelineEvents).add(event));
      return updated;
    });
  }
  reschedule(id: string, input: RescheduleInput): Promise<Interview> { return this.rescheduleInterview(id, input); }
  async setStatus(id: string, status: "cancelled" | "completed"): Promise<Interview> {
    const current = await this.getInterview(id); if (!current) throw new Error(`Interview not found: ${id}`);
    const timestamp = this.#now(); assertAbsoluteIsoTimestamp(timestamp, "Interview.updatedAt");
    return runTransaction(this.#database, STORE_NAMES.interviews, "readwrite", async tx => {
      const existing = await requestToPromise<Interview | undefined>(tx.objectStore(STORE_NAMES.interviews).get(id)); if (!existing) throw new Error(`Interview not found: ${id}`);
      const updated = { ...existing, status, updatedAt: nextUpdatedTimestamp(timestamp, existing.updatedAt) }; await requestToPromise(tx.objectStore(STORE_NAMES.interviews).put(updated)); return updated;
    });
  }
  cancelInterview(id: string): Promise<Interview> { return this.setStatus(id, "cancelled"); }
  completeInterview(id: string): Promise<Interview> { return this.setStatus(id, "completed"); }
  async listTimeline(applicationId: string): Promise<ApplicationTimelineEvent[]> { return runTransaction(this.#database, STORE_NAMES.applicationTimelineEvents, "readonly", async tx => (await requestToPromise<ApplicationTimelineEvent[]>(tx.objectStore(STORE_NAMES.applicationTimelineEvents).index("applicationId").getAll(applicationId))).sort((a,b)=>a.createdAt.localeCompare(b.createdAt))); }
}

export type { Reminder };
