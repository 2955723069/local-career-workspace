import type { ResumeLibraryService } from "../../features/resumes/resumeLibrary";
import type { AnalysisResult, Application, Resume, Stage } from "../../db/types";
import { exportAdvisorReport, parseAiAdvisorResult, type AiAdvisorResult, type AiAdvisorService } from "../../features/ai/aiAdvisorService";
import { createSendPreview, type SendPreviewElement } from "../SendPreview/SendPreview";

export interface ApplicationBoardOptions {
  applicationService?: {
    listApplications(): Promise<Application[]>;
    createApplication(input: Record<string, unknown>): Promise<Application>;
    updateApplication(id: string, patch: Record<string, unknown>): Promise<Application>;
    changeStage(id: string, stageId: string): Promise<Application>;
    bindResume(id: string, resumeId?: string): Promise<Application>;
    updateNote(id: string, note: string): Promise<Application>;
    listTimeline(id: string): Promise<any[]>;
    listResumeUsageHistory(id: string): Promise<any[]>;
    previewArchive(id: string): Promise<ActionPreview>;
    confirmArchive(id: string, preview: ActionPreview): Promise<Application>;
    previewDelete(id: string): Promise<ActionPreview>;
    confirmDelete(id: string, preview: ActionPreview): Promise<void>;
  };
  stageService?: {
    ensureDefaultStages(): Promise<Stage[]>;
    listStages(): Promise<Stage[]>;
    updateStage(id: string, patch: Record<string, unknown>): Promise<Stage>;
    reorderStages(ids: readonly string[]): Promise<Stage[]>;
    previewDelete(id: string): Promise<{ id: string; name: string; kind: string; applicationCount: number }>;
    deleteStage(id: string, options?: Record<string, unknown>): Promise<void>;
    getOutcomeCounts(): Promise<{ offer: number; rejected: number; withdrawn: number }>;
  };
  jobDescriptionService?: {
    ingestPaste(applicationId: string, text: string): Promise<any>;
    ingestFile?: (applicationId: string, file: File) => Promise<any>;
    confirmText(jobDescriptionId: string, text: string): Promise<any>;
  };
  resumeLibrary?: Pick<ResumeLibraryService, "search" | "getConfirmedText">;
  matchingService?: {
    run(applicationId: string, resumeId: string): Promise<AnalysisResult>;
    listHistory(applicationId: string, resumeId?: string, mode?: "local" | "ai"): Promise<AnalysisResult[]>;
    get(id: string): Promise<AnalysisResult | undefined>;
  };
  aiAdvisorService?: Pick<AiAdvisorService, "createPreview" | "send" | "getConversation">;
  signal?: AbortSignal;
}

type ActionPreview = { id: string; company?: string; position?: string; name?: string; resumeUsageCount?: number; timelineEventCount?: number; applicationCount?: number; archived?: boolean; kind?: string };

const JOB_TYPES = ["graduate", "internship", "tech", "general", "other"] as const;
const WORK_MODES = ["onsite", "remote", "hybrid", "unknown"] as const;

/** 只允许 http/https 作为职位网址链接，拦截 javascript: 等危险协议。非法时返回空串。 */
function safeHref(value: string): string {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

/** 把存储的绝对 ISO 时间转成 datetime-local 需要的本地墙钟字符串，与保存时的 new Date(local).toISOString() 对称，避免每次编辑漂移一个时区偏移。 */
function isoToLocalDatetimeInput(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const defaultApplicationService = {
  listApplications: async () => [] as Application[],
  createApplication: async (input: Record<string, unknown>) => ({ ...input, id: crypto.randomUUID(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } as Application),
  updateApplication: async (id: string, patch: Record<string, unknown>) => ({ ...patch, id } as Application),
  changeStage: async () => undefined as never,
  bindResume: async () => undefined as never,
  updateNote: async () => undefined as never,
  listTimeline: async () => [],
  listResumeUsageHistory: async () => [],
  previewArchive: async () => undefined as never,
  confirmArchive: async () => undefined as never,
  previewDelete: async () => undefined as never,
  confirmDelete: async () => undefined,
};

const defaultStageService = {
  ensureDefaultStages: async () => [] as Stage[],
  listStages: async () => [] as Stage[],
  updateStage: async () => undefined as never,
  reorderStages: async () => [],
  previewDelete: async () => undefined as never,
  deleteStage: async () => undefined,
  getOutcomeCounts: async () => ({ offer: 0, rejected: 0, withdrawn: 0 }),
};

export function createApplicationBoard(
  documentRef: Document,
  options: ApplicationBoardOptions = {},
): HTMLElement {
  const applicationService = options.applicationService ?? defaultApplicationService;
  const stageService = options.stageService ?? defaultStageService;
  const root = documentRef.createElement("section");
  root.className = "application-board";
  root.setAttribute("aria-labelledby", "application-board-title");
  root.innerHTML = `
    <div class="section-heading application-board__heading">
      <div><p class="section-label">申请管理</p><h2 id="application-board-title">职位申请</h2></div>
      <div class="application-board__controls">
        <button type="button" data-view="board" aria-pressed="true">看板</button>
        <button type="button" data-view="list" aria-pressed="false">列表</button>
        <label for="application-job-type">筛选职位类型</label>
        <select id="application-job-type"><option value="">全部类型</option>${JOB_TYPES.map((value) => `<option value="${value}">${value}</option>`).join("")}</select>
        <label class="application-board__archived-toggle"><input type="checkbox" data-show-archived />显示已归档</label>
      </div>
    </div>
    <div class="application-board__status" role="status" aria-live="polite" aria-atomic="true">正在读取职位...</div>
    <form class="application-form" data-form="application">
      <div class="application-form__header"><h3 data-form-title>创建职位</h3><button type="button" data-action="cancel-edit" hidden>取消编辑</button></div>
      <div class="application-form__grid">
        <label for="application-company">公司<input id="application-company" name="company" required /></label>
        <label for="application-position">职位<input id="application-position" name="position" required /></label>
        <label for="application-job-type-field">职位类型<select id="application-job-type-field" name="jobType">${JOB_TYPES.map((value) => `<option value="${value}">${value}</option>`).join("")}</select></label>
        <label for="application-location">地点<input id="application-location" name="location" /></label>
        <label for="application-work-mode">工作模式<select id="application-work-mode" name="workMode">${WORK_MODES.map((value) => `<option value="${value}">${value}</option>`).join("")}</select></label>
        <label for="application-salary">薪资<input id="application-salary" name="salaryText" /></label>
        <label for="application-source">来源<input id="application-source" name="source" /></label>
        <label for="application-job-url">招聘网址<input id="application-job-url" name="jobUrl" type="url" /></label>
        <label for="application-deadline">截止时间<input id="application-deadline" name="deadline" type="datetime-local" /></label>
        <label for="application-contact">联系人<input id="application-contact" name="contact" /></label>
        <label for="application-priority">优先级<input id="application-priority" name="priority" type="number" min="0" step="1" value="0" /></label>
        <label for="application-stage">阶段<select id="application-stage" name="stageId"></select></label>
        <label for="application-resume">当前简历<select id="application-resume" name="currentResumeId"><option value="">暂不绑定</option></select></label>
      </div>
      <label for="application-note">职位备注<textarea id="application-note" name="note" rows="2"></textarea></label>
      <label for="application-jd-text">确认 JD 文本<textarea id="application-jd-text" name="jdText" rows="5" placeholder="粘贴职位描述"></textarea></label>
      <label class="application-file-label" for="application-jd-file">上传 JD（PDF/DOCX）<input id="application-jd-file" name="jdFile" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" /></label>
      <div class="application-form__actions"><button type="submit" data-submit-application>保存职位</button><button type="button" data-action="confirm-jd" hidden>确认 JD 文本</button></div>
    </form>
    <div class="application-board-view" data-view-panel="board"></div>
    <div class="application-list-view" data-view-panel="list" hidden></div>
    <section class="stage-manager" aria-labelledby="stage-manager-title">
      <div class="section-heading"><h3 id="stage-manager-title">阶段管理</h3><span class="stage-outcome-counts" role="status"></span></div>
      <div class="stage-manager__list"></div>
    </section>
    <section class="application-detail" aria-labelledby="application-detail-title" hidden>
      <div class="section-heading"><h3 id="application-detail-title">职位详情</h3><button type="button" data-action="close-detail">关闭</button></div>
      <div class="application-detail__content"></div>
    </section>
    <div class="application-confirm" role="dialog" aria-modal="true" aria-labelledby="application-confirm-title" hidden>
      <h3 id="application-confirm-title">确认操作</h3><p data-confirm-summary></p>
      <div><button type="button" data-action="confirm-application-action">确认</button><button type="button" data-action="cancel-application-action">取消</button></div>
    </div>
  `;

  const status = root.querySelector<HTMLElement>(".application-board__status")!;
  const board = root.querySelector<HTMLElement>('[data-view-panel="board"]')!;
  const list = root.querySelector<HTMLElement>('[data-view-panel="list"]')!;
  const form = root.querySelector<HTMLFormElement>('form[data-form="application"]')!;
  const detail = root.querySelector<HTMLElement>(".application-detail")!;
  const detailContent = root.querySelector<HTMLElement>(".application-detail__content")!;
  const confirmDialog = root.querySelector<HTMLElement>(".application-confirm")!;
  const confirmSummary = root.querySelector<HTMLElement>("[data-confirm-summary]")!;
  let activeAdvisorResult: AiAdvisorResult | undefined;
  let advisorPreview: SendPreviewElement | undefined;
  const stageSelect = form.elements.namedItem("stageId") as HTMLSelectElement;
  const resumeSelect = form.elements.namedItem("currentResumeId") as HTMLSelectElement;
  let applications: Application[] = [];
  let stages: Stage[] = [];
  let resumes: Resume[] = [];
  let view: "board" | "list" = "board";
  let filter = "";
  let showArchived = false;
  let editingId: string | undefined;
  let detailId: string | undefined;
  let pendingAction: { type: "archive" | "delete" | "stage-delete"; id: string; preview: ActionPreview; replacementStageId?: string } | undefined;
  let pendingJobDescriptionId: string | undefined;
  let confirmReturnFocus: HTMLElement | undefined;

  if (options.aiAdvisorService) {
    const previewElement = createSendPreview(documentRef, {
      onConfirm: async (preview) => {
        if (!options.aiAdvisorService) return;
        try {
          const response = await options.aiAdvisorService.send(preview.applicationId, preview.prompt);
          activeAdvisorResult = response.result;
          await showDetail(preview.applicationId);
          setStatus("AI 建议已保存");
        } catch (error) {
          setStatus("AI 发送失败，资料未改变；可重新打开预览重试");
          throw error instanceof Error ? error : new Error("AI send failed");
        }
      },
    });
    advisorPreview = previewElement;
    root.append(previewElement);
  }

  const esc = (value: unknown): string => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char] ?? char));
  const visibleApplications = () => applications.filter((item) => (showArchived || !item.archivedAt) && (!filter || item.jobType === filter));
  const stageById = (id: string) => stages.find((stage) => stage.id === id);
  const setStatus = (message: string) => { status.textContent = message; };
  const openConfirm = (trigger: HTMLElement) => {
    confirmReturnFocus = trigger;
    confirmDialog.hidden = false;
    (confirmDialog.querySelector('[data-action="confirm-application-action"]') as HTMLButtonElement).focus();
  };
  const closeConfirm = () => {
    confirmDialog.hidden = true;
    pendingAction = undefined;
    confirmReturnFocus?.focus();
    confirmReturnFocus = undefined;
  };

  function renderApplications(): void {
    const items = visibleApplications();
    board.innerHTML = stages.map((stage) => {
      const cards = items.filter((item) => item.stageId === stage.id).map((item) => `
        <article class="application-card${item.archivedAt ? " application-card--archived" : ""}" data-application-id="${esc(item.id)}">
          <h4>${esc(item.company)}${item.archivedAt ? ' <span class="application-card__archived-badge">已归档</span>' : ""}</h4><p>${esc(item.position)}</p>
          <p class="application-card__meta">${esc(item.location)} · ${esc(item.jobType)} · ${esc(item.workMode)}</p>
          <p class="application-card__stage" style="--stage-color:${esc(stage.color)}">${esc(stage.name)}</p>
          <p class="application-card__resume">${item.currentResumeId ? `简历：${esc(resumes.find((resume) => resume.id === item.currentResumeId)?.name ?? item.currentResumeId)}` : "未绑定简历"}</p>
          <div class="application-card__actions"><button type="button" data-action="details" data-application-id="${esc(item.id)}">查看详情</button><button type="button" data-action="edit" data-application-id="${esc(item.id)}">编辑</button><button type="button" data-action="advance" data-application-id="${esc(item.id)}">推进阶段</button></div>
        </article>`).join("");
      return `<section class="application-stage-column" data-stage-id="${esc(stage.id)}"><h3><span style="--stage-color:${esc(stage.color)}">${esc(stage.name)}</span><small>${cards ? cards.match(/class="application-card"/g)?.length ?? 0 : 0}</small></h3>${cards || `<p class="application-empty">暂无职位</p>`}</section>`;
    }).join("");
    list.innerHTML = items.map((item) => {
      const stage = stageById(item.stageId);
      return `<article class="application-list-row"><div><strong>${esc(item.company)}</strong><span>${esc(item.position)}</span></div><div>${esc(stage?.name ?? "未知阶段")}</div><div>${esc(item.jobType)}</div><div class="application-row-actions"><button type="button" data-action="details" data-application-id="${esc(item.id)}">详情</button><button type="button" data-action="edit" data-application-id="${esc(item.id)}">编辑</button><button type="button" data-action="advance" data-application-id="${esc(item.id)}">推进</button></div></article>`;
    }).join("") || `<p class="application-empty">暂无职位</p>`;
    board.hidden = view !== "board";
    list.hidden = view !== "list";
    root.querySelectorAll<HTMLButtonElement>("[data-view]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.view === view));
    });
    setStatus(`${items.length} 个职位，当前为${view === "board" ? "看板" : "列表"}视图`);
  }

  async function renderStages(): Promise<void> {
    const manager = root.querySelector<HTMLElement>(".stage-manager__list")!;
    manager.innerHTML = stages.map((stage, index) => `<div class="stage-manager__item" data-stage-id="${esc(stage.id)}"><label>阶段名称<input data-stage-name value="${esc(stage.name)}" /></label><label>颜色<input data-stage-color type="color" value="${esc(stage.color)}" /></label><button type="button" data-action="save-stage">保存</button><button type="button" data-action="move-stage-up" ${index === 0 ? "disabled" : ""}>上移</button><button type="button" data-action="move-stage-down" ${index === stages.length - 1 ? "disabled" : ""}>下移</button>${stage.kind === "normal" ? `<button type="button" data-action="delete-stage">删除</button>` : ""}</div>`).join("");
    const counts = await stageService.getOutcomeCounts();
    const countElement = root.querySelector<HTMLElement>(".stage-outcome-counts")!;
    countElement.textContent = `Offer ${counts.offer} · 拒绝 ${counts.rejected} · 放弃 ${counts.withdrawn}`;
    stageSelect.innerHTML = stages.map((stage) => `<option value="${esc(stage.id)}">${esc(stage.name)}</option>`).join("");
  }

  async function load(): Promise<void> {
    try {
      if (stageService.ensureDefaultStages) await stageService.ensureDefaultStages();
      [applications, stages] = await Promise.all([applicationService.listApplications(), stageService.listStages()]);
      resumes = options.resumeLibrary ? await options.resumeLibrary.search("") : [];
      const defaultResume = resumes.find((r) => r.isDefault && r.status !== "deleted");
      resumeSelect.innerHTML = `<option value="">暂不绑定</option>${resumes.filter((resume) => resume.status !== "deleted").map((resume) => `<option value="${esc(resume.id)}">${esc(resume.name)}${resume.isDefault ? " (通用)" : ""}</option>`).join("")}`;
      if (defaultResume) resumeSelect.value = defaultResume.id;
      await renderStages();
      renderApplications();
    } catch { setStatus("职位读取失败，请重试"); }
  }

  function resetForm(): void {
    form.reset();
    editingId = undefined;
    (form.querySelector("[data-form-title]") as HTMLElement).textContent = "创建职位";
    (form.querySelector('[data-action="cancel-edit"]') as HTMLButtonElement).hidden = true;
    if (stages[0]) stageSelect.value = stages[0].id;
    const defaultResume = resumes.find((r) => r.isDefault && r.status !== "deleted");
    if (defaultResume) resumeSelect.value = defaultResume.id;
  }

  async function showDetail(id: string): Promise<void> {
    const item = applications.find((entry) => entry.id === id);
    if (!item) return;
    detailId = id;
    const [timeline, history, analysisHistory, conversation] = await Promise.all([applicationService.listTimeline(id), applicationService.listResumeUsageHistory(id), options.matchingService?.listHistory(id) ?? Promise.resolve([]), options.aiAdvisorService?.getConversation(id) ?? Promise.resolve(undefined)]);
    const latestAssistant = conversation?.messages.slice().reverse().find((message) => message.role === "assistant");
    activeAdvisorResult = undefined;
    if (latestAssistant) { try { activeAdvisorResult = parseAiAdvisorResult(latestAssistant.content); } catch { activeAdvisorResult = undefined; } }
    const renderResult = (result: AnalysisResult) => `<article class="matching-result" data-analysis-result-id="${esc(result.id)}"><p class="matching-result__meta">${esc(result.createdAt)} · ${esc(resumes.find((resume) => resume.id === result.resumeId)?.name ?? result.resumeId)}</p><dl class="matching-coverage"><div><dt>总体覆盖率</dt><dd>${result.coverage.overall}%</dd></div><div><dt>必需覆盖率</dt><dd>${result.coverage.required}%</dd></div><div><dt>加分覆盖率</dt><dd>${result.coverage.preferred}%</dd></div></dl><div class="matching-lists"><div><h5>明确匹配</h5><ul>${result.matchedKeywords.map((value) => `<li>${esc(value)}</li>`).join("") || "<li>暂无</li>"}</ul></div><div><h5>弱匹配</h5><ul>${result.weakMatches.map((value) => `<li>${esc(value)}</li>`).join("") || "<li>暂无</li>"}</ul></div><div><h5>缺失</h5><ul>${result.missingKeywords.map((value) => `<li>${esc(value)}</li>`).join("") || "<li>暂无</li>"}</ul></div><div><h5>待人工确认</h5><ul>${result.uncertainItems.map((value) => `<li>${esc(value)}</li>`).join("") || "<li>暂无</li>"}</ul></div></div><h5>证据片段</h5><ul class="matching-evidence">${result.evidence.map((entry) => `<li><strong>${esc(entry.keyword)}</strong>：${esc(entry.excerpt)}</li>`).join("") || "<li>暂无证据</li>"}</ul><p class="matching-disclaimer">仅代表文本证据，不代表用户真实具备相关能力。</p></article>`;
    const aiSection = options.aiAdvisorService ? `<section class="ai-advisor-panel" aria-labelledby="ai-advisor-title"><h4 id="ai-advisor-title">AI 顾问</h4><form data-ai-form><label for="ai-prompt">咨询问题<textarea id="ai-prompt" name="prompt" rows="3" required placeholder="例如：如何突出与职位相关的项目？"></textarea></label><button type="submit" data-action="open-ai-preview">预览并发送</button></form><p class="ai-status" role="status" aria-live="polite"></p>${activeAdvisorResult ? renderAiResult(activeAdvisorResult) : ""}<div class="ai-conversation">${(conversation?.messages ?? []).filter((message) => message.role !== "system").map((message) => `<article data-message-id="${esc(message.id)}"><p><strong>${message.role === "user" ? "我" : "AI"}</strong></p><p class="ai-message-content">${esc(message.content)}</p><button type="button" data-action="copy-ai-message" data-message="${esc(message.content)}">复制此段</button></article>`).join("")}</div>${conversation?.messages.length ? `<button type="button" data-action="copy-ai-all">复制全部</button><button type="button" data-action="export-ai-report">导出优化报告</button>` : ""}</section>` : "";
    detailContent.innerHTML = `<dl class="application-detail__facts"><dt>公司</dt><dd>${esc(item.company)}</dd><dt>职位</dt><dd>${esc(item.position)}</dd><dt>阶段</dt><dd>${esc(stageById(item.stageId)?.name ?? "")}</dd><dt>网址</dt><dd>${item.jobUrl && safeHref(item.jobUrl) ? `<a href="${esc(safeHref(item.jobUrl))}" target="_blank" rel="noreferrer">${esc(item.jobUrl)}</a>` : item.jobUrl ? esc(item.jobUrl) : "未填写"}</dd><dt>JD</dt><dd class="application-long-text">${esc(item.jdText || "未确认 JD")}</dd></dl><div class="application-detail__actions"><label>推进阶段<select data-detail-stage>${stages.map((stage) => `<option value="${esc(stage.id)}" ${stage.id === item.stageId ? "selected" : ""}>${esc(stage.name)}</option>`).join("")}</select></label><button type="button" data-action="save-detail-stage">保存阶段</button><label>切换当前简历<select data-detail-resume><option value="">未绑定</option>${resumes.filter((resume) => resume.status !== "deleted").map((resume) => `<option value="${esc(resume.id)}" ${resume.id === item.currentResumeId ? "selected" : ""}>${esc(resume.name)}</option>`).join("")}</select></label><button type="button" data-action="save-detail-resume">保存简历</button><label>添加备注<textarea data-detail-note rows="2">${esc(item.note)}</textarea></label><button type="button" data-action="save-detail-note">保存备注</button><button type="button" data-action="archive" data-application-id="${esc(id)}">归档</button><button type="button" data-action="delete" data-application-id="${esc(id)}">删除职位</button></div><section class="matching-panel" aria-labelledby="matching-panel-title"><h4 id="matching-panel-title">本地 JD 匹配</h4>${options.matchingService ? `<div class="matching-run-controls"><label>用于匹配的简历<select data-matching-resume>${resumes.filter((resume) => resume.status !== "deleted").map((resume) => `<option value="${esc(resume.id)}" ${resume.id === item.currentResumeId ? "selected" : ""}>${esc(resume.name)}</option>`).join("")}</select></label><button type="button" data-action="run-matching" data-application-id="${esc(id)}">运行匹配</button></div>` : ""}<p class="matching-status" role="status" aria-live="polite"></p><div class="matching-history">${analysisHistory.length ? analysisHistory.map((result) => `<button type="button" class="matching-history__item" data-action="open-analysis" data-analysis-id="${esc(result.id)}">${esc(result.createdAt)} · ${esc(resumes.find((resume) => resume.id === result.resumeId)?.name ?? result.resumeId)}</button>`).join("") : "<p>暂无匹配历史</p>"}</div><div class="matching-current">${analysisHistory[0] ? renderResult(analysisHistory[0]) : ""}</div></section>${aiSection}<h4>简历使用历史</h4><ul>${history.map((entry) => `<li>${esc(entry.resumeNameSnapshot)}：${esc(entry.textSnapshot)}</li>`).join("") || "<li>暂无历史</li>"}</ul><h4>时间线</h4><ol>${timeline.map((entry) => `<li>${esc(entry.type)}：${esc(entry.note)}</li>`).join("") || "<li>暂无事件</li>"}</ol>`;
    detail.hidden = false;
  }

  const renderAiResult = (result: AiAdvisorResult): string => `<article class="ai-result"><h5>匹配概览</h5><p>${esc(result.matchOverview || "暂无")}</p><h5>问题</h5><ul>${result.issues.map((value) => `<li>${esc(value)}</li>`).join("") || "<li>暂无</li>"}</ul><h5>建议</h5><ul>${result.suggestions.map((value) => `<li><span class="ai-suggestion-label">建议</span> ${esc(value.replace(/^建议：/, ""))}</li>`).join("") || "<li>暂无</li>"}</ul><h5>原文/改写对照</h5><ul>${result.rewrites.map((item) => `<li><strong>原文：</strong>${esc(item.original)}<br><strong>改写：</strong>${esc(item.rewrite)}</li>`).join("") || "<li>暂无</li>"}</ul><h5>待补充信息</h5><ul>${result.missingInfo.map((value) => `<li>${esc(value)}</li>`).join("") || "<li>暂无</li>"}</ul><h5>风险提示</h5><ul>${result.risks.map((value) => `<li>${esc(value)}</li>`).join("") || "<li>暂无</li>"}</ul>${result.authenticityRisk ? `<p class="ai-authenticity-risk" role="alert">真实性风险：请核验所有内容，AI 不得虚构经历、技能、学历、成果或数字。</p>` : ""}</article>`;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setStatus("正在保存职位...");
    const data = new FormData(form);
    const deadlineValue = String(data.get("deadline") ?? "");
    const input = { company: String(data.get("company") ?? "").trim(), position: String(data.get("position") ?? "").trim(), jobType: String(data.get("jobType") ?? "other") as Application["jobType"], location: String(data.get("location") ?? ""), workMode: String(data.get("workMode") ?? "unknown") as Application["workMode"], salaryText: String(data.get("salaryText") ?? ""), source: String(data.get("source") ?? ""), jobUrl: String(data.get("jobUrl") ?? ""), deadline: deadlineValue ? new Date(deadlineValue).toISOString() : undefined, contact: String(data.get("contact") ?? ""), priority: Number(data.get("priority") ?? 0), note: String(data.get("note") ?? ""), stageId: String(data.get("stageId") ?? stages[0]?.id ?? ""), jdText: String(data.get("jdText") ?? "") };
    let createdApplicationId: string | undefined;
    try {
      let saved: Application;
      if (editingId) {
        const nextStageId = input.stageId;
        const metadata = { ...input } as Record<string, unknown>;
        delete metadata.stageId;
        delete metadata.jdText;
        saved = await applicationService.updateApplication(editingId, metadata);
        if (nextStageId && saved.stageId !== nextStageId) saved = await applicationService.changeStage(editingId, nextStageId);
      } else {
        saved = await applicationService.createApplication(input as never);
        createdApplicationId = saved.id;
      }
      const resumeId = String(data.get("currentResumeId") ?? "");
      if ((editingId || resumeId) && saved.currentResumeId !== (resumeId || undefined)) saved = await applicationService.bindResume(saved.id, resumeId || undefined);
      const file = (data.get("jdFile") as File | null);
      if (file && file.size && options.jobDescriptionService?.ingestFile) {
        const result = await options.jobDescriptionService.ingestFile(saved.id, file);
        pendingJobDescriptionId = result.jobDescription.id;
        if (result.extractedText) {
          (form.elements.namedItem("jdText") as HTMLTextAreaElement).value = result.extractedText.text;
        }
        (form.querySelector('[data-action="confirm-jd"]') as HTMLButtonElement).hidden = false;
        setStatus(result.extractedText ? "JD 已提取，请确认文本后再继续" : "JD 提取失败，请粘贴或校正后确认");
      } else if (editingId && options.jobDescriptionService && input.jdText.trim()) {
        const existingText = saved.jdText;
        if (existingText !== input.jdText) {
          const pasted = await options.jobDescriptionService.ingestPaste(saved.id, input.jdText);
          await options.jobDescriptionService.confirmText(pasted.jobDescription.id, input.jdText);
        }
      }
      if (!pendingJobDescriptionId) resetForm();
      applications = await applicationService.listApplications();
      renderApplications();
      setStatus("职位已保存");
      root.dispatchEvent(new CustomEvent("app-data-changed", { bubbles: true }));
    } catch {
      if (createdApplicationId && !editingId) {
        try {
          const preview = await applicationService.previewDelete(createdApplicationId);
          await applicationService.confirmDelete(createdApplicationId, preview);
        } catch { /* 保留错误状态，避免覆盖原始用户反馈 */ }
      }
      setStatus("职位保存失败，资料未改变；可重试");
    }
  });

  root.addEventListener("click", async (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-action], [data-view]");
    if (!target) return;
    const action = target.dataset.action;
    try {
      if (target.dataset.view) { view = target.dataset.view as "board" | "list"; renderApplications(); return; }
      if (action === "copy-ai-message") {
        const text = target.dataset.message ?? "";
        await navigator.clipboard?.writeText(text);
        setStatus("已复制此段 AI 内容");
        return;
      }
      if (action === "copy-ai-all" && detailId && options.aiAdvisorService) {
        const conversation = await options.aiAdvisorService.getConversation(detailId);
        const text = (conversation?.messages ?? []).filter((message) => message.role !== "system").map((message) => `${message.role === "user" ? "我" : "AI"}：${message.content}`).join("\n\n");
        await navigator.clipboard?.writeText(text); setStatus("已复制全部 AI 对话"); return;
      }
      if (action === "export-ai-report" && activeAdvisorResult) {
        const blob = new Blob([exportAdvisorReport(activeAdvisorResult)], { type: "text/markdown;charset=utf-8" });
        const url = URL.createObjectURL(blob); const anchor = documentRef.createElement("a"); anchor.href = url; anchor.download = "ai-optimization-report.md"; anchor.click(); URL.revokeObjectURL(url); setStatus("优化报告已导出"); return;
      }
      if (action === "confirm-jd" && pendingJobDescriptionId && options.jobDescriptionService) {
        const text = (form.elements.namedItem("jdText") as HTMLTextAreaElement).value;
        await options.jobDescriptionService.confirmText(pendingJobDescriptionId, text);
        pendingJobDescriptionId = undefined;
        (form.querySelector('[data-action="confirm-jd"]') as HTMLButtonElement).hidden = true;
        applications = await applicationService.listApplications();
        renderApplications();
        setStatus("JD 文本已确认");
        resetForm();
        return;
      }
      if (action === "details" && target.dataset.applicationId) { await showDetail(target.dataset.applicationId); return; }
      if (action === "run-matching" && detailId && options.matchingService) {
        const matchingStatus = detail.querySelector<HTMLElement>(".matching-status");
        const resumeId = detail.querySelector<HTMLSelectElement>("[data-matching-resume]")?.value;
        if (!resumeId) { if (matchingStatus) matchingStatus.textContent = "请先选择可用简历"; return; }
        if (matchingStatus) matchingStatus.textContent = "正在本地匹配...";
        try {
          await options.matchingService.run(detailId, resumeId);
          await showDetail(detailId);
          setStatus("匹配结果已保存");
        } catch {
          if (matchingStatus) matchingStatus.textContent = "匹配失败，资料未改变；可重试";
          setStatus("匹配失败，资料未改变；可重试");
        }
        return;
      }
      if (action === "open-analysis" && detailId && options.matchingService && target.dataset.analysisId) {
        const result = await options.matchingService.get(target.dataset.analysisId);
        if (!result) { setStatus("匹配结果不存在"); return; }
        const current = detail.querySelector<HTMLElement>(".matching-current");
        if (current) {
          current.innerHTML = `<article class="matching-result"><dl class="matching-coverage"><div><dt>总体覆盖率</dt><dd>${result.coverage.overall}%</dd></div><div><dt>必需覆盖率</dt><dd>${result.coverage.required}%</dd></div><div><dt>加分覆盖率</dt><dd>${result.coverage.preferred}%</dd></div></dl><div class="matching-lists"><div><h5>明确匹配</h5><ul>${result.matchedKeywords.map((value) => `<li>${esc(value)}</li>`).join("") || "<li>暂无</li>"}</ul></div><div><h5>弱匹配</h5><ul>${result.weakMatches.map((value) => `<li>${esc(value)}</li>`).join("") || "<li>暂无</li>"}</ul></div><div><h5>缺失</h5><ul>${result.missingKeywords.map((value) => `<li>${esc(value)}</li>`).join("") || "<li>暂无</li>"}</ul></div><div><h5>待人工确认</h5><ul>${result.uncertainItems.map((value) => `<li>${esc(value)}</li>`).join("") || "<li>暂无</li>"}</ul></div></div><ul class="matching-evidence">${result.evidence.map((entry) => `<li><strong>${esc(entry.keyword)}</strong>：${esc(entry.excerpt)}</li>`).join("") || "<li>暂无证据</li>"}</ul><p class="matching-disclaimer">仅代表文本证据，不代表用户真实具备相关能力。</p></article>`;
        }
        setStatus("已打开历史匹配结果");
        return;
      }
      if (action === "edit" && target.dataset.applicationId) {
        const item = applications.find((entry) => entry.id === target.dataset.applicationId);
        if (!item) return;
        editingId = item.id;
        for (const [name, value] of Object.entries(item)) {
          const field = form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
          if (field && value !== undefined && name !== "id" && name !== "createdAt" && name !== "updatedAt") field.value = name === "deadline" && value ? isoToLocalDatetimeInput(String(value)) : String(value);
        }
        resumeSelect.value = item.currentResumeId ?? "";
        stageSelect.value = item.stageId;
        (form.querySelector("[data-form-title]") as HTMLElement).textContent = "编辑职位";
        (form.querySelector('[data-action="cancel-edit"]') as HTMLButtonElement).hidden = false;
        (form.elements.namedItem("jdText") as HTMLTextAreaElement).value = item.jdText;
        form.scrollIntoView({ block: "start" });
        setStatus("已载入职位编辑，尚未保存修改");
        return;
      }
      if (action === "close-detail") { detail.hidden = true; detailId = undefined; return; }
      if (action === "advance" && target.dataset.applicationId) {
        const item = applications.find((entry) => entry.id === target.dataset.applicationId); const index = stages.findIndex((stage) => stage.id === item?.stageId); const next = stages[index + 1];
        if (item && next) { await applicationService.changeStage(item.id, next.id); applications = await applicationService.listApplications(); renderApplications(); setStatus("阶段已推进"); }
        return;
      }
      if (action === "save-detail-stage" && detailId) { const value = detail.querySelector<HTMLSelectElement>("[data-detail-stage]")?.value; if (value) await applicationService.changeStage(detailId, value); applications = await applicationService.listApplications(); await showDetail(detailId); setStatus("阶段已保存"); return; }
      if (action === "save-detail-resume" && detailId) { const value = detail.querySelector<HTMLSelectElement>("[data-detail-resume]")?.value; if (value) await applicationService.bindResume(detailId, value); applications = await applicationService.listApplications(); await showDetail(detailId); setStatus("当前简历已保存"); return; }
      if (action === "save-detail-note" && detailId) { const value = detail.querySelector<HTMLTextAreaElement>("[data-detail-note]")?.value ?? ""; await applicationService.updateNote(detailId, value); applications = await applicationService.listApplications(); await showDetail(detailId); setStatus("备注已保存"); return; }
      if ((action === "archive" || action === "delete") && target.dataset.applicationId) {
        const id = target.dataset.applicationId; const preview = action === "archive" ? await applicationService.previewArchive(id) : await applicationService.previewDelete(id); pendingAction = { type: action, id, preview }; confirmSummary.textContent = `将${action === "archive" ? "归档" : "删除"}“${preview.company} / ${preview.position}”，关联历史 ${preview.resumeUsageCount} 条、时间线 ${preview.timelineEventCount} 条。`; openConfirm(target); setStatus("已打开操作预览，尚未修改数据"); return;
      }
      if (action === "cancel-application-action") { closeConfirm(); setStatus("已取消操作，数据未改变"); return; }
      if (action === "confirm-application-action" && pendingAction) { const pending = pendingAction; if (pending.type === "archive") await applicationService.confirmArchive(pending.id, pending.preview as never); else if (pending.type === "delete") await applicationService.confirmDelete(pending.id, pending.preview as never); else await stageService.deleteStage(pending.id, { confirmed: true, replacementStageId: pending.replacementStageId }); closeConfirm(); applications = await applicationService.listApplications(); stages = await stageService.listStages(); await renderStages(); renderApplications(); detail.hidden = true; setStatus(pending.type === "archive" ? "职位已归档" : pending.type === "delete" ? "职位已删除" : "阶段已删除"); return; }
      const stageItem = target.closest<HTMLElement>(".stage-manager__item");
      if (stageItem && action === "save-stage") { const id = stageItem.dataset.stageId!; await stageService.updateStage(id, { name: stageItem.querySelector<HTMLInputElement>("[data-stage-name]")?.value, color: stageItem.querySelector<HTMLInputElement>("[data-stage-color]")?.value }); stages = await stageService.listStages(); await renderStages(); renderApplications(); setStatus("阶段已保存"); return; }
      if (stageItem && (action === "move-stage-up" || action === "move-stage-down")) { const index = stages.findIndex((stage) => stage.id === stageItem.dataset.stageId); const next = action === "move-stage-up" ? index - 1 : index + 1; if (index >= 0 && next >= 0 && next < stages.length) { const ids = stages.map((stage) => stage.id); [ids[index], ids[next]] = [ids[next], ids[index]]; stages = await stageService.reorderStages(ids); await renderStages(); renderApplications(); setStatus("阶段顺序已保存"); } return; }
      if (stageItem && action === "delete-stage") { const id = stageItem.dataset.stageId!; const preview = await stageService.previewDelete(id); const replacement = stages.find((stage) => stage.id !== id); pendingAction = { type: "stage-delete", id, preview, replacementStageId: replacement?.id }; confirmSummary.textContent = `将删除阶段“${preview.name}”，影响 ${preview.applicationCount} 个职位${replacement ? `，并迁移到“${replacement.name}”` : ""}。`; openConfirm(target); setStatus("已打开阶段删除预览，尚未修改数据"); return; }
    } catch { setStatus("操作失败，请重试"); }
  });

  root.addEventListener("submit", async (event) => {
    const form = (event.target as HTMLElement).closest<HTMLFormElement>("[data-ai-form]");
    if (!form || !detailId || !options.aiAdvisorService || !advisorPreview) return;
    event.preventDefault();
    const prompt = String(new FormData(form).get("prompt") ?? "");
    const aiStatus = detail.querySelector<HTMLElement>(".ai-status");
    try {
      if (aiStatus) aiStatus.textContent = "正在生成发送预览...";
      const preview = await options.aiAdvisorService.createPreview(detailId, prompt);
      advisorPreview.open(preview);
      if (aiStatus) aiStatus.textContent = "请确认发送预览";
    } catch {
      if (aiStatus) aiStatus.textContent = "无法生成发送预览，请检查本地 AI 设置后重试";
      setStatus("无法生成发送预览，请检查本地 AI 设置后重试");
    }
  });
  documentRef.defaultView?.addEventListener("app-data-cleared", () => void load(), { signal: options.signal });

  root.querySelector("#application-job-type")?.addEventListener("change", (event) => { filter = (event.target as HTMLSelectElement).value; renderApplications(); });
  root.querySelector("[data-show-archived]")?.addEventListener("change", (event) => { showArchived = (event.target as HTMLInputElement).checked; renderApplications(); });
  root.querySelector('[data-action="cancel-edit"]')?.addEventListener("click", resetForm);
  confirmDialog.addEventListener("keydown", (event) => {
    if (event.key === "Tab") {
      const focusable = Array.from(confirmDialog.querySelectorAll<HTMLElement>("button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])"));
      if (focusable.length) {
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && documentRef.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && documentRef.activeElement === last) { event.preventDefault(); first.focus(); }
      }
      return;
    }
    if (event.key === "Escape") { closeConfirm(); setStatus("已取消操作，数据未改变"); }
  });
  void load();
  return root;
}
