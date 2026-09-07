import { unzipSync } from "fflate";

import { requestToPromise, runTransaction } from "../../db/database";
import { STORE_NAMES } from "../../db/schema";
import {
  assertAbsoluteIsoTimestamp,
  nextUpdatedTimestamp,
} from "../../db/timestamps";
import type { Resume, ResumeText, StoredFile } from "../../db/types";
import { parseDocx } from "../../parsers/docx";
import { parsePdf } from "../../parsers/pdf";

export const MAX_RESUME_FILE_SIZE = 25 * 1024 * 1024;
/** 单个 DOCX 内部条目解压后的上限，防止 zip 炸弹把标签页内存打爆（合法简历的 document.xml 远小于此）。 */
export const MAX_DOCX_ENTRY_SIZE = 100 * 1024 * 1024;

const MIME_TYPES = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
} as const;

type ResumeFileType = keyof typeof MIME_TYPES;

export type ResumeIngestionErrorCode =
  | "unsupported-format"
  | "type-mismatch"
  | "file-too-large"
  | "invalid-file"
  | "duplicate-file"
  | "resume-not-found"
  | "original-file-missing";

export type ResumeRecoveryActionCode =
  | "choose-pdf-or-docx"
  | "choose-matching-file"
  | "choose-smaller-file"
  | "choose-valid-file"
  | "use-existing-resume"
  | "paste-or-correct-text"
  | "select-existing-resume";

export interface ResumeRecoveryAction {
  code: ResumeRecoveryActionCode;
  message: string;
}

export interface ResumeFileMetadata {
  fileName: string;
  mimeType: string;
  fileSize: number;
  fileType?: ResumeFileType;
  fileHash?: string;
  status?: Resume["status"];
}

export class ResumeIngestionError extends Error {
  readonly code: ResumeIngestionErrorCode;
  readonly action: ResumeRecoveryAction;
  readonly metadata: ResumeFileMetadata;
  readonly existingResumeId?: string;

  constructor(options: {
    code: ResumeIngestionErrorCode;
    message: string;
    action: ResumeRecoveryAction;
    metadata: ResumeFileMetadata;
    existingResumeId?: string;
  }) {
    super(options.message);
    this.name = "ResumeIngestionError";
    this.code = options.code;
    this.action = options.action;
    this.metadata = options.metadata;
    this.existingResumeId = options.existingResumeId;
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      action: this.action,
      metadata: this.metadata,
      ...(this.existingResumeId
        ? { existingResumeId: this.existingResumeId }
        : {}),
    };
  }
}

export interface ResumeIngestionLogEntry {
  event: "resume-ingested" | "resume-extraction-failed" | "resume-extraction-retried";
  metadata: ResumeFileMetadata;
}

export interface ResumeExtractionRecovery {
  code: "extraction-failed";
  action: ResumeRecoveryAction;
  metadata: ResumeFileMetadata;
}

export interface ResumeIngestionResult {
  outcome: "needs-review" | "extraction-failed";
  resume: Resume;
  extractedText?: ResumeText;
  recovery?: ResumeExtractionRecovery;
}

export interface ResumeDownloadData {
  blob: Blob;
  fileName: string;
  mimeType: string;
}

export interface ResumeIngestionDependencies {
  now?: () => string;
  createId?: () => string;
  parseText?: (fileType: ResumeFileType, data: ArrayBuffer) => Promise<string>;
  logger?: (entry: ResumeIngestionLogEntry) => void;
}

const ACTIONS = {
  chooseSupported: {
    code: "choose-pdf-or-docx",
    message: "Choose a PDF or DOCX file.",
  },
  chooseMatching: {
    code: "choose-matching-file",
    message: "Choose a file whose extension and MIME type match.",
  },
  chooseSmaller: {
    code: "choose-smaller-file",
    message: "Choose a file no larger than 25 MB.",
  },
  chooseValid: {
    code: "choose-valid-file",
    message: "Choose a valid, unmodified PDF or DOCX file.",
  },
  useExisting: {
    code: "use-existing-resume",
    message: "Use the resume version that was already imported.",
  },
  pasteText: {
    code: "paste-or-correct-text",
    message: "Paste or correct the resume text manually.",
  },
  selectExisting: {
    code: "select-existing-resume",
    message: "Select an existing resume and try again.",
  },
} as const satisfies Record<string, ResumeRecoveryAction>;

function fileMetadata(file: File, fileType?: ResumeFileType): ResumeFileMetadata {
  return {
    fileName: file.name,
    mimeType: file.type,
    fileSize: file.size,
    ...(fileType ? { fileType } : {}),
  };
}

function ingestionError(
  code: ResumeIngestionErrorCode,
  message: string,
  action: ResumeRecoveryAction,
  metadata: ResumeFileMetadata,
  existingResumeId?: string,
): ResumeIngestionError {
  return new ResumeIngestionError({
    code,
    message,
    action,
    metadata,
    ...(existingResumeId ? { existingResumeId } : {}),
  });
}

function extensionOf(fileName: string): string | undefined {
  const dot = fileName.lastIndexOf(".");
  return dot < 0 ? undefined : fileName.slice(dot + 1).toLowerCase();
}

function validateFileMetadata(file: File): ResumeFileType {
  const extension = extensionOf(file.name);
  if (extension !== "pdf" && extension !== "docx") {
    throw ingestionError(
      "unsupported-format",
      "Only PDF and DOCX resume files are supported.",
      ACTIONS.chooseSupported,
      fileMetadata(file),
    );
  }

  if (file.size > MAX_RESUME_FILE_SIZE) {
    throw ingestionError(
      "file-too-large",
      "The resume file exceeds the 25 MB limit.",
      ACTIONS.chooseSmaller,
      fileMetadata(file, extension),
    );
  }

  if (file.type.toLowerCase() !== MIME_TYPES[extension]) {
    throw ingestionError(
      "type-mismatch",
      "The resume file extension and MIME type do not match.",
      ACTIONS.chooseMatching,
      fileMetadata(file, extension),
    );
  }

  return extension;
}

function hasPrefix(data: Uint8Array, prefix: readonly number[]): boolean {
  return prefix.every((byte, index) => data[index] === byte);
}

function validateFileContents(
  file: File,
  fileType: ResumeFileType,
  data: Uint8Array,
): void {
  let valid = false;
  if (fileType === "pdf") {
    const source = new TextDecoder("latin1").decode(data);
    valid =
      hasPrefix(data, [0x25, 0x50, 0x44, 0x46, 0x2d]) &&
      source.includes("%%EOF");
  } else if (hasPrefix(data, [0x50, 0x4b, 0x03, 0x04])) {
    try {
      const requiredEntries = new Set(["[Content_Types].xml", "word/document.xml"]);
      const entries = unzipSync(data, {
        filter: (entry) => {
          // fflate 在解压前就给出声明的 originalSize，用它拦截压缩炸弹，避免真正展开到内存。
          if (entry.originalSize > MAX_DOCX_ENTRY_SIZE) {
            throw new Error("docx-entry-too-large");
          }
          return requiredEntries.has(entry.name);
        },
      });
      valid = [...requiredEntries].every((name) => entries[name] !== undefined);
    } catch {
      valid = false;
    }
  }

  if (!valid) {
    throw ingestionError(
      "invalid-file",
      `The selected ${fileType.toUpperCase()} file is invalid.`,
      ACTIONS.chooseValid,
      fileMetadata(file, fileType),
    );
  }
}

async function sha256(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function defaultParseText(
  fileType: ResumeFileType,
  data: ArrayBuffer,
): Promise<string> {
  return fileType === "pdf" ? parsePdf(data) : parseDocx(data);
}

function safeMetadata(resume: Resume, mimeType: string): ResumeFileMetadata {
  return {
    fileName: resume.fileName,
    mimeType,
    fileSize: resume.fileSize,
    fileType: resume.type,
    fileHash: resume.fileHash,
    status: resume.status,
  };
}

function extractionRecovery(metadata: ResumeFileMetadata): ResumeExtractionRecovery {
  return {
    code: "extraction-failed",
    action: ACTIONS.pasteText,
    metadata,
  };
}

function resumeName(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return (dot > 0 ? fileName.slice(0, dot) : fileName).trim() || "Resume";
}

async function blobArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === "function") return blob.arrayBuffer();
  return new Response(blob).arrayBuffer();
}

async function normalizeStoredFile(storedFile: StoredFile): Promise<StoredFile> {
  const bytes = await blobArrayBuffer(storedFile.blob);
  return {
    ...storedFile,
    blob: new Blob([bytes], { type: storedFile.blob.type }),
  };
}

export class ResumeIngestionService {
  readonly #database: IDBDatabase;
  readonly #now: () => string;
  readonly #createId: () => string;
  readonly #parseText: ResumeIngestionDependencies["parseText"];
  readonly #logger: NonNullable<ResumeIngestionDependencies["logger"]>;

  constructor(
    database: IDBDatabase,
    dependencies: ResumeIngestionDependencies = {},
  ) {
    this.#database = database;
    this.#now = dependencies.now ?? (() => new Date().toISOString());
    this.#createId = dependencies.createId ?? (() => crypto.randomUUID());
    this.#parseText = dependencies.parseText ?? defaultParseText;
    this.#logger = dependencies.logger ?? (() => undefined);
  }

  async ingest(file: File): Promise<ResumeIngestionResult> {
    const fileType = validateFileMetadata(file);
    const data = await file.arrayBuffer();
    validateFileContents(file, fileType, new Uint8Array(data));
    const fileHash = await sha256(data);
    const timestamp = this.#now();
    assertAbsoluteIsoTimestamp(timestamp, "Resume.uploadedAt");

    let extractedText: string | undefined;
    try {
      const parsed = await this.#parseText!(fileType, data.slice(0));
      if (!parsed.trim()) throw new Error("No text layer");
      extractedText = parsed;
    } catch {
      extractedText = undefined;
    }

    const resumeId = this.#createId();
    const originalFileId = this.#createId();
    const status: Resume["status"] = extractedText
      ? "needs-review"
      : "extraction-failed";
    const resume: Resume = {
      id: resumeId,
      createdAt: timestamp,
      updatedAt: timestamp,
      name: resumeName(file.name),
      type: fileType,
      fileName: file.name,
      fileSize: file.size,
      fileHash,
      uploadedAt: timestamp,
      tags: [],
      note: "",
      status,
      ...(extractedText ? { textSource: "extracted" as const } : {}),
      originalFileId,
    };
    const originalBlob = await new Response(data, {
      headers: { "content-type": file.type || MIME_TYPES[fileType] },
    }).blob();
    const storedFile: StoredFile = {
      id: originalFileId,
      createdAt: timestamp,
      updatedAt: timestamp,
      ownerType: "resume",
      ownerId: resumeId,
      fileName: file.name,
      fileType,
      blob: originalBlob,
    };
    const textRecord: ResumeText | undefined = extractedText
      ? {
          id: this.#createId(),
          createdAt: timestamp,
          updatedAt: timestamp,
          resumeId,
          kind: "extracted",
          text: extractedText,
        }
      : undefined;
    const metadata = safeMetadata(resume, storedFile.blob.type);

    await runTransaction(
      this.#database,
      [STORE_NAMES.resumes, STORE_NAMES.originalFiles, STORE_NAMES.resumeTexts],
      "readwrite",
      async (transaction) => {
        const resumeStore = transaction.objectStore(STORE_NAMES.resumes);
        const duplicate = await requestToPromise<Resume | undefined>(
          resumeStore.index("fileHash").get(fileHash),
        );
        if (duplicate) {
          throw ingestionError(
            "duplicate-file",
            "This resume file was already imported.",
            ACTIONS.useExisting,
            metadata,
            duplicate.id,
          );
        }

        await requestToPromise(resumeStore.add(resume));
        await requestToPromise(
          transaction.objectStore(STORE_NAMES.originalFiles).add(storedFile),
        );
        if (textRecord) {
          await requestToPromise(
            transaction.objectStore(STORE_NAMES.resumeTexts).add(textRecord),
          );
        }
      },
    );

    if (textRecord) {
      this.#logger({ event: "resume-ingested", metadata });
      return { outcome: "needs-review", resume, extractedText: textRecord };
    }

    const recovery = extractionRecovery(metadata);
    this.#logger({ event: "resume-extraction-failed", metadata });
    return { outcome: "extraction-failed", resume, recovery };
  }

  async getOriginalFile(resumeId: string): Promise<StoredFile | undefined> {
    const storedFile = await runTransaction(
      this.#database,
      STORE_NAMES.originalFiles,
      "readonly",
      (transaction) =>
        requestToPromise<StoredFile | undefined>(
          transaction
            .objectStore(STORE_NAMES.originalFiles)
            .index("ownerType_ownerId")
            .get(["resume", resumeId]),
        ),
    );
    return storedFile ? await normalizeStoredFile(storedFile) : undefined;
  }

  async getDownloadData(resumeId: string): Promise<ResumeDownloadData> {
    const storedFile = await this.getOriginalFile(resumeId);
    if (!storedFile) {
      throw ingestionError(
        "original-file-missing",
        "The original resume file is unavailable.",
        ACTIONS.selectExisting,
        { fileName: "", mimeType: "", fileSize: 0 },
      );
    }
    return {
      blob: storedFile.blob,
      fileName: storedFile.fileName,
      mimeType: storedFile.blob.type || MIME_TYPES[storedFile.fileType],
    };
  }

  async retryExtraction(resumeId: string): Promise<ResumeIngestionResult> {
    const { resume, storedFile } = await runTransaction(
      this.#database,
      [STORE_NAMES.resumes, STORE_NAMES.originalFiles],
      "readonly",
      async (transaction) => {
        const foundResume = await requestToPromise<Resume | undefined>(
          transaction.objectStore(STORE_NAMES.resumes).get(resumeId),
        );
        const foundFile = await requestToPromise<StoredFile | undefined>(
          transaction
            .objectStore(STORE_NAMES.originalFiles)
            .index("ownerType_ownerId")
            .get(["resume", resumeId]),
        );
        return { resume: foundResume, storedFile: foundFile };
      },
    );

    if (!resume) {
      throw ingestionError(
        "resume-not-found",
        "The resume no longer exists.",
        ACTIONS.selectExisting,
        { fileName: "", mimeType: "", fileSize: 0 },
      );
    }
    if (!storedFile) {
      throw ingestionError(
        "original-file-missing",
        "The original resume file is unavailable.",
        ACTIONS.selectExisting,
        safeMetadata(resume, ""),
      );
    }

    const normalizedStoredFile = await normalizeStoredFile(storedFile);
    const data = await blobArrayBuffer(normalizedStoredFile.blob);
    let text: string;
    try {
      text = await this.#parseText!(resume.type, data.slice(0));
      if (!text.trim()) throw new Error("No text layer");
    } catch {
      const metadata = safeMetadata(resume, normalizedStoredFile.blob.type);
      const recovery = extractionRecovery(metadata);
      this.#logger({ event: "resume-extraction-failed", metadata });
      return { outcome: "extraction-failed", resume, recovery };
    }

    const timestamp = this.#now();
    assertAbsoluteIsoTimestamp(timestamp, "Resume.updatedAt");
    const updatedResume: Resume = {
      ...resume,
      status: "needs-review",
      textSource: "extracted",
      updatedAt: nextUpdatedTimestamp(timestamp, resume.updatedAt),
    };
    const textRecord: ResumeText = {
      id: this.#createId(),
      createdAt: timestamp,
      updatedAt: timestamp,
      resumeId,
      kind: "extracted",
      text,
    };

    await runTransaction(
      this.#database,
      [STORE_NAMES.resumes, STORE_NAMES.resumeTexts],
      "readwrite",
      async (transaction) => {
        const textStore = transaction.objectStore(STORE_NAMES.resumeTexts);
        const existingText = await requestToPromise<ResumeText | undefined>(
          textStore.index("resumeId_kind").get([resumeId, "extracted"]),
        );
        if (existingText) {
          throw new Error("Extracted resume text is immutable");
        }
        await requestToPromise(textStore.add(textRecord));
        await requestToPromise(
          transaction.objectStore(STORE_NAMES.resumes).put(updatedResume),
        );
      },
    );

    const metadata = safeMetadata(updatedResume, normalizedStoredFile.blob.type);
    this.#logger({ event: "resume-extraction-retried", metadata });
    return {
      outcome: "needs-review",
      resume: updatedResume,
      extractedText: textRecord,
    };
  }
}
