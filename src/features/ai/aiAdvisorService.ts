import type { AiChatMessage } from "../../ai/client";
import { buildAiContext } from "../../ai/prompts";
import { requestToPromise, runTransaction } from "../../db/database";
import { STORE_NAMES } from "../../db/schema";
import { nextUpdatedTimestamp } from "../../db/timestamps";
import type { AiConversation, AiMessage, AnalysisResult, Application, JobDescription, JobDescriptionText, Resume, ResumeText } from "../../db/types";
import { validateAiSettings } from "../../settings/secrets";
import type { AiSettings } from "../../settings/types";

export interface AiAdvisorClient {
  testConnection(): Promise<void>;
  complete(messages: readonly AiChatMessage[]): Promise<string>;
}

export interface AiSendPreview {
  applicationId: string;
  prompt: string;
  resumeId: string;
  resumeVersion: string;
  resumeTextLength: number;
  jdLength: number;
  messageCount: number;
  apiUrl: string;
}

export interface AiAdvisorResult {
  matchOverview: string;
  issues: string[];
  suggestions: string[];
  rewrites: Array<{ original: string; rewrite: string }>;
  missingInfo: string[];
  risks: string[];
  authenticityRisk: boolean;
}

interface AdvisorContext {
  application: Application;
  resume: Resume;
  resumeText: string;
  jdText: string;
  analysisResult?: AnalysisResult;
  conversation?: AiConversation;
}

export interface AiAdvisorServiceDependencies {
  client: AiAdvisorClient;
  settings: AiSettings;
  now?: () => string;
  createId?: () => string;
}

const resultKeys = ["matchOverview", "issues", "suggestions", "rewrites", "missingInfo", "risks"] as const;
const asStrings = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];

export function parseAiAdvisorResult(content: string): AiAdvisorResult {
  let value: unknown;
  try {
    const normalized = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    value = JSON.parse(normalized);
  } catch { throw new Error("AI 返回格式无法解析，请重试"); }
  if (!value || typeof value !== "object") throw new Error("AI 返回格式无法解析，请重试");
  const record = value as Record<string, unknown>;
  if (!resultKeys.every((key) => key in record)) throw new Error("AI 返回缺少必要栏目，请重试");
  const rewrites = Array.isArray(record.rewrites) ? record.rewrites.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const pair = item as Record<string, unknown>;
    return typeof pair.original === "string" && typeof pair.rewrite === "string" ? [{ original: pair.original, rewrite: pair.rewrite }] : [];
  }) : [];
  const suggestions = asStrings(record.suggestions).map((item) => item.startsWith("建议：") ? item : `建议：${item}`);
  const risks = asStrings(record.risks);
  const authenticityRisk = record.authenticityRisk === true || risks.some((item) => /虚构|无法核验|不确定|invent|unverif/i.test(item));
  return { matchOverview: typeof record.matchOverview === "string" ? record.matchOverview : "", issues: asStrings(record.issues), suggestions, rewrites, missingInfo: asStrings(record.missingInfo), risks, authenticityRisk };
}

export function exportAdvisorReport(result: AiAdvisorResult): string {
  const list = (title: string, values: string[]) => `## ${title}\n${values.map((value) => `- ${value}`).join("\n") || "- 暂无"}`;
  return [`# AI 简历优化报告`, `## 匹配概览\n${result.matchOverview}`, list("问题", result.issues), list("建议", result.suggestions), `## 原文/改写对照\n${result.rewrites.map((item) => `- 原文：${item.original}\n  改写：${item.rewrite}`).join("\n") || "- 暂无"}`, list("待补充信息", result.missingInfo), list("风险提示", result.risks), result.authenticityRisk ? "\n> 真实性风险：请逐项核验，禁止虚构经历、技能、学历、成果或数字。" : ""].join("\n\n");
}

export class AiAdvisorService {
  readonly #database: IDBDatabase;
  readonly #client: AiAdvisorClient;
  readonly #settings: AiSettings;
  readonly #now: () => string;
  readonly #createId: () => string;

  constructor(database: IDBDatabase, dependencies: AiAdvisorServiceDependencies) {
    this.#database = database; this.#client = dependencies.client; this.#settings = { ...dependencies.settings, customHeaders: { ...dependencies.settings.customHeaders } };
    this.#now = dependencies.now ?? (() => new Date().toISOString()); this.#createId = dependencies.createId ?? (() => crypto.randomUUID());
  }

  async #readContext(applicationId: string): Promise<AdvisorContext> {
    return runTransaction(this.#database, [STORE_NAMES.applications, STORE_NAMES.resumes, STORE_NAMES.resumeTexts, STORE_NAMES.jobDescriptions, STORE_NAMES.jobDescriptionTexts, STORE_NAMES.analysisResults, STORE_NAMES.aiConversations], "readonly", async (tx) => {
      const application = await requestToPromise<Application | undefined>(tx.objectStore(STORE_NAMES.applications).get(applicationId));
      if (!application) throw new Error("职位不存在");
      if (!application.currentResumeId) throw new Error("职位尚未绑定简历");
      const resume = await requestToPromise<Resume | undefined>(tx.objectStore(STORE_NAMES.resumes).get(application.currentResumeId));
      if (!resume || resume.status === "deleted") throw new Error("当前简历不可用");
      const confirmed = await requestToPromise<ResumeText | undefined>(tx.objectStore(STORE_NAMES.resumeTexts).index("resumeId_kind").get([resume.id, "confirmed"]));
      const manual = await requestToPromise<ResumeText | undefined>(tx.objectStore(STORE_NAMES.resumeTexts).index("resumeId_kind").get([resume.id, "manual"]));
      const resumeText = (resume.textSource === "manual" ? manual : confirmed ?? manual)?.text;
      if (!resumeText?.trim()) throw new Error("简历尚未确认文本");
      const descriptions = await requestToPromise<JobDescription[]>(tx.objectStore(STORE_NAMES.jobDescriptions).index("applicationId").getAll(applicationId));
      let jdText: JobDescriptionText | undefined;
      for (const description of descriptions) {
        const text = await requestToPromise<JobDescriptionText | undefined>(tx.objectStore(STORE_NAMES.jobDescriptionTexts).index("jobDescriptionId_kind").get([description.id, "confirmed"]));
        if (text && (!jdText || text.updatedAt > jdText.updatedAt)) jdText = text;
      }
      if (!jdText?.text.trim()) throw new Error("职位尚未确认 JD 文本");
      const analyses = await requestToPromise<AnalysisResult[]>(tx.objectStore(STORE_NAMES.analysisResults).index("applicationId").getAll(applicationId));
      const analysisResult = analyses.filter((item) => item.mode === "local" && item.resumeId === resume.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      const conversations = await requestToPromise<AiConversation[]>(tx.objectStore(STORE_NAMES.aiConversations).index("applicationId").getAll(applicationId));
      return { application, resume, resumeText, jdText: jdText.text, analysisResult, conversation: conversations.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] };
    });
  }

  async createPreview(applicationId: string, prompt: string): Promise<AiSendPreview> {
    validateAiSettings(this.#settings);
    if (!prompt.trim()) throw new Error("请输入要咨询的问题");
    const context = await this.#readContext(applicationId);
    return { applicationId, prompt, resumeId: context.resume.id, resumeVersion: context.resume.name, resumeTextLength: context.resumeText.length, jdLength: context.jdText.length, messageCount: context.conversation?.messages.length ?? 0, apiUrl: this.#settings.apiUrl };
  }

  async send(applicationId: string, prompt: string): Promise<{ conversation: AiConversation; result: AiAdvisorResult }> {
    validateAiSettings(this.#settings);
    const context = await this.#readContext(applicationId);
    await this.#client.testConnection();
    const aiContext = buildAiContext({ resumeText: context.resumeText, jdText: context.jdText, analysisResult: context.analysisResult });
    const format = "Return JSON only with keys matchOverview (string), issues (string[]), suggestions (string[]), rewrites ({original,rewrite}[]), missingInfo (string[]), risks (string[]), authenticityRisk (boolean).";
    const messages: AiChatMessage[] = [{ role: "system", content: `${aiContext.system}\n${format}` }, { role: "user", content: aiContext.user }, ...(context.conversation?.messages ?? []).map(({ role, content }) => ({ role, content })), { role: "user", content: prompt }];
    const assistantContent = await this.#client.complete(messages);
    const result = parseAiAdvisorResult(assistantContent);
    const timestamp = this.#now();
    const conversation = await runTransaction(this.#database, STORE_NAMES.aiConversations, "readwrite", async (tx) => {
      const store = tx.objectStore(STORE_NAMES.aiConversations);
      const latest = (await requestToPromise<AiConversation[]>(store.index("applicationId").getAll(applicationId))).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
      const pair: AiMessage[] = [{ id: this.#createId(), role: "user", content: prompt, createdAt: timestamp }, { id: this.#createId(), role: "assistant", content: assistantContent, createdAt: timestamp }];
      const record: AiConversation = latest ? { ...latest, messages: [...latest.messages, ...pair], updatedAt: nextUpdatedTimestamp(timestamp, latest.updatedAt) } : { id: this.#createId(), applicationId, messages: pair, createdAt: timestamp, updatedAt: timestamp };
      await requestToPromise(store.put(record)); return record;
    });
    return { conversation, result };
  }

  async getConversation(applicationId: string): Promise<AiConversation | undefined> {
    return runTransaction(this.#database, STORE_NAMES.aiConversations, "readonly", async (tx) => {
      const records = await requestToPromise<AiConversation[]>(tx.objectStore(STORE_NAMES.aiConversations).index("applicationId").getAll(applicationId));
      return records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    });
  }
}
