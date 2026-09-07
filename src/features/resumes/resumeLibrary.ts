import { requestToPromise, runTransaction } from "../../db/database";
import { STORE_NAMES } from "../../db/schema";
import { nextUpdatedTimestamp } from "../../db/timestamps";
import type {
  Resume,
  ResumeText,
  ResumeUsageHistory,
  StoredFile,
} from "../../db/types";
import type { ResumeDownloadData } from "./ingestion";

export interface ResumeLibraryDependencies {
  now?: () => string;
  createId?: () => string;
}

export interface ResumeDeletePreview {
  id: string;
  name: string;
  fileName: string;
  fileSize: number;
  status: Resume["status"];
  hasOriginalFile: boolean;
  confirmedTextLength: number;
}

export interface ResumeConfirmResult {
  resume: Resume;
  text: ResumeText;
}

export interface ResumeMetadataPatch {
  name?: string;
  tags?: string[];
}

function defaultNow(): string {
  return new Date().toISOString();
}

function defaultCreateId(): string {
  return crypto.randomUUID();
}

function normalizeTags(tags: string[] | undefined): string[] | undefined {
  if (!tags) return undefined;
  return [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))];
}

export class ResumeLibraryService {
  readonly #database: IDBDatabase;
  readonly #now: () => string;
  readonly #createId: () => string;

  constructor(database: IDBDatabase, dependencies: ResumeLibraryDependencies = {}) {
    this.#database = database;
    this.#now = dependencies.now ?? defaultNow;
    this.#createId = dependencies.createId ?? defaultCreateId;
  }

  async getResume(resumeId: string): Promise<Resume | undefined> {
    return runTransaction(this.#database, STORE_NAMES.resumes, "readonly", (tx) =>
      requestToPromise<Resume | undefined>(tx.objectStore(STORE_NAMES.resumes).get(resumeId)),
    );
  }

  async listResumes(query = ""): Promise<Resume[]> {
    const resumes = await runTransaction(this.#database, STORE_NAMES.resumes, "readonly", (tx) =>
      requestToPromise<Resume[]>(tx.objectStore(STORE_NAMES.resumes).getAll()),
    );
    const needle = query.trim().toLocaleLowerCase();
    return resumes
      // 软删除的简历不应出现在版本库列表里（点击会因原文件已删而失败，也不该再被引用）。
      .filter((resume) => resume.status !== "deleted")
      .filter((resume) => {
        if (!needle) return true;
        return [resume.name, resume.fileName, ...resume.tags]
          .some((value) => value.toLocaleLowerCase().includes(needle));
      })
      .sort((left, right) => {
        // 通用简历置顶
        if (left.isDefault && !right.isDefault) return -1;
        if (!left.isDefault && right.isDefault) return 1;
        return right.updatedAt.localeCompare(left.updatedAt);
      });
  }

  search(query = ""): Promise<Resume[]> {
    return this.listResumes(query);
  }

  list(query = ""): Promise<Resume[]> {
    return this.listResumes(query);
  }

  async getText(resumeId: string, kind: ResumeText["kind"]): Promise<ResumeText | undefined> {
    return runTransaction(this.#database, STORE_NAMES.resumeTexts, "readonly", (tx) =>
      requestToPromise<ResumeText | undefined>(
        tx.objectStore(STORE_NAMES.resumeTexts).index("resumeId_kind").get([resumeId, kind]),
      ),
    );
  }

  async getConfirmedTextRecord(resumeId: string): Promise<ResumeText | undefined> {
    const resume = await this.getResume(resumeId);
    if (resume?.textSource === "manual") return this.getText(resumeId, "manual");
    if (resume?.textSource === "extracted") return this.getText(resumeId, "confirmed");
    const manual = await this.getText(resumeId, "manual");
    const confirmed = await this.getText(resumeId, "confirmed");
    if (!manual) return confirmed;
    if (!confirmed) return manual;
    return manual.updatedAt >= confirmed.updatedAt ? manual : confirmed;
  }

  async getConfirmedText(resumeId: string): Promise<string | undefined> {
    return (await this.getConfirmedTextRecord(resumeId))?.text;
  }

  getResumeText(resumeId: string, kind: ResumeText["kind"] = "confirmed"): Promise<ResumeText | undefined> {
    return kind === "confirmed" ? this.getConfirmedTextRecord(resumeId) : this.getText(resumeId, kind);
  }

  async confirmText(resumeId: string, text: string): Promise<ResumeConfirmResult> {
    const value = text;
    if (!value.trim()) throw new Error("Confirmed resume text cannot be empty.");
    const timestamp = this.#now();
    const result = await runTransaction(
      this.#database,
      [STORE_NAMES.resumes, STORE_NAMES.resumeTexts],
      "readwrite",
      async (tx) => {
        const resumeStore = tx.objectStore(STORE_NAMES.resumes);
        const textStore = tx.objectStore(STORE_NAMES.resumeTexts);
        const resume = await requestToPromise<Resume | undefined>(resumeStore.get(resumeId));
        if (!resume) throw new Error(`Resume not found: ${resumeId}`);
        const extracted = await requestToPromise<ResumeText | undefined>(
          textStore.index("resumeId_kind").get([resumeId, "extracted"]),
        );
        const kind: ResumeText["kind"] = extracted?.text === value ? "confirmed" : "manual";
        const existing = await requestToPromise<ResumeText | undefined>(
          textStore.index("resumeId_kind").get([resumeId, kind]),
        );
        const textRecord: ResumeText = existing
          ? { ...existing, text: value, confirmedAt: timestamp, updatedAt: nextUpdatedTimestamp(timestamp, existing.updatedAt) }
          : {
              id: this.#createId(),
              createdAt: timestamp,
              updatedAt: timestamp,
              resumeId,
              kind,
              text: value,
              confirmedAt: timestamp,
            };
        if (existing) await requestToPromise(textStore.put(textRecord));
        else await requestToPromise(textStore.add(textRecord));
        const updatedResume: Resume = {
          ...resume,
          status: "ready",
          textSource: kind === "confirmed" ? "extracted" : "manual",
          textConfirmedAt: timestamp,
          updatedAt: nextUpdatedTimestamp(timestamp, resume.updatedAt),
        };
        await requestToPromise(resumeStore.put(updatedResume));
        return { resume: updatedResume, text: textRecord };
      },
    );
    return result;
  }

  updateText(resumeId: string, text: string): Promise<ResumeConfirmResult> {
    return this.confirmText(resumeId, text);
  }

  async updateMetadata(resumeId: string, patch: ResumeMetadataPatch): Promise<Resume> {
    return runTransaction(this.#database, STORE_NAMES.resumes, "readwrite", async (tx) => {
      const store = tx.objectStore(STORE_NAMES.resumes);
      const resume = await requestToPromise<Resume | undefined>(store.get(resumeId));
      if (!resume) throw new Error(`Resume not found: ${resumeId}`);
      const updated: Resume = {
        ...resume,
        ...(patch.name !== undefined ? { name: patch.name.trim() || resume.name } : {}),
        ...(patch.tags !== undefined ? { tags: normalizeTags(patch.tags) ?? [] } : {}),
        updatedAt: nextUpdatedTimestamp(this.#now(), resume.updatedAt),
      };
      await requestToPromise(store.put(updated));
      return updated;
    });
  }

  rename(resumeId: string, name: string): Promise<Resume> {
    return this.updateMetadata(resumeId, { name });
  }

  setTags(resumeId: string, tags: string[]): Promise<Resume> {
    return this.updateMetadata(resumeId, { tags });
  }

  async getDownloadData(resumeId: string): Promise<ResumeDownloadData> {
    const stored = await this.getStoredFile(resumeId);
    if (!stored) throw new Error("The original resume file is unavailable.");
    return { blob: stored.blob, fileName: stored.fileName, mimeType: stored.blob.type };
  }

  async getStoredFile(resumeId: string): Promise<StoredFile | undefined> {
    return runTransaction(this.#database, STORE_NAMES.originalFiles, "readonly", (tx) =>
      requestToPromise<StoredFile | undefined>(
        tx.objectStore(STORE_NAMES.originalFiles).index("ownerType_ownerId").get(["resume", resumeId]),
      ),
    );
  }

  async exportConfirmedText(resumeId: string): Promise<Blob> {
    const text = await this.getConfirmedText(resumeId);
    if (text === undefined) throw new Error("No confirmed resume text is available.");
    return new Blob([text], { type: "text/plain;charset=utf-8" });
  }

  exportText(resumeId: string): Promise<Blob> {
    return this.exportConfirmedText(resumeId);
  }

  async previewDelete(resumeId: string): Promise<ResumeDeletePreview> {
    const resume = await this.getResume(resumeId);
    if (!resume) throw new Error(`Resume not found: ${resumeId}`);
    const stored = await this.getStoredFile(resumeId);
    const text = await this.getConfirmedText(resumeId);
    return {
      id: resume.id,
      name: resume.name,
      fileName: resume.fileName,
      fileSize: resume.fileSize,
      status: resume.status,
      hasOriginalFile: Boolean(stored),
      confirmedTextLength: text?.length ?? 0,
    };
  }

  async deleteResume(
    resumeId: string,
    options: { confirmed?: boolean; deleteOriginalFile?: boolean } = {},
  ): Promise<void> {
    if (!options.confirmed) throw new ResumeDeletionConfirmationRequired();
    await runTransaction(
      this.#database,
      [STORE_NAMES.resumes, STORE_NAMES.originalFiles],
      "readwrite",
      async (tx) => {
        const resumeStore = tx.objectStore(STORE_NAMES.resumes);
        const resume = await requestToPromise<Resume | undefined>(resumeStore.get(resumeId));
        if (!resume) throw new Error(`Resume not found: ${resumeId}`);
        const updated: Resume = {
          ...resume,
          status: "deleted",
          isDefault: undefined, // 删除时清除通用标记
          updatedAt: nextUpdatedTimestamp(this.#now(), resume.updatedAt),
        };
        await requestToPromise(resumeStore.put(updated));
        if (options.deleteOriginalFile !== false) {
          const files = tx.objectStore(STORE_NAMES.originalFiles);
          const stored = await requestToPromise<StoredFile | undefined>(
            files.index("ownerType_ownerId").get(["resume", resumeId]),
          );
          if (stored) await requestToPromise(files.delete(stored.id));
        }
      },
    );
  }

  confirmDelete(
    resumeId: string,
    preview: ResumeDeletePreview,
    options: { deleteOriginalFile?: boolean } = {},
  ): Promise<void> {
    if (preview.id !== resumeId) throw new Error("Delete preview does not match the resume.");
    return this.deleteResume(resumeId, { confirmed: true, deleteOriginalFile: options.deleteOriginalFile });
  }

  async deleteOriginalFile(resumeId: string, confirmed = false): Promise<void> {
    if (!confirmed) throw new Error("Removing the original file requires explicit confirmation.");
    await runTransaction(this.#database, STORE_NAMES.originalFiles, "readwrite", async (tx) => {
      const files = tx.objectStore(STORE_NAMES.originalFiles);
      const stored = await requestToPromise<StoredFile | undefined>(
        files.index("ownerType_ownerId").get(["resume", resumeId]),
      );
      if (stored) await requestToPromise(files.delete(stored.id));
    });
  }

  removeOriginalFile(resumeId: string, confirmed = false): Promise<void> {
    return this.deleteOriginalFile(resumeId, confirmed);
  }

  async createUsageSnapshot(input: { applicationId: string; resumeId: string }): Promise<ResumeUsageHistory> {
    const resume = await this.getResume(input.resumeId);
    if (!resume) throw new Error(`Resume not found: ${input.resumeId}`);
    const text = await this.getConfirmedText(input.resumeId);
    if (text === undefined) throw new Error("A confirmed resume text is required.");
    const timestamp = this.#now();
    const snapshot: ResumeUsageHistory = {
      id: this.#createId(),
      createdAt: timestamp,
      updatedAt: timestamp,
      applicationId: input.applicationId,
      resumeId: input.resumeId,
      resumeNameSnapshot: resume.name,
      textSnapshot: text,
      usedAt: timestamp,
    };
    await runTransaction(this.#database, STORE_NAMES.resumeUsageHistory, "readwrite", (tx) =>
      requestToPromise(tx.objectStore(STORE_NAMES.resumeUsageHistory).add(snapshot)),
    );
    return snapshot;
  }

  getUsageSnapshot(id: string): Promise<ResumeUsageHistory | undefined> {
    return runTransaction(this.#database, STORE_NAMES.resumeUsageHistory, "readonly", (tx) =>
      requestToPromise<ResumeUsageHistory | undefined>(tx.objectStore(STORE_NAMES.resumeUsageHistory).get(id)),
    );
  }

  async getDefaultResume(): Promise<Resume | undefined> {
    const resumes = await runTransaction(this.#database, STORE_NAMES.resumes, "readonly", (tx) =>
      requestToPromise<Resume[]>(tx.objectStore(STORE_NAMES.resumes).getAll()),
    );
    return resumes.find((resume) => resume.isDefault && resume.status !== "deleted");
  }

  async setDefaultResume(resumeId: string | null): Promise<void> {
    await runTransaction(this.#database, STORE_NAMES.resumes, "readwrite", async (tx) => {
      const store = tx.objectStore(STORE_NAMES.resumes);

      if (resumeId === null) {
        // 取消通用：找到当前通用简历并清除标记
        const allResumes = await requestToPromise<Resume[]>(store.getAll());
        const currentDefault = allResumes.find((r) => r.isDefault && r.status !== "deleted");
        if (currentDefault) {
          const updated: Resume = {
            ...currentDefault,
            isDefault: undefined,
            updatedAt: nextUpdatedTimestamp(this.#now(), currentDefault.updatedAt),
          };
          await requestToPromise(store.put(updated));
        }
        return;
      }

      // 设置新通用：先清除旧的，再设置新的
      const allResumes = await requestToPromise<Resume[]>(store.getAll());
      const target = allResumes.find((r) => r.id === resumeId);
      if (!target) throw new Error(`Resume not found: ${resumeId}`);
      if (target.status === "deleted") throw new Error("Cannot set a deleted resume as default.");

      // 清除旧通用标记
      const currentDefault = allResumes.find((r) => r.isDefault && r.id !== resumeId && r.status !== "deleted");
      if (currentDefault) {
        const cleared: Resume = {
          ...currentDefault,
          isDefault: undefined,
          updatedAt: nextUpdatedTimestamp(this.#now(), currentDefault.updatedAt),
        };
        await requestToPromise(store.put(cleared));
      }

      // 设置新通用
      const updated: Resume = {
        ...target,
        isDefault: true,
        updatedAt: nextUpdatedTimestamp(this.#now(), target.updatedAt),
      };
      await requestToPromise(store.put(updated));
    });
  }
}

export { createResumeUsageSnapshot } from "./resumeUsageSnapshots";

export class ResumeDeletionConfirmationRequired extends Error {
  constructor() {
    super("Resume deletion requires explicit confirmation.");
    this.name = "ResumeDeletionConfirmationRequired";
  }
}
