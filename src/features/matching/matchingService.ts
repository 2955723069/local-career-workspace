import { requestToPromise, runTransaction } from "../../db/database";
import { STORE_NAMES } from "../../db/schema";
import type { AnalysisResult, Application, JobDescription, JobDescriptionText, Resume, ResumeText } from "../../db/types";
import { runLocalMatch } from "../../matching/scoring";

export interface MatchingServiceDependencies {
  now?: () => string;
  createId?: () => string;
}

function defaultNow(): string { return new Date().toISOString(); }
function defaultCreateId(): string { return crypto.randomUUID(); }

export class MatchingService {
  readonly #database: IDBDatabase;
  readonly #now: () => string;
  readonly #createId: () => string;

  constructor(database: IDBDatabase, dependencies: MatchingServiceDependencies = {}) {
    this.#database = database;
    this.#now = dependencies.now ?? defaultNow;
    this.#createId = dependencies.createId ?? defaultCreateId;
  }

  async run(applicationId: string, resumeId: string): Promise<AnalysisResult> {
    const { application, resume, jdText, resumeText } = await runTransaction(
      this.#database,
      [STORE_NAMES.applications, STORE_NAMES.resumes, STORE_NAMES.jobDescriptions, STORE_NAMES.jobDescriptionTexts, STORE_NAMES.resumeTexts],
      "readonly",
      async (tx) => {
        const app = await requestToPromise<Application | undefined>(tx.objectStore(STORE_NAMES.applications).get(applicationId));
        if (!app) throw new Error("职位不存在");
        const resumeRecord = await requestToPromise<Resume | undefined>(tx.objectStore(STORE_NAMES.resumes).get(resumeId));
        if (!resumeRecord || resumeRecord.status === "deleted") throw new Error("可用简历不存在");
        const jdStore = tx.objectStore(STORE_NAMES.jobDescriptions);
        const jdCandidates = await requestToPromise<JobDescription[]>(jdStore.index("applicationId").getAll(applicationId));
        let confirmedJd: JobDescriptionText | undefined;
        for (const jd of jdCandidates) {
          const candidate = await requestToPromise<JobDescriptionText | undefined>(tx.objectStore(STORE_NAMES.jobDescriptionTexts).index("jobDescriptionId_kind").get([jd.id, "confirmed"]));
          if (candidate && (!confirmedJd || candidate.updatedAt > confirmedJd.updatedAt)) confirmedJd = candidate;
        }
        const resumeTextRecord = await requestToPromise<ResumeText | undefined>(tx.objectStore(STORE_NAMES.resumeTexts).index("resumeId_kind").get([resumeId, "confirmed"]));
        const manualTextRecord = await requestToPromise<ResumeText | undefined>(tx.objectStore(STORE_NAMES.resumeTexts).index("resumeId_kind").get([resumeId, "manual"]));
        const selectedResumeText = resumeRecord.textSource === "manual" ? manualTextRecord : resumeTextRecord ?? manualTextRecord;
        return { application: app, resume: resumeRecord, jdText: confirmedJd?.text, resumeText: selectedResumeText?.text };
      },
    );
    if (!jdText?.trim()) throw new Error("职位尚未确认 JD 文本");
    if (!resumeText?.trim()) throw new Error("简历尚未确认文本");
    const scored = runLocalMatch(jdText, resumeText);
    const timestamp = this.#now();
    const result: AnalysisResult = {
      id: this.#createId(), createdAt: timestamp, updatedAt: timestamp,
      applicationId: application.id, resumeId: resume.id, mode: "local",
      coverage: scored.coverage,
      matchedKeywords: scored.matchedKeywords,
      weakMatches: scored.weakMatches.map((item) => item.original),
      missingKeywords: scored.missingKeywords,
      evidence: scored.evidence,
      uncertainItems: scored.uncertainItems,
      recommendations: scored.recommendations,
    };
    await runTransaction(this.#database, STORE_NAMES.analysisResults, "readwrite", (tx) =>
      requestToPromise(tx.objectStore(STORE_NAMES.analysisResults).add(result)),
    );
    return result;
  }

  async listHistory(applicationId: string, resumeId?: string, mode: "local" | "ai" = "local"): Promise<AnalysisResult[]> {
    const records = await runTransaction(this.#database, STORE_NAMES.analysisResults, "readonly", (tx) =>
      requestToPromise<AnalysisResult[]>(tx.objectStore(STORE_NAMES.analysisResults).index("applicationId").getAll(applicationId)),
    );
    return records.filter((record) => record.mode === mode && (!resumeId || record.resumeId === resumeId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  get(id: string): Promise<AnalysisResult | undefined> {
    return runTransaction(this.#database, STORE_NAMES.analysisResults, "readonly", (tx) =>
      requestToPromise<AnalysisResult | undefined>(tx.objectStore(STORE_NAMES.analysisResults).get(id)),
    );
  }
}
