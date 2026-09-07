import { requestToPromise, runTransaction } from "./database";
import { STORE_NAMES, type StoreName } from "./schema";
import {
  assertAbsoluteIsoTimestamp,
  nextUpdatedTimestamp,
} from "./timestamps";
import {
  INTERVIEW_STATUSES,
  RESUME_STATUSES,
  STAGE_KINDS,
  type AiConversation,
  type AnalysisResult,
  type Application,
  type ApplicationTimelineEvent,
  type BaseRecord,
  type Interview,
  type InterviewReview,
  type ReminderFailure,
  type JobDescription,
  type JobDescriptionText,
  type Resume,
  type ResumeText,
  type ResumeUsageHistory,
  type Stage,
} from "./types";

export type CreateInput<T extends BaseRecord> = Omit<
  T,
  "id" | "createdAt" | "updatedAt"
>;
export type UpdateInput<T extends BaseRecord> = Partial<T>;

export interface Repository<T extends BaseRecord> {
  create(input: CreateInput<T>): Promise<T>;
  get(id: string): Promise<T | undefined>;
  list(): Promise<T[]>;
  update(id: string, patch: UpdateInput<T>): Promise<T>;
  delete(id: string): Promise<void>;
  findByIndex(indexName: string, query: IDBValidKey | IDBKeyRange): Promise<T[]>;
}

export interface RepositoryDependencies {
  now?: () => string;
  createId?: () => string;
}

type Validator<T extends BaseRecord> = (record: T) => void;

function defaultCreateId(): string {
  return crypto.randomUUID();
}

function defaultNow(): string {
  return new Date().toISOString();
}

function nextTimestamp(candidate: string, previous: string): string {
  return nextUpdatedTimestamp(candidate, previous);
}

function includes<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && values.includes(value as T);
}

function validateBase(record: BaseRecord): void {
  if (!record.id) {
    throw new Error("Invalid record id");
  }
  assertAbsoluteIsoTimestamp(record.createdAt, "createdAt");
  assertAbsoluteIsoTimestamp(record.updatedAt, "updatedAt");
}

function validateResume(record: Resume): void {
  if (!includes(RESUME_STATUSES, record.status)) {
    throw new Error("Invalid Resume.status");
  }
}

function validateStage(record: Stage): void {
  if (!includes(STAGE_KINDS, record.kind)) {
    throw new Error("Invalid Stage.kind");
  }
}

function validateTimezone(timezone: string): void {
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format();
  } catch {
    throw new Error("Invalid Interview.timezone");
  }
}

function validateInterview(record: Interview): void {
  if (!includes(INTERVIEW_STATUSES, record.status)) {
    throw new Error("Invalid Interview.status");
  }
  assertAbsoluteIsoTimestamp(record.startsAt, "Interview.startsAt");
  if (record.endsAt !== undefined) {
    assertAbsoluteIsoTimestamp(record.endsAt, "Interview.endsAt");
  }
  validateTimezone(record.timezone);
  if (!Number.isInteger(record.round) || record.round < 1) throw new Error("Invalid Interview.round");
  if (record.endsAt !== undefined && Date.parse(record.endsAt) <= Date.parse(record.startsAt)) throw new Error("Invalid Interview.endsAt");
  if (!Array.isArray(record.reminders)) throw new Error("Invalid Interview.reminders");
  for (const reminder of record.reminders) {
    if (!Number.isInteger(reminder.offsetMinutes) || reminder.offsetMinutes <= 0 || !["in-app", "browser"].includes(reminder.channel)) throw new Error("Invalid Interview.reminder");
  }
}

class IndexedDbRepository<T extends BaseRecord> implements Repository<T> {
  readonly #database: IDBDatabase;
  readonly #storeName: StoreName;
  readonly #now: () => string;
  readonly #createId: () => string;
  readonly #validate?: Validator<T>;

  constructor(
    database: IDBDatabase,
    storeName: StoreName,
    dependencies: Required<RepositoryDependencies>,
    validate?: Validator<T>,
  ) {
    this.#database = database;
    this.#storeName = storeName;
    this.#now = dependencies.now;
    this.#createId = dependencies.createId;
    this.#validate = validate;
  }

  async create(input: CreateInput<T>): Promise<T> {
    const timestamp = this.#now();
    assertAbsoluteIsoTimestamp(timestamp, "createdAt");
    const record = {
      ...input,
      id: this.#createId(),
      createdAt: timestamp,
      updatedAt: timestamp,
    } as T;
    validateBase(record);
    this.#validate?.(record);

    await runTransaction(this.#database, this.#storeName, "readwrite", (transaction) =>
      requestToPromise(transaction.objectStore(this.#storeName).add(record)),
    );
    return record;
  }

  get(id: string): Promise<T | undefined> {
    return runTransaction(this.#database, this.#storeName, "readonly", (transaction) =>
      requestToPromise<T | undefined>(
        transaction.objectStore(this.#storeName).get(id),
      ),
    );
  }

  list(): Promise<T[]> {
    return runTransaction(this.#database, this.#storeName, "readonly", (transaction) =>
      requestToPromise<T[]>(transaction.objectStore(this.#storeName).getAll()),
    );
  }

  async update(id: string, patch: UpdateInput<T>): Promise<T> {
    return runTransaction(this.#database, this.#storeName, "readwrite", async (transaction) => {
      const store = transaction.objectStore(this.#storeName);
      const existing = await requestToPromise<T | undefined>(store.get(id));
      if (!existing) {
        throw new Error(`Record not found: ${id}`);
      }

      const updated = {
        ...existing,
        ...patch,
        id: existing.id,
        createdAt: existing.createdAt,
        updatedAt: nextTimestamp(this.#now(), existing.updatedAt),
      };
      validateBase(updated);
      this.#validate?.(updated);
      await requestToPromise(store.put(updated));
      return updated;
    });
  }

  async delete(id: string): Promise<void> {
    await runTransaction(this.#database, this.#storeName, "readwrite", (transaction) =>
      requestToPromise(transaction.objectStore(this.#storeName).delete(id)),
    );
  }

  findByIndex(
    indexName: string,
    query: IDBValidKey | IDBKeyRange,
  ): Promise<T[]> {
    return runTransaction(this.#database, this.#storeName, "readonly", (transaction) =>
      requestToPromise<T[]>(
        transaction.objectStore(this.#storeName).index(indexName).getAll(query),
      ),
    );
  }
}

export interface DomainRepositories {
  resumes: Repository<Resume>;
  resumeTexts: Repository<ResumeText>;
  jobDescriptions: Repository<JobDescription>;
  jobDescriptionTexts: Repository<JobDescriptionText>;
  applications: Repository<Application>;
  resumeUsageHistory: Repository<ResumeUsageHistory>;
  stages: Repository<Stage>;
  applicationTimelineEvents: Repository<ApplicationTimelineEvent>;
  interviews: Repository<Interview>;
  interviewReviews: Repository<InterviewReview>;
  analysisResults: Repository<AnalysisResult>;
  aiConversations: Repository<AiConversation>;
  reminderFailures: Repository<ReminderFailure>;
}

export function createRepositories(
  database: IDBDatabase,
  dependencies: RepositoryDependencies = {},
): DomainRepositories {
  const resolvedDependencies: Required<RepositoryDependencies> = {
    now: dependencies.now ?? defaultNow,
    createId: dependencies.createId ?? defaultCreateId,
  };
  const repository = <T extends BaseRecord>(
    storeName: StoreName,
    validate?: Validator<T>,
  ): Repository<T> =>
    new IndexedDbRepository(database, storeName, resolvedDependencies, validate);

  return {
    resumes: repository(STORE_NAMES.resumes, validateResume),
    resumeTexts: repository(STORE_NAMES.resumeTexts),
    jobDescriptions: repository(STORE_NAMES.jobDescriptions),
    jobDescriptionTexts: repository(STORE_NAMES.jobDescriptionTexts),
    applications: repository(STORE_NAMES.applications),
    resumeUsageHistory: repository(STORE_NAMES.resumeUsageHistory),
    stages: repository(STORE_NAMES.stages, validateStage),
    applicationTimelineEvents: repository(
      STORE_NAMES.applicationTimelineEvents,
    ),
    interviews: repository(STORE_NAMES.interviews, validateInterview),
    interviewReviews: repository(STORE_NAMES.interviewReviews),
    analysisResults: repository(STORE_NAMES.analysisResults),
    aiConversations: repository(STORE_NAMES.aiConversations),
    reminderFailures: repository(STORE_NAMES.reminderFailures),
  };
}
