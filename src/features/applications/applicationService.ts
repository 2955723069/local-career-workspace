import { requestToPromise, runTransaction } from "../../db/database";
import { STORE_NAMES } from "../../db/schema";
import {
  assertAbsoluteIsoTimestamp,
  nextUpdatedTimestamp,
} from "../../db/timestamps";
import type {
  Application,
  ApplicationTimelineEvent,
  Interview,
  JobDescription,
  JobDescriptionText,
  Resume,
  ResumeText,
  ResumeUsageHistory,
  Stage,
} from "../../db/types";

export interface ApplicationServiceDependencies {
  now?: () => string;
  createId?: () => string;
}

export type CreateApplicationInput = Omit<
  Application,
  | "id"
  | "createdAt"
  | "updatedAt"
  | "currentResumeId"
  | "archivedAt"
  | "jdFileId"
  | "jdText"
> & {
  jdText?: string;
};

export type UpdateApplicationInput = Partial<
  Pick<
    Application,
    | "company"
    | "position"
    | "jobType"
    | "location"
    | "workMode"
    | "salaryText"
    | "source"
    | "jobUrl"
    | "deadline"
    | "contact"
    | "priority"
    | "note"
  >
>;

export interface ApplicationActionPreview {
  id: string;
  company: string;
  position: string;
  archived: boolean;
  resumeUsageCount: number;
  timelineEventCount: number;
}

const EDITABLE_APPLICATION_FIELDS = new Set<keyof UpdateApplicationInput>([
  "company",
  "position",
  "jobType",
  "location",
  "workMode",
  "salaryText",
  "source",
  "jobUrl",
  "deadline",
  "contact",
  "priority",
  "note",
]);

export class ApplicationConfirmationRequired extends Error {
  readonly action: "archive" | "delete";

  constructor(action: "archive" | "delete") {
    super(`Application ${action} requires explicit confirmation.`);
    this.name = "ApplicationConfirmationRequired";
    this.action = action;
  }
}

function defaultNow(): string {
  return new Date().toISOString();
}

function defaultCreateId(): string {
  return crypto.randomUUID();
}

function validateDeadline(deadline: string | undefined): void {
  if (deadline !== undefined) {
    assertAbsoluteIsoTimestamp(deadline, "Application.deadline");
  }
}

function assertMetadataPatch(patch: UpdateApplicationInput): void {
  const invalidField = Object.keys(patch).find(
    (field) => !EDITABLE_APPLICATION_FIELDS.has(field as keyof UpdateApplicationInput),
  );
  if (invalidField) {
    throw new Error(`Application workflow field cannot be updated directly: ${invalidField}`);
  }
}

function eventTimestamp(candidate: string, application: Application): string {
  return nextUpdatedTimestamp(candidate, application.updatedAt);
}

function compareChronologically(
  left: Pick<ApplicationTimelineEvent, "createdAt" | "id">,
  right: Pick<ApplicationTimelineEvent, "createdAt" | "id">,
): number {
  return Date.parse(left.createdAt) - Date.parse(right.createdAt) || left.id.localeCompare(right.id);
}

export class ApplicationService {
  readonly #database: IDBDatabase;
  readonly #now: () => string;
  readonly #createId: () => string;

  constructor(
    database: IDBDatabase,
    dependencies: ApplicationServiceDependencies = {},
  ) {
    this.#database = database;
    this.#now = dependencies.now ?? defaultNow;
    this.#createId = dependencies.createId ?? defaultCreateId;
  }

  async createApplication(input: CreateApplicationInput): Promise<Application> {
    const timestamp = this.#now();
    assertAbsoluteIsoTimestamp(timestamp, "Application.createdAt");
    validateDeadline(input.deadline);
    const applicationId = this.#createId();
    const jdText = input.jdText ?? "";
    const application: Application = {
      ...input,
      id: applicationId,
      createdAt: timestamp,
      updatedAt: timestamp,
      jdText,
    };

    const stores = [STORE_NAMES.applications, STORE_NAMES.stages] as const;
    if (!jdText.trim()) {
      await runTransaction(this.#database, stores, "readwrite", async (transaction) => {
        await this.#assertStageExists(transaction, input.stageId);
        await requestToPromise(
          transaction.objectStore(STORE_NAMES.applications).add(application),
        );
      });
      return application;
    }

    const jobDescriptionId = this.#createId();
    const pastedText: JobDescriptionText = {
      id: this.#createId(),
      createdAt: timestamp,
      updatedAt: timestamp,
      jobDescriptionId,
      kind: "pasted",
      text: jdText,
    };
    const confirmedText: JobDescriptionText = {
      id: this.#createId(),
      createdAt: timestamp,
      updatedAt: timestamp,
      jobDescriptionId,
      kind: "confirmed",
      text: jdText,
      confirmedAt: timestamp,
    };
    const jobDescription: JobDescription = {
      id: jobDescriptionId,
      createdAt: timestamp,
      updatedAt: timestamp,
      applicationId,
      textSource: "pasted",
      textConfirmedAt: timestamp,
    };
    await runTransaction(
      this.#database,
      [
        STORE_NAMES.applications,
        STORE_NAMES.stages,
        STORE_NAMES.jobDescriptions,
        STORE_NAMES.jobDescriptionTexts,
      ],
      "readwrite",
      async (transaction) => {
        await this.#assertStageExists(transaction, input.stageId);
        await requestToPromise(
          transaction.objectStore(STORE_NAMES.applications).add(application),
        );
        await requestToPromise(
          transaction.objectStore(STORE_NAMES.jobDescriptions).add(jobDescription),
        );
        await requestToPromise(
          transaction.objectStore(STORE_NAMES.jobDescriptionTexts).add(pastedText),
        );
        await requestToPromise(
          transaction.objectStore(STORE_NAMES.jobDescriptionTexts).add(confirmedText),
        );
      },
    );
    return application;
  }

  create(input: CreateApplicationInput): Promise<Application> {
    return this.createApplication(input);
  }

  getApplication(applicationId: string): Promise<Application | undefined> {
    return runTransaction(this.#database, STORE_NAMES.applications, "readonly", (transaction) =>
      requestToPromise<Application | undefined>(
        transaction.objectStore(STORE_NAMES.applications).get(applicationId),
      ),
    );
  }

  get(applicationId: string): Promise<Application | undefined> {
    return this.getApplication(applicationId);
  }

  async listApplications(): Promise<Application[]> {
    const applications = await runTransaction(
      this.#database,
      STORE_NAMES.applications,
      "readonly",
      (transaction) =>
        requestToPromise<Application[]>(
          transaction.objectStore(STORE_NAMES.applications).getAll(),
        ),
    );
    return applications.sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id),
    );
  }

  list(): Promise<Application[]> {
    return this.listApplications();
  }

  async updateApplication(
    applicationId: string,
    patch: UpdateApplicationInput,
  ): Promise<Application> {
    assertMetadataPatch(patch);
    validateDeadline(patch.deadline);
    const timestamp = this.#now();
    assertAbsoluteIsoTimestamp(timestamp, "Application.updatedAt");
    return runTransaction(
      this.#database,
      [STORE_NAMES.applications, STORE_NAMES.applicationTimelineEvents],
      "readwrite",
      async (transaction) => {
        const store = transaction.objectStore(STORE_NAMES.applications);
        const existing = await requestToPromise<Application | undefined>(
          store.get(applicationId),
        );
        if (!existing) throw new Error(`Application not found: ${applicationId}`);
        const updatedAt = nextUpdatedTimestamp(timestamp, existing.updatedAt);
        const updated: Application = {
          ...existing,
          ...patch,
          id: existing.id,
          createdAt: existing.createdAt,
          updatedAt,
        };
        await requestToPromise(store.put(updated));
        if (patch.note !== undefined && patch.note !== existing.note) {
          await this.#addEvent(transaction, {
            applicationId,
            type: "note-added",
            fromValue: existing.note,
            toValue: patch.note,
            note: "Application note updated.",
          }, updatedAt);
        }
        return updated;
      },
    );
  }

  update(applicationId: string, patch: UpdateApplicationInput): Promise<Application> {
    return this.updateApplication(applicationId, patch);
  }

  async getConfirmedJobDescription(applicationId: string): Promise<string | undefined> {
    return runTransaction(
      this.#database,
      [STORE_NAMES.jobDescriptions, STORE_NAMES.jobDescriptionTexts],
      "readonly",
      async (transaction) => {
        const descriptions = await requestToPromise<JobDescription[]>(
          transaction
            .objectStore(STORE_NAMES.jobDescriptions)
            .index("applicationId")
            .getAll(applicationId),
        );
        descriptions.sort((left, right) =>
          right.updatedAt.localeCompare(left.updatedAt) || right.id.localeCompare(left.id),
        );
        const textStore = transaction.objectStore(STORE_NAMES.jobDescriptionTexts);
        for (const description of descriptions) {
          const confirmed = await requestToPromise<JobDescriptionText | undefined>(
            textStore.index("jobDescriptionId_kind").get([description.id, "confirmed"]),
          );
          if (confirmed) return confirmed.text;
          const manual = await requestToPromise<JobDescriptionText | undefined>(
            textStore.index("jobDescriptionId_kind").get([description.id, "manual"]),
          );
          if (manual) return manual.text;
        }
        return undefined;
      },
    );
  }

  async bindResume(applicationId: string, resumeId?: string): Promise<Application> {
    const candidate = this.#now();
    assertAbsoluteIsoTimestamp(candidate, "ResumeUsageHistory.usedAt");
    return runTransaction(
      this.#database,
      [
        STORE_NAMES.applications,
        STORE_NAMES.resumes,
        STORE_NAMES.resumeTexts,
        STORE_NAMES.resumeUsageHistory,
        STORE_NAMES.applicationTimelineEvents,
      ],
      "readwrite",
      async (transaction) => {
        const applicationStore = transaction.objectStore(STORE_NAMES.applications);
        const application = await requestToPromise<Application | undefined>(
          applicationStore.get(applicationId),
        );
        if (!application) throw new Error(`Application not found: ${applicationId}`);
        if (application.currentResumeId === resumeId) return application;
        if (!resumeId) {
          const timestamp = eventTimestamp(candidate, application);
          const updated: Application = { ...application, currentResumeId: undefined, updatedAt: timestamp };
          await requestToPromise(applicationStore.put(updated));
          await this.#addEvent(transaction, {
            applicationId,
            type: "resume-changed",
            ...(application.currentResumeId ? { fromValue: application.currentResumeId } : {}),
            note: "Current resume unbound.",
          }, timestamp);
          return updated;
        }
        const resume = await requestToPromise<Resume | undefined>(
          transaction.objectStore(STORE_NAMES.resumes).get(resumeId),
        );
        if (!resume || resume.status === "deleted") {
          throw new Error(`Resume not found: ${resumeId}`);
        }
        const text = await this.#getConfirmedResumeText(transaction, resume);
        if (!text) throw new Error("A confirmed resume text is required.");
        const timestamp = eventTimestamp(candidate, application);
        const snapshot: ResumeUsageHistory = {
          id: this.#createId(),
          createdAt: timestamp,
          updatedAt: timestamp,
          applicationId,
          resumeId,
          resumeNameSnapshot: resume.name,
          textSnapshot: text.text,
          usedAt: timestamp,
        };
        const updated: Application = {
          ...application,
          currentResumeId: resumeId,
          updatedAt: timestamp,
        };
        await requestToPromise(applicationStore.put(updated));
        await requestToPromise(
          transaction.objectStore(STORE_NAMES.resumeUsageHistory).add(snapshot),
        );
        await this.#addEvent(transaction, {
          applicationId,
          type: "resume-changed",
          ...(application.currentResumeId ? { fromValue: application.currentResumeId } : {}),
          toValue: resumeId,
          note: "Current resume changed.",
        }, timestamp);
        return updated;
      },
    );
  }

  setCurrentResume(applicationId: string, resumeId?: string): Promise<Application> {
    return this.bindResume(applicationId, resumeId);
  }

  async listResumeUsageHistory(applicationId: string): Promise<ResumeUsageHistory[]> {
    const records = await runTransaction(
      this.#database,
      STORE_NAMES.resumeUsageHistory,
      "readonly",
      (transaction) =>
        requestToPromise<ResumeUsageHistory[]>(
          transaction
            .objectStore(STORE_NAMES.resumeUsageHistory)
            .index("applicationId")
            .getAll(applicationId),
        ),
    );
    return records.sort((left, right) =>
      Date.parse(left.usedAt) - Date.parse(right.usedAt) || left.id.localeCompare(right.id),
    );
  }

  getResumeUsageHistory(applicationId: string): Promise<ResumeUsageHistory[]> {
    return this.listResumeUsageHistory(applicationId);
  }

  changeStage(applicationId: string, stageId: string): Promise<Application> {
    return this.#updateWithEvent(applicationId, async (transaction, application, timestamp) => {
      await this.#assertStageExists(transaction, stageId);
      if (application.stageId === stageId) return application;
      const updated = { ...application, stageId, updatedAt: timestamp };
      await requestToPromise(
        transaction.objectStore(STORE_NAMES.applications).put(updated),
      );
      await this.#addEvent(transaction, {
        applicationId,
        type: "stage-changed",
        fromValue: application.stageId,
        toValue: stageId,
        note: "Application stage changed.",
      }, timestamp);
      return updated;
    }, true);
  }

  moveToStage(applicationId: string, stageId: string): Promise<Application> {
    return this.changeStage(applicationId, stageId);
  }

  updateNote(applicationId: string, note: string): Promise<Application> {
    return this.updateApplication(applicationId, { note });
  }

  async listTimeline(applicationId: string): Promise<ApplicationTimelineEvent[]> {
    const events = await runTransaction(
      this.#database,
      STORE_NAMES.applicationTimelineEvents,
      "readonly",
      (transaction) =>
        requestToPromise<ApplicationTimelineEvent[]>(
          transaction
            .objectStore(STORE_NAMES.applicationTimelineEvents)
            .index("applicationId")
            .getAll(applicationId),
        ),
    );
    return events.sort(compareChronologically);
  }

  getTimeline(applicationId: string): Promise<ApplicationTimelineEvent[]> {
    return this.listTimeline(applicationId);
  }

  previewArchive(applicationId: string): Promise<ApplicationActionPreview> {
    return this.#previewAction(applicationId);
  }

  previewDelete(applicationId: string): Promise<ApplicationActionPreview> {
    return this.#previewAction(applicationId);
  }

  async archiveApplication(
    applicationId: string,
    options: { confirmed?: boolean } = {},
  ): Promise<Application> {
    if (!options.confirmed) throw new ApplicationConfirmationRequired("archive");
    return this.#updateWithEvent(applicationId, async (transaction, application, timestamp) => {
      if (application.archivedAt) return application;
      const updated: Application = {
        ...application,
        archivedAt: timestamp,
        updatedAt: timestamp,
      };
      await requestToPromise(
        transaction.objectStore(STORE_NAMES.applications).put(updated),
      );
      await this.#addEvent(transaction, {
        applicationId,
        type: "archived",
        note: "Application archived.",
      }, timestamp);
      return updated;
    });
  }

  archive(
    applicationId: string,
    options: { confirmed?: boolean } = {},
  ): Promise<Application> {
    return this.archiveApplication(applicationId, options);
  }

  async confirmArchive(
    applicationId: string,
    preview: ApplicationActionPreview,
  ): Promise<Application> {
    this.#assertPreviewMatches(applicationId, preview);
    return this.archiveApplication(applicationId, { confirmed: true });
  }

  async deleteApplication(
    applicationId: string,
    options: { confirmed?: boolean } = {},
  ): Promise<void> {
    if (!options.confirmed) throw new ApplicationConfirmationRequired("delete");
    // 级联删除隐私敏感的孤儿记录（面试/复盘/JD+文本+原文件/匹配/AI 对话）。
    // 注意：简历使用历史与申请时间线按“可追溯”原则刻意保留，作为审计快照，不在此清理。
    await runTransaction(
      this.#database,
      [
        STORE_NAMES.applications,
        STORE_NAMES.jobDescriptions,
        STORE_NAMES.jobDescriptionTexts,
        STORE_NAMES.interviews,
        STORE_NAMES.interviewReviews,
        STORE_NAMES.analysisResults,
        STORE_NAMES.aiConversations,
        STORE_NAMES.originalFiles,
      ],
      "readwrite",
      async (transaction) => {
        const store = transaction.objectStore(STORE_NAMES.applications);
        const application = await requestToPromise<Application | undefined>(store.get(applicationId));
        if (!application) throw new Error(`Application not found: ${applicationId}`);

        const deleteByIndex = async (storeName: string, indexName: string, key: IDBValidKey) => {
          const target = transaction.objectStore(storeName);
          const keys = await requestToPromise<IDBValidKey[]>(target.index(indexName).getAllKeys(key));
          await Promise.all(keys.map((recordKey) => requestToPromise(target.delete(recordKey))));
        };

        // 先取出关联的 JD 与面试 id，用于清理它们各自的子记录（JD 文本、原文件、面试复盘）。
        const jobDescriptionStore = transaction.objectStore(STORE_NAMES.jobDescriptions);
        const jobDescriptions = await requestToPromise<JobDescription[]>(jobDescriptionStore.index("applicationId").getAll(applicationId));
        const interviewStore = transaction.objectStore(STORE_NAMES.interviews);
        const interviews = await requestToPromise<Interview[]>(interviewStore.index("applicationId").getAll(applicationId));

        for (const jd of jobDescriptions) {
          await deleteByIndex(STORE_NAMES.jobDescriptionTexts, "jobDescriptionId", jd.id);
          if (jd.originalFileId) await requestToPromise(transaction.objectStore(STORE_NAMES.originalFiles).delete(jd.originalFileId));
        }
        for (const interview of interviews) {
          await deleteByIndex(STORE_NAMES.interviewReviews, "interviewId", interview.id);
        }

        await deleteByIndex(STORE_NAMES.jobDescriptions, "applicationId", applicationId);
        await deleteByIndex(STORE_NAMES.interviews, "applicationId", applicationId);
        await deleteByIndex(STORE_NAMES.analysisResults, "applicationId", applicationId);
        await deleteByIndex(STORE_NAMES.aiConversations, "applicationId", applicationId);

        await requestToPromise(store.delete(applicationId));
      },
    );
  }

  delete(
    applicationId: string,
    options: { confirmed?: boolean } = {},
  ): Promise<void> {
    return this.deleteApplication(applicationId, options);
  }

  async confirmDelete(
    applicationId: string,
    preview: ApplicationActionPreview,
  ): Promise<void> {
    this.#assertPreviewMatches(applicationId, preview);
    await this.deleteApplication(applicationId, { confirmed: true });
  }

  async #previewAction(applicationId: string): Promise<ApplicationActionPreview> {
    return runTransaction(
      this.#database,
      [
        STORE_NAMES.applications,
        STORE_NAMES.resumeUsageHistory,
        STORE_NAMES.applicationTimelineEvents,
      ],
      "readonly",
      async (transaction) => {
        const application = await requestToPromise<Application | undefined>(
          transaction.objectStore(STORE_NAMES.applications).get(applicationId),
        );
        if (!application) throw new Error(`Application not found: ${applicationId}`);
        const resumeUsageCount = await requestToPromise(
          transaction
            .objectStore(STORE_NAMES.resumeUsageHistory)
            .index("applicationId")
            .count(applicationId),
        );
        const timelineEventCount = await requestToPromise(
          transaction
            .objectStore(STORE_NAMES.applicationTimelineEvents)
            .index("applicationId")
            .count(applicationId),
        );
        return {
          id: application.id,
          company: application.company,
          position: application.position,
          archived: Boolean(application.archivedAt),
          resumeUsageCount,
          timelineEventCount,
        };
      },
    );
  }

  #assertPreviewMatches(applicationId: string, preview: ApplicationActionPreview): void {
    if (preview.id !== applicationId) {
      throw new Error("Application action preview does not match the application.");
    }
  }

  async #assertStageExists(transaction: IDBTransaction, stageId: string): Promise<void> {
    const stage = await requestToPromise<Stage | undefined>(
      transaction.objectStore(STORE_NAMES.stages).get(stageId),
    );
    if (!stage) throw new Error(`Stage not found: ${stageId}`);
  }

  async #getConfirmedResumeText(
    transaction: IDBTransaction,
    resume: Resume,
  ): Promise<ResumeText | undefined> {
    const index = transaction.objectStore(STORE_NAMES.resumeTexts).index("resumeId_kind");
    if (resume.textSource === "manual") {
      return requestToPromise<ResumeText | undefined>(index.get([resume.id, "manual"]));
    }
    if (resume.textSource === "extracted") {
      return requestToPromise<ResumeText | undefined>(index.get([resume.id, "confirmed"]));
    }
    const manual = await requestToPromise<ResumeText | undefined>(
      index.get([resume.id, "manual"]),
    );
    if (manual) return manual;
    return requestToPromise<ResumeText | undefined>(index.get([resume.id, "confirmed"]));
  }

  async #addEvent(
    transaction: IDBTransaction,
    input: Omit<ApplicationTimelineEvent, "id" | "createdAt" | "updatedAt">,
    timestamp: string,
  ): Promise<ApplicationTimelineEvent> {
    const event: ApplicationTimelineEvent = {
      ...input,
      id: this.#createId(),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await requestToPromise(
      transaction.objectStore(STORE_NAMES.applicationTimelineEvents).add(event),
    );
    return event;
  }

  async #updateWithEvent(
    applicationId: string,
    operation: (
      transaction: IDBTransaction,
      application: Application,
      timestamp: string,
    ) => Promise<Application>,
    includeStages = false,
  ): Promise<Application> {
    const candidate = this.#now();
    assertAbsoluteIsoTimestamp(candidate, "Application.updatedAt");
    const stores = includeStages
      ? [STORE_NAMES.applications, STORE_NAMES.applicationTimelineEvents, STORE_NAMES.stages]
      : [STORE_NAMES.applications, STORE_NAMES.applicationTimelineEvents];
    return runTransaction(this.#database, stores, "readwrite", async (transaction) => {
      const application = await requestToPromise<Application | undefined>(
        transaction.objectStore(STORE_NAMES.applications).get(applicationId),
      );
      if (!application) throw new Error(`Application not found: ${applicationId}`);
      const timestamp = eventTimestamp(candidate, application);
      return operation(transaction, application, timestamp);
    });
  }
}
