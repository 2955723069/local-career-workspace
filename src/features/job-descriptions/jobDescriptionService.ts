import { unzipSync } from "fflate";

import { requestToPromise, runTransaction } from "../../db/database";
import { STORE_NAMES } from "../../db/schema";
import { assertAbsoluteIsoTimestamp, nextUpdatedTimestamp } from "../../db/timestamps";
import type {
  Application,
  JobDescription,
  JobDescriptionText,
  StoredFile,
} from "../../db/types";
import { parseDocx } from "../../parsers/docx";
import { parsePdf } from "../../parsers/pdf";

export const MAX_JOB_DESCRIPTION_FILE_SIZE = 25 * 1024 * 1024;

const MIME_TYPES = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
} as const;
type JobDescriptionFileType = keyof typeof MIME_TYPES;

export type JobDescriptionIngestionErrorCode =
  | "unsupported-format"
  | "type-mismatch"
  | "file-too-large"
  | "invalid-file"
  | "duplicate-file"
  | "application-not-found"
  | "job-description-not-found"
  | "original-file-missing";

export type JobDescriptionRecoveryActionCode =
  | "choose-pdf-or-docx"
  | "choose-matching-file"
  | "choose-smaller-file"
  | "choose-valid-file"
  | "use-existing-job-description"
  | "paste-or-correct-text"
  | "select-existing-job-description";

export interface JobDescriptionRecoveryAction {
  code: JobDescriptionRecoveryActionCode;
  message: string;
}

export interface JobDescriptionFileMetadata {
  fileName: string;
  mimeType: string;
  fileSize: number;
  fileType?: JobDescriptionFileType;
  fileHash?: string;
  status?: JobDescription["textSource"];
}

export class JobDescriptionIngestionError extends Error {
  readonly code: JobDescriptionIngestionErrorCode;
  readonly action: JobDescriptionRecoveryAction;
  readonly metadata: JobDescriptionFileMetadata;
  readonly existingJobDescriptionId?: string;

  constructor(options: {
    code: JobDescriptionIngestionErrorCode;
    message: string;
    action: JobDescriptionRecoveryAction;
    metadata: JobDescriptionFileMetadata;
    existingJobDescriptionId?: string;
  }) {
    super(options.message);
    this.name = "JobDescriptionIngestionError";
    this.code = options.code;
    this.action = options.action;
    this.metadata = options.metadata;
    this.existingJobDescriptionId = options.existingJobDescriptionId;
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      action: this.action,
      metadata: this.metadata,
      ...(this.existingJobDescriptionId
        ? { existingJobDescriptionId: this.existingJobDescriptionId }
        : {}),
    };
  }
}

export interface JobDescriptionLogEntry {
  event:
    | "job-description-pasted"
    | "job-description-ingested"
    | "job-description-extraction-failed"
    | "job-description-extraction-retried";
  metadata: JobDescriptionFileMetadata;
}

export interface JobDescriptionIngestionDependencies {
  now?: () => string;
  createId?: () => string;
  parseText?: (fileType: JobDescriptionFileType, data: ArrayBuffer) => Promise<string>;
  logger?: (entry: JobDescriptionLogEntry) => void;
}

export interface PasteResult {
  jobDescription: JobDescription;
  text: JobDescriptionText;
}

export interface JobDescriptionIngestionResult {
  outcome: "needs-review" | "extraction-failed";
  jobDescription: JobDescription;
  extractedText?: JobDescriptionText;
  recovery?: {
    code: "extraction-failed";
    action: JobDescriptionRecoveryAction;
    metadata: JobDescriptionFileMetadata;
  };
}

export interface JobDescriptionConfirmResult {
  jobDescription: JobDescription;
  text: JobDescriptionText;
  application: Application;
}

const ACTIONS = {
  chooseSupported: { code: "choose-pdf-or-docx", message: "Choose a PDF or DOCX file." },
  chooseMatching: { code: "choose-matching-file", message: "Choose a file whose extension and MIME type match." },
  chooseSmaller: { code: "choose-smaller-file", message: "Choose a file no larger than 25 MB." },
  chooseValid: { code: "choose-valid-file", message: "Choose a valid, unmodified PDF or DOCX file." },
  useExisting: { code: "use-existing-job-description", message: "Use the job description that was already imported." },
  pasteText: { code: "paste-or-correct-text", message: "Paste or correct the job description text manually." },
  selectExisting: { code: "select-existing-job-description", message: "Select an existing job description and try again." },
} as const satisfies Record<string, JobDescriptionRecoveryAction>;

function extensionOf(fileName: string): string | undefined {
  const dot = fileName.lastIndexOf(".");
  return dot < 0 ? undefined : fileName.slice(dot + 1).toLowerCase();
}

function fileMetadata(file: File, fileType?: JobDescriptionFileType): JobDescriptionFileMetadata {
  return { fileName: file.name, mimeType: file.type, fileSize: file.size, ...(fileType ? { fileType } : {}) };
}

function errorFor(
  code: JobDescriptionIngestionErrorCode,
  message: string,
  action: JobDescriptionRecoveryAction,
  metadata: JobDescriptionFileMetadata,
  existingJobDescriptionId?: string,
): JobDescriptionIngestionError {
  return new JobDescriptionIngestionError({ code, message, action, metadata, ...(existingJobDescriptionId ? { existingJobDescriptionId } : {}) });
}

function validateFileMetadata(file: File): JobDescriptionFileType {
  const extension = extensionOf(file.name);
  if (extension !== "pdf" && extension !== "docx") {
    throw errorFor("unsupported-format", "Only PDF and DOCX job description files are supported.", ACTIONS.chooseSupported, fileMetadata(file));
  }
  if (file.size > MAX_JOB_DESCRIPTION_FILE_SIZE) {
    throw errorFor("file-too-large", "The job description file exceeds the 25 MB limit.", ACTIONS.chooseSmaller, fileMetadata(file, extension));
  }
  if (file.type.toLowerCase() !== MIME_TYPES[extension]) {
    throw errorFor("type-mismatch", "The job description extension and MIME type do not match.", ACTIONS.chooseMatching, fileMetadata(file, extension));
  }
  return extension;
}

function hasPrefix(data: Uint8Array, prefix: readonly number[]): boolean {
  return prefix.every((byte, index) => data[index] === byte);
}

function validateFileContents(file: File, fileType: JobDescriptionFileType, data: Uint8Array): void {
  let valid = false;
  if (fileType === "pdf") {
    const source = new TextDecoder("latin1").decode(data);
    valid = hasPrefix(data, [0x25, 0x50, 0x44, 0x46, 0x2d]) && source.includes("%%EOF");
  } else if (hasPrefix(data, [0x50, 0x4b, 0x03, 0x04])) {
    try {
      const required = new Set(["[Content_Types].xml", "word/document.xml"]);
      const entries = unzipSync(data, { filter: (entry) => required.has(entry.name) });
      valid = [...required].every((name) => entries[name] !== undefined);
    } catch {
      valid = false;
    }
  }
  if (!valid) {
    throw errorFor("invalid-file", `The selected ${fileType.toUpperCase()} file is invalid.`, ACTIONS.chooseValid, fileMetadata(file, fileType));
  }
}

async function sha256(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function defaultParseText(fileType: JobDescriptionFileType, data: ArrayBuffer): Promise<string> {
  return fileType === "pdf" ? parsePdf(data) : parseDocx(data);
}

async function blobArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === "function") return blob.arrayBuffer();
  return new Response(blob).arrayBuffer();
}

async function normalizeStoredFile(file: StoredFile): Promise<StoredFile> {
  const bytes = await blobArrayBuffer(file.blob);
  return { ...file, blob: new Blob([bytes], { type: file.blob.type }) };
}

function metadataFor(jobDescription: JobDescription, mimeType = ""): JobDescriptionFileMetadata {
  return {
    fileName: jobDescription.fileName ?? "",
    mimeType,
    fileSize: jobDescription.fileSize ?? 0,
    ...(jobDescription.fileType ? { fileType: jobDescription.fileType } : {}),
    ...(jobDescription.fileHash ? { fileHash: jobDescription.fileHash } : {}),
    status: jobDescription.textSource,
  };
}

export class JobDescriptionService {
  readonly #database: IDBDatabase;
  readonly #now: () => string;
  readonly #createId: () => string;
  readonly #parseText: NonNullable<JobDescriptionIngestionDependencies["parseText"]>;
  readonly #logger: NonNullable<JobDescriptionIngestionDependencies["logger"]>;

  constructor(database: IDBDatabase, dependencies: JobDescriptionIngestionDependencies = {}) {
    this.#database = database;
    this.#now = dependencies.now ?? (() => new Date().toISOString());
    this.#createId = dependencies.createId ?? (() => crypto.randomUUID());
    this.#parseText = dependencies.parseText ?? defaultParseText;
    this.#logger = dependencies.logger ?? (() => undefined);
  }

  async ingestPaste(applicationId: string, text: string): Promise<PasteResult> {
    if (!text.trim()) throw new Error("Pasted job description text cannot be empty.");
    const timestamp = this.#now();
    assertAbsoluteIsoTimestamp(timestamp, "JobDescription.createdAt");
    const jobDescriptionId = this.#createId();
    const textRecord: JobDescriptionText = {
      id: this.#createId(), createdAt: timestamp, updatedAt: timestamp,
      jobDescriptionId, kind: "pasted", text,
    };
    const jobDescription: JobDescription = {
      id: jobDescriptionId, createdAt: timestamp, updatedAt: timestamp,
      applicationId, textSource: "pasted",
    };
    await runTransaction(this.#database, [STORE_NAMES.applications, STORE_NAMES.jobDescriptions, STORE_NAMES.jobDescriptionTexts], "readwrite", async (tx) => {
      const app = await requestToPromise<Application | undefined>(tx.objectStore(STORE_NAMES.applications).get(applicationId));
      if (!app) throw new Error(`Application not found: ${applicationId}`);
      await requestToPromise(tx.objectStore(STORE_NAMES.jobDescriptions).add(jobDescription));
      await requestToPromise(tx.objectStore(STORE_NAMES.jobDescriptionTexts).add(textRecord));
    });
    this.#logger({ event: "job-description-pasted", metadata: metadataFor(jobDescription) });
    return { jobDescription, text: textRecord };
  }

  paste(applicationId: string, text: string): Promise<PasteResult> {
    return this.ingestPaste(applicationId, text);
  }

  importPaste(applicationId: string, text: string): Promise<PasteResult> {
    return this.ingestPaste(applicationId, text);
  }

  async ingestFile(applicationId: string, file: File): Promise<JobDescriptionIngestionResult> {
    const fileType = validateFileMetadata(file);
    const data = await file.arrayBuffer();
    validateFileContents(file, fileType, new Uint8Array(data));
    const fileHash = await sha256(data);
    const timestamp = this.#now();
    assertAbsoluteIsoTimestamp(timestamp, "JobDescription.createdAt");
    let extracted: string | undefined;
    try {
      const parsed = await this.#parseText(fileType, data.slice(0));
      if (!parsed.trim()) throw new Error("No text layer");
      extracted = parsed;
    } catch {
      extracted = undefined;
    }
    const jobDescriptionId = this.#createId();
    const originalFileId = this.#createId();
    const jobDescription: JobDescription = {
      id: jobDescriptionId, createdAt: timestamp, updatedAt: timestamp,
      applicationId, fileName: file.name, fileType, fileSize: file.size, fileHash,
      textSource: "extracted", originalFileId,
    };
    const originalBlob = await new Response(data, { headers: { "content-type": file.type || MIME_TYPES[fileType] } }).blob();
    const storedFile: StoredFile = {
      id: originalFileId, createdAt: timestamp, updatedAt: timestamp,
      ownerType: "job-description", ownerId: jobDescriptionId,
      fileName: file.name, fileType,
      blob: originalBlob,
    };
    const extractedText: JobDescriptionText | undefined = extracted ? {
      id: this.#createId(), createdAt: timestamp, updatedAt: timestamp,
      jobDescriptionId, kind: "extracted", text: extracted,
    } : undefined;
    await runTransaction(this.#database, [STORE_NAMES.applications, STORE_NAMES.jobDescriptions, STORE_NAMES.originalFiles, STORE_NAMES.jobDescriptionTexts], "readwrite", async (tx) => {
      const app = await requestToPromise<Application | undefined>(tx.objectStore(STORE_NAMES.applications).get(applicationId));
      if (!app) throw errorFor("application-not-found", "The application no longer exists.", ACTIONS.selectExisting, fileMetadata(file, fileType));
      const descriptions = await requestToPromise<JobDescription[]>(tx.objectStore(STORE_NAMES.jobDescriptions).index("applicationId").getAll(applicationId));
      const duplicate = descriptions.find((entry) => entry.fileHash === fileHash);
      if (duplicate) throw errorFor("duplicate-file", "This job description file was already imported for this application.", ACTIONS.useExisting, { ...fileMetadata(file, fileType), fileHash }, duplicate.id);
      await requestToPromise(tx.objectStore(STORE_NAMES.jobDescriptions).add(jobDescription));
      await requestToPromise(tx.objectStore(STORE_NAMES.originalFiles).add(storedFile));
      if (extractedText) await requestToPromise(tx.objectStore(STORE_NAMES.jobDescriptionTexts).add(extractedText));
    });
    const metadata = metadataFor(jobDescription, storedFile.blob.type);
    if (extractedText) {
      this.#logger({ event: "job-description-ingested", metadata });
      return { outcome: "needs-review", jobDescription, extractedText };
    }
    const recovery = { code: "extraction-failed" as const, action: ACTIONS.pasteText, metadata };
    this.#logger({ event: "job-description-extraction-failed", metadata });
    return { outcome: "extraction-failed", jobDescription, recovery };
  }

  ingest(applicationId: string, file: File): Promise<JobDescriptionIngestionResult> {
    return this.ingestFile(applicationId, file);
  }

  importFile(applicationId: string, file: File): Promise<JobDescriptionIngestionResult> {
    return this.ingestFile(applicationId, file);
  }

  async getText(jobDescriptionId: string, kind: JobDescriptionText["kind"]): Promise<JobDescriptionText | undefined> {
    return runTransaction(this.#database, STORE_NAMES.jobDescriptionTexts, "readonly", (tx) =>
      requestToPromise<JobDescriptionText | undefined>(tx.objectStore(STORE_NAMES.jobDescriptionTexts).index("jobDescriptionId_kind").get([jobDescriptionId, kind])),
    );
  }

  async getConfirmedTextRecord(jobDescriptionId: string): Promise<JobDescriptionText | undefined> {
    const jobDescription = await runTransaction(this.#database, STORE_NAMES.jobDescriptions, "readonly", (tx) =>
      requestToPromise<JobDescription | undefined>(tx.objectStore(STORE_NAMES.jobDescriptions).get(jobDescriptionId)),
    );
    if (jobDescription?.textSource === "manual") return this.getText(jobDescriptionId, "manual");
    if (jobDescription?.textSource === "extracted" || jobDescription?.textSource === "pasted") {
      return (await this.getText(jobDescriptionId, "confirmed")) ?? this.getText(jobDescriptionId, "manual");
    }
    const manual = await this.getText(jobDescriptionId, "manual");
    const confirmed = await this.getText(jobDescriptionId, "confirmed");
    if (!manual) return confirmed;
    if (!confirmed) return manual;
    return manual.updatedAt >= confirmed.updatedAt ? manual : confirmed;
  }

  async getConfirmedText(jobDescriptionId: string): Promise<string | undefined> {
    return (await this.getConfirmedTextRecord(jobDescriptionId))?.text;
  }

  async getOriginalFile(jobDescriptionId: string): Promise<StoredFile | undefined> {
    const file = await runTransaction(this.#database, STORE_NAMES.originalFiles, "readonly", (tx) =>
      requestToPromise<StoredFile | undefined>(tx.objectStore(STORE_NAMES.originalFiles).index("ownerType_ownerId").get(["job-description", jobDescriptionId])),
    );
    return file ? normalizeStoredFile(file) : undefined;
  }

  async confirmText(jobDescriptionId: string, text: string): Promise<JobDescriptionConfirmResult> {
    if (!text.trim()) throw new Error("Confirmed job description text cannot be empty.");
    const timestamp = this.#now();
    assertAbsoluteIsoTimestamp(timestamp, "JobDescription.updatedAt");
    return runTransaction(this.#database, [STORE_NAMES.applications, STORE_NAMES.jobDescriptions, STORE_NAMES.jobDescriptionTexts], "readwrite", async (tx) => {
      const jdStore = tx.objectStore(STORE_NAMES.jobDescriptions);
      const textStore = tx.objectStore(STORE_NAMES.jobDescriptionTexts);
      const appStore = tx.objectStore(STORE_NAMES.applications);
      const jd = await requestToPromise<JobDescription | undefined>(jdStore.get(jobDescriptionId));
      if (!jd) throw errorFor("job-description-not-found", "The job description no longer exists.", ACTIONS.selectExisting, { fileName: "", mimeType: "", fileSize: 0 });
      const app = await requestToPromise<Application | undefined>(appStore.get(jd.applicationId));
      if (!app) throw errorFor("application-not-found", "The application no longer exists.", ACTIONS.selectExisting, metadataFor(jd));
      const extracted = await requestToPromise<JobDescriptionText | undefined>(textStore.index("jobDescriptionId_kind").get([jobDescriptionId, "extracted"]));
      const pasted = await requestToPromise<JobDescriptionText | undefined>(textStore.index("jobDescriptionId_kind").get([jobDescriptionId, "pasted"]));
      const kind: JobDescriptionText["kind"] = extracted?.text === text || pasted?.text === text ? "confirmed" : "manual";
      const existing = await requestToPromise<JobDescriptionText | undefined>(textStore.index("jobDescriptionId_kind").get([jobDescriptionId, kind]));
      const textRecord: JobDescriptionText = existing
        ? { ...existing, text, confirmedAt: timestamp, updatedAt: nextUpdatedTimestamp(timestamp, existing.updatedAt) }
        : { id: this.#createId(), createdAt: timestamp, updatedAt: timestamp, jobDescriptionId, kind, text, confirmedAt: timestamp };
      if (existing) await requestToPromise(textStore.put(textRecord)); else await requestToPromise(textStore.add(textRecord));
      const updatedJd: JobDescription = { ...jd, textSource: kind === "manual" ? "manual" : jd.textSource, textConfirmedAt: timestamp, updatedAt: nextUpdatedTimestamp(timestamp, jd.updatedAt) };
      const updatedApp: Application = { ...app, jdText: text, jdFileId: jd.originalFileId, updatedAt: nextUpdatedTimestamp(timestamp, app.updatedAt) };
      await requestToPromise(jdStore.put(updatedJd));
      await requestToPromise(appStore.put(updatedApp));
      return { jobDescription: updatedJd, text: textRecord, application: updatedApp };
    });
  }

  confirm(jobDescriptionId: string, text: string): Promise<JobDescriptionConfirmResult> {
    return this.confirmText(jobDescriptionId, text);
  }

  async retryExtraction(jobDescriptionId: string): Promise<JobDescriptionIngestionResult> {
    const { jobDescription, storedFile } = await runTransaction(this.#database, [STORE_NAMES.jobDescriptions, STORE_NAMES.originalFiles], "readonly", async (tx) => ({
      jobDescription: await requestToPromise<JobDescription | undefined>(tx.objectStore(STORE_NAMES.jobDescriptions).get(jobDescriptionId)),
      storedFile: await requestToPromise<StoredFile | undefined>(tx.objectStore(STORE_NAMES.originalFiles).index("ownerType_ownerId").get(["job-description", jobDescriptionId])),
    }));
    if (!jobDescription) throw errorFor("job-description-not-found", "The job description no longer exists.", ACTIONS.selectExisting, { fileName: "", mimeType: "", fileSize: 0 });
    if (!storedFile) throw errorFor("original-file-missing", "The original job description file is unavailable.", ACTIONS.selectExisting, metadataFor(jobDescription));
    const data = await blobArrayBuffer(storedFile.blob);
    let text: string;
    try { text = await this.#parseText(jobDescription.fileType!, data.slice(0)); if (!text.trim()) throw new Error("No text layer"); }
    catch { const metadata = metadataFor(jobDescription, storedFile.blob.type); const recovery = { code: "extraction-failed" as const, action: ACTIONS.pasteText, metadata }; this.#logger({ event: "job-description-extraction-failed", metadata }); return { outcome: "extraction-failed" as const, jobDescription, recovery }; }
    const timestamp = this.#now();
    assertAbsoluteIsoTimestamp(timestamp, "JobDescription.updatedAt");
    const updated: JobDescription = { ...jobDescription, textSource: "extracted", updatedAt: nextUpdatedTimestamp(timestamp, jobDescription.updatedAt) };
    let extracted: JobDescriptionText = { id: this.#createId(), createdAt: timestamp, updatedAt: timestamp, jobDescriptionId, kind: "extracted", text };
    await runTransaction(this.#database, [STORE_NAMES.jobDescriptions, STORE_NAMES.jobDescriptionTexts], "readwrite", async (tx) => {
      const textStore = tx.objectStore(STORE_NAMES.jobDescriptionTexts);
      const existing = await requestToPromise<JobDescriptionText | undefined>(textStore.index("jobDescriptionId_kind").get([jobDescriptionId, "extracted"]));
      if (existing) {
        extracted = { ...existing, text, updatedAt: nextUpdatedTimestamp(timestamp, existing.updatedAt) };
        await requestToPromise(textStore.put(extracted));
      } else await requestToPromise(textStore.add(extracted));
      await requestToPromise(tx.objectStore(STORE_NAMES.jobDescriptions).put(updated));
    });
    const metadata = metadataFor(updated, storedFile.blob.type);
    this.#logger({ event: "job-description-extraction-retried", metadata });
    return { outcome: "needs-review", jobDescription: updated, extractedText: extracted };
  }
}
