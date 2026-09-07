import type { AnalysisResult, Application, Resume, Stage } from "../../db/types";
import { exportAdvisorReport, parseAiAdvisorResult, type AiAdvisorResult, type AiAdvisorService } from "../../features/ai/aiAdvisorService";
import type { ResumeLibraryService } from "../../features/resumes/resumeLibrary";
import { createSendPreview, type SendPreviewElement } from "../SendPreview/SendPreview";
import type { AppBus } from "../../app/appBus";

export type DetailTab = "overview" | "jd" | "resume" | "matching" | "ai" | "timeline" | "note";
export type ApplicationDetailElement = HTMLElement & { show(applicationId: string, tab?: DetailTab): Promise<void> };

type ActionPreview = { id: string; company?: string; position?: string; name?: string; resumeUsageCount?: number; timelineEventCount?: number; applicationCount?: number; archived?: boolean; kind?: string };

const TABS: Array<{ key: DetailTab; label: string }> = [
  { key: "overview", label: "概览" },
  { key: "jd", label: "JD" },
  { key: "resume", label: "简历" },
  { key: "matching", label: "匹配" },
  { key: "ai", label: "AI" },
  { key: "timeline", label: "时间线" },
  { key: "note", label: "备注" },
];

export interface ApplicationDetailOptions {
  applicationService: {
    listApplications(): Promise<Application[]>;
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
  stageService: {
    listStages(): Promise<Stage[]>;
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
  bus?: AppBus;
  signal?: AbortSignal;
}

/** 只允许 http/https 作为职位网址链接，拦截 javascript: 等危险协议。非法时返回空串。 */
function safeHref(value: string): string {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

const esc = (value: unknown): string => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char] ?? char));

export function createApplicationDetail(documentRef: Document, options: ApplicationDetailOptions): HTMLElement {
  const applicationService = options.applicationService;
  const stageService = options.stageService;
  const root = documentRef.createElement("section") as ApplicationDetailElement;
  root.className = "application-detail-view";
  root.setAttribute("aria-labelledby", "application-detail-title");
  root.innerHTML = `
    <div class="application-detail__context"><h2 id="application-detail-title"></h2><p class="application-detail__subtitle"></p></div>
    <div class="application-detail__tabs" role="tablist">${TABS.map((t) => `<button type="button" role="tab" data-detail-tab="${t.key}" aria-selected="${t.key === "overview"}">${t.label}</button>`).join("")}</div>
    ${TABS.map((t) => `<div class="application-detail__panel" data-detail-panel="${t.key}"${t.key === "overview" ? "" : " hidden"}></div>`).join("")}
    <p class="application-detail__status" role="status" aria-live="polite"></p>
    <div class="application-confirm" role="dialog" aria-modal="true" aria-labelledby="application-confirm-title" hidden><h3 id="application-confirm-title">确认操作</h3><p data-confirm-summary></p><div><button type="button" data-action="confirm-application-action">确认</button><button type="button" data-action="cancel-application-action">取消</button></div></div>
  `;

  const titleElement = root.querySelector<HTMLElement>("#application-detail-title")!;
  const subtitleElement = root.querySelector<HTMLElement>(".application-detail__subtitle")!;
  const statusElement = root.querySelector<HTMLElement>(".application-detail__status")!;
  const confirmDialog = root.querySelector<HTMLElement>(".application-confirm")!;
  const confirmSummary = root.querySelector<HTMLElement>("[data-confirm-summary]")!;
  const panelFor = (tab: DetailTab) => root.querySelector<HTMLElement>(`[data-detail-panel="${tab}"]`)!;

  let activeAdvisorResult: AiAdvisorResult | undefined;
  let advisorPreview: SendPreviewElement | undefined;
  let applications: Application[] = [];
  let stages: Stage[] = [];
  let resumes: Resume[] = [];
  let currentId: string | undefined;
  let currentTab: DetailTab = "overview";
  let pendingAction: { type: "archive" | "delete"; id: string; preview: ActionPreview } | undefined;
  let confirmReturnFocus: HTMLElement | undefined;

  const setStatus = (message: string) => { statusElement.textContent = message; };
  const stageById = (id: string) => stages.find((stage) => stage.id === id);
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

  if (options.aiAdvisorService) {
    const previewElement = createSendPreview(documentRef, {
      onConfirm: async (preview) => {
        if (!options.aiAdvisorService) return;
        try {
          const response = await options.aiAdvisorService.send(preview.applicationId, preview.prompt);
          activeAdvisorResult = response.result;
          if (currentId) await root.show(currentId, "ai");
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

  function activateTab(tab: DetailTab): void {
    currentTab = tab;
    root.querySelectorAll<HTMLButtonElement>("[data-detail-tab]").forEach((button) => {
      button.setAttribute("aria-selected", String(button.dataset.detailTab === tab));
    });
    root.querySelectorAll<HTMLElement>("[data-detail-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.detailPanel !== tab;
    });
  }

  const renderResult = (result: AnalysisResult): string => `<article class="matching-result" data-analysis-result-id="${esc(result.id)}"><p class="matching-result__meta">${esc(result.createdAt)} · ${esc(resumes.find((resume) => resume.id === result.resumeId)?.name ?? result.resumeId)}</p><dl class="matching-coverage"><div><dt>总体覆盖率</dt><dd>${result.coverage.overall}%</dd></div><div><dt>必需覆盖率</dt><dd>${result.coverage.required}%</dd></div><div><dt>加分覆盖率</dt><dd>${result.coverage.preferred}%</dd></div></dl><div class="matching-lists"><div><h5>明确匹配</h5><ul>${result.matchedKeywords.map((value) => `<li>${esc(value)}</li>`).join("") || "<li>暂无</li>"}</ul></div><div><h5>弱匹配</h5><ul>${result.weakMatches.map((value) => `<li>${esc(value)}</li>`).join("") || "<li>暂无</li>"}</ul></div><div><h5>缺失</h5><ul>${result.missingKeywords.map((value) => `<li>${esc(value)}</li>`).join("") || "<li>暂无</li>"}</ul></div><div><h5>待人工确认</h5><ul>${result.uncertainItems.map((value) => `<li>${esc(value)}</li>`).join("") || "<li>暂无</li>"}</ul></div></div><h5>证据片段</h5><ul class="matching-evidence">${result.evidence.map((entry) => `<li><strong>${esc(entry.keyword)}</strong>：${esc(entry.excerpt)}</li>`).join("") || "<li>暂无证据</li>"}</ul><p class="matching-disclaimer">仅代表文本证据，不代表用户真实具备相关能力。</p></article>`;

  const renderAiResult = (result: AiAdvisorResult): string => `<article class="ai-result"><h5>匹配概览</h5><p>${esc(result.matchOverview || "暂无")}</p><h5>问题</h5><ul>${result.issues.map((value) => `<li>${esc(value)}</li>`).join("") || "<li>暂无</li>"}</ul><h5>建议</h5><ul>${result.suggestions.map((value) => `<li><span class="ai-suggestion-label">建议</span> ${esc(value.replace(/^建议：/, ""))}</li>`).join("") || "<li>暂无</li>"}</ul><h5>原文/改写对照</h5><ul>${result.rewrites.map((item) => `<li><strong>原文：</strong>${esc(item.original)}<br><strong>改写：</strong>${esc(item.rewrite)}</li>`).join("") || "<li>暂无</li>"}</ul><h5>待补充信息</h5><ul>${result.missingInfo.map((value) => `<li>${esc(value)}</li>`).join("") || "<li>暂无</li>"}</ul><h5>风险提示</h5><ul>${result.risks.map((value) => `<li>${esc(value)}</li>`).join("") || "<li>暂无</li>"}</ul>${result.authenticityRisk ? `<p class="ai-authenticity-risk" role="alert">真实性风险：请核验所有内容，AI 不得虚构经历、技能、学历、成果或数字。</p>` : ""}</article>`;

  root.show = async (applicationId: string, tab: DetailTab = "overview"): Promise<void> => {
    applications = await applicationService.listApplications();
    const item = applications.find((entry) => entry.id === applicationId);
    if (!item) return;
    currentId = applicationId;
    stages = await stageService.listStages();
    resumes = options.resumeLibrary ? await options.resumeLibrary.search("") : [];
    const [timeline, history, analysisHistory, conversation] = await Promise.all([
      applicationService.listTimeline(applicationId),
      applicationService.listResumeUsageHistory(applicationId),
      options.matchingService?.listHistory(applicationId) ?? Promise.resolve([]),
      options.aiAdvisorService?.getConversation(applicationId) ?? Promise.resolve(undefined),
    ]);
    const latestAssistant = conversation?.messages.slice().reverse().find((message) => message.role === "assistant");
    activeAdvisorResult = undefined;
    if (latestAssistant) { try { activeAdvisorResult = parseAiAdvisorResult(latestAssistant.content); } catch { activeAdvisorResult = undefined; } }

    titleElement.textContent = `${item.company} · ${item.position}`;
    subtitleElement.textContent = `当前简历：${item.currentResumeId ? (resumes.find((resume) => resume.id === item.currentResumeId)?.name ?? item.currentResumeId) : "未绑定"} · 阶段：${stageById(item.stageId)?.name ?? ""}`;

    panelFor("overview").innerHTML = `<dl class="application-detail__facts"><dt>公司</dt><dd>${esc(item.company)}</dd><dt>职位</dt><dd>${esc(item.position)}</dd><dt>阶段</dt><dd>${esc(stageById(item.stageId)?.name ?? "")}</dd><dt>网址</dt><dd>${item.jobUrl && safeHref(item.jobUrl) ? `<a href="${esc(safeHref(item.jobUrl))}" target="_blank" rel="noreferrer">${esc(item.jobUrl)}</a>` : item.jobUrl ? esc(item.jobUrl) : "未填写"}</dd></dl><div class="application-detail__actions"><label>推进阶段<select data-detail-stage>${stages.map((stage) => `<option value="${esc(stage.id)}" ${stage.id === item.stageId ? "selected" : ""}>${esc(stage.name)}</option>`).join("")}</select></label><button type="button" data-action="save-detail-stage">保存阶段</button><label>切换当前简历<select data-detail-resume><option value="">未绑定</option>${resumes.filter((resume) => resume.status !== "deleted").map((resume) => `<option value="${esc(resume.id)}" ${resume.id === item.currentResumeId ? "selected" : ""}>${esc(resume.name)}</option>`).join("")}</select></label><button type="button" data-action="save-detail-resume">保存简历</button><button type="button" data-action="archive" data-application-id="${esc(applicationId)}">归档</button><button type="button" data-action="delete" data-application-id="${esc(applicationId)}">删除职位</button></div>`;

    panelFor("jd").innerHTML = `<dl class="application-detail__facts"><dt>JD</dt><dd class="application-long-text">${esc(item.jdText || "未确认 JD")}</dd></dl>`;

    panelFor("resume").innerHTML = `<p>当前简历：${item.currentResumeId ? esc(resumes.find((resume) => resume.id === item.currentResumeId)?.name ?? item.currentResumeId) : "未绑定简历"}</p><h4>简历使用历史</h4><ul>${history.map((entry) => `<li>${esc(entry.resumeNameSnapshot)}：${esc(entry.textSnapshot)}</li>`).join("") || "<li>暂无历史</li>"}</ul>`;

    panelFor("matching").innerHTML = `<section class="matching-panel" aria-labelledby="matching-panel-title"><h4 id="matching-panel-title">本地 JD 匹配</h4>${options.matchingService ? `<div class="matching-run-controls"><label>用于匹配的简历<select data-matching-resume>${resumes.filter((resume) => resume.status !== "deleted").map((resume) => `<option value="${esc(resume.id)}" ${resume.id === item.currentResumeId ? "selected" : ""}>${esc(resume.name)}</option>`).join("")}</select></label><button type="button" data-action="run-matching" data-application-id="${esc(applicationId)}">运行匹配</button></div>` : ""}<p class="matching-status" role="status" aria-live="polite"></p><div class="matching-history">${analysisHistory.length ? analysisHistory.map((result) => `<button type="button" class="matching-history__item" data-action="open-analysis" data-analysis-id="${esc(result.id)}">${esc(result.createdAt)} · ${esc(resumes.find((resume) => resume.id === result.resumeId)?.name ?? result.resumeId)}</button>`).join("") : "<p>暂无匹配历史</p>"}</div><div class="matching-current">${analysisHistory[0] ? renderResult(analysisHistory[0]) : ""}</div></section>`;

    panelFor("ai").innerHTML = options.aiAdvisorService ? `<section class="ai-advisor-panel" aria-labelledby="ai-advisor-title"><h4 id="ai-advisor-title">AI 顾问</h4><form data-ai-form><label for="ai-prompt">咨询问题<textarea id="ai-prompt" name="prompt" rows="3" required placeholder="例如：如何突出与职位相关的项目？"></textarea></label><button type="submit" data-action="open-ai-preview">预览并发送</button></form><p class="ai-status" role="status" aria-live="polite"></p>${activeAdvisorResult ? renderAiResult(activeAdvisorResult) : ""}<div class="ai-conversation">${(conversation?.messages ?? []).filter((message) => message.role !== "system").map((message) => `<article data-message-id="${esc(message.id)}"><p><strong>${message.role === "user" ? "我" : "AI"}</strong></p><p class="ai-message-content">${esc(message.content)}</p><button type="button" data-action="copy-ai-message" data-message="${esc(message.content)}">复制此段</button></article>`).join("")}</div>${conversation?.messages.length ? `<button type="button" data-action="copy-ai-all">复制全部</button><button type="button" data-action="export-ai-report">导出优化报告</button>` : ""}</section>` : "";

    panelFor("timeline").innerHTML = `<h4>时间线</h4><ol>${timeline.map((entry) => `<li>${esc(entry.type)}：${esc(entry.note)}</li>`).join("") || "<li>暂无事件</li>"}</ol>`;

    panelFor("note").innerHTML = `<label>添加备注<textarea data-detail-note rows="4">${esc(item.note)}</textarea></label><button type="button" data-action="save-detail-note">保存备注</button>`;

    activateTab(tab);
    setStatus(`已载入“${item.company} / ${item.position}”详情`);
  };

  root.addEventListener("click", async (event) => {
    const tabTarget = (event.target as HTMLElement).closest<HTMLElement>("[data-detail-tab]");
    if (tabTarget) {
      const tab = tabTarget.dataset.detailTab as DetailTab;
      activateTab(tab);
      if (currentId) options.bus?.emit("app-navigate", { name: "applications", applicationId: currentId, tab });
      return;
    }
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-action]");
    if (!target) return;
    const action = target.dataset.action;
    try {
      if (action === "copy-ai-message") {
        const text = target.dataset.message ?? "";
        await navigator.clipboard?.writeText(text);
        setStatus("已复制此段 AI 内容");
        return;
      }
      if (action === "copy-ai-all" && currentId && options.aiAdvisorService) {
        const conversation = await options.aiAdvisorService.getConversation(currentId);
        const text = (conversation?.messages ?? []).filter((message) => message.role !== "system").map((message) => `${message.role === "user" ? "我" : "AI"}：${message.content}`).join("\n\n");
        await navigator.clipboard?.writeText(text);
        setStatus("已复制全部 AI 对话");
        return;
      }
      if (action === "export-ai-report" && activeAdvisorResult) {
        const blob = new Blob([exportAdvisorReport(activeAdvisorResult)], { type: "text/markdown;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const anchor = documentRef.createElement("a");
        anchor.href = url;
        anchor.download = "ai-optimization-report.md";
        anchor.click();
        URL.revokeObjectURL(url);
        setStatus("优化报告已导出");
        return;
      }
      if (action === "run-matching" && currentId && options.matchingService) {
        const matchingStatus = root.querySelector<HTMLElement>(".matching-status");
        const resumeId = root.querySelector<HTMLSelectElement>("[data-matching-resume]")?.value;
        if (!resumeId) { if (matchingStatus) matchingStatus.textContent = "请先选择可用简历"; return; }
        if (matchingStatus) matchingStatus.textContent = "正在本地匹配...";
        try {
          await options.matchingService.run(currentId, resumeId);
          await root.show(currentId, currentTab);
          options.bus?.emit("app-data-changed", undefined);
          setStatus("匹配结果已保存");
        } catch {
          const status = root.querySelector<HTMLElement>(".matching-status");
          if (status) status.textContent = "匹配失败，资料未改变；可重试";
          setStatus("匹配失败，资料未改变；可重试");
        }
        return;
      }
      if (action === "open-analysis" && currentId && options.matchingService && target.dataset.analysisId) {
        const result = await options.matchingService.get(target.dataset.analysisId);
        if (!result) { setStatus("匹配结果不存在"); return; }
        const current = root.querySelector<HTMLElement>(".matching-current");
        if (current) current.innerHTML = renderResult(result);
        setStatus("已打开历史匹配结果");
        return;
      }
      if (action === "save-detail-stage" && currentId) {
        const value = root.querySelector<HTMLSelectElement>("[data-detail-stage]")?.value;
        if (value) await applicationService.changeStage(currentId, value);
        await root.show(currentId, currentTab);
        options.bus?.emit("app-data-changed", undefined);
        setStatus("阶段已保存");
        return;
      }
      if (action === "save-detail-resume" && currentId) {
        const value = root.querySelector<HTMLSelectElement>("[data-detail-resume]")?.value;
        if (value) await applicationService.bindResume(currentId, value);
        await root.show(currentId, currentTab);
        options.bus?.emit("app-data-changed", undefined);
        setStatus("当前简历已保存");
        return;
      }
      if (action === "save-detail-note" && currentId) {
        const value = root.querySelector<HTMLTextAreaElement>("[data-detail-note]")?.value ?? "";
        await applicationService.updateNote(currentId, value);
        await root.show(currentId, currentTab);
        options.bus?.emit("app-data-changed", undefined);
        setStatus("备注已保存");
        return;
      }
      if ((action === "archive" || action === "delete") && target.dataset.applicationId) {
        const id = target.dataset.applicationId;
        const preview = action === "archive" ? await applicationService.previewArchive(id) : await applicationService.previewDelete(id);
        pendingAction = { type: action, id, preview };
        confirmSummary.textContent = `将${action === "archive" ? "归档" : "删除"}"${preview.company} / ${preview.position}"，关联历史 ${preview.resumeUsageCount} 条、时间线 ${preview.timelineEventCount} 条。`;
        openConfirm(target);
        setStatus("已打开操作预览，尚未修改数据");
        return;
      }
      if (action === "cancel-application-action") {
        closeConfirm();
        setStatus("已取消操作，数据未改变");
        return;
      }
      if (action === "confirm-application-action" && pendingAction) {
        const pending = pendingAction;
        if (pending.type === "archive") await applicationService.confirmArchive(pending.id, pending.preview as never);
        else await applicationService.confirmDelete(pending.id, pending.preview as never);
        closeConfirm();
        options.bus?.emit("app-data-changed", undefined);
        options.bus?.emit("application-list", undefined);
        setStatus(pending.type === "archive" ? "职位已归档" : "职位已删除");
        return;
      }
    } catch {
      setStatus("操作失败，请重试");
    }
  });

  root.addEventListener("submit", async (event) => {
    const form = (event.target as HTMLElement).closest<HTMLFormElement>("[data-ai-form]");
    if (!form || !currentId || !options.aiAdvisorService || !advisorPreview) return;
    event.preventDefault();
    const prompt = String(new FormData(form).get("prompt") ?? "");
    const aiStatus = root.querySelector<HTMLElement>(".ai-status");
    try {
      if (aiStatus) aiStatus.textContent = "正在生成发送预览...";
      const preview = await options.aiAdvisorService.createPreview(currentId, prompt);
      advisorPreview.open(preview);
      if (aiStatus) aiStatus.textContent = "请确认发送预览";
    } catch {
      if (aiStatus) aiStatus.textContent = "无法生成发送预览，请检查本地 AI 设置后重试";
      setStatus("无法生成发送预览，请检查本地 AI 设置后重试");
    }
  });

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
  }, { signal: options.signal });

  return root;
}
