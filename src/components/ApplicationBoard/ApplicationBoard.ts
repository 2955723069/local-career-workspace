import type { ResumeLibraryService } from "../../features/resumes/resumeLibrary";
import type { AnalysisResult, Application, Resume, Stage } from "../../db/types";
import type { AiAdvisorService } from "../../features/ai/aiAdvisorService";
import type { AppBus } from "../../app/appBus";
import { formatJobType, formatWorkMode } from "../../ui/format";

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
  bus?: AppBus;
  signal?: AbortSignal;
}

type ActionPreview = { id: string; company?: string; position?: string; name?: string; resumeUsageCount?: number; timelineEventCount?: number; applicationCount?: number; archived?: boolean; kind?: string };

const JOB_TYPES = ["graduate", "internship", "tech", "general", "other"] as const;
const WORK_MODES = ["onsite", "remote", "hybrid", "unknown"] as const;

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
        <select id="application-job-type"><option value="">全部类型</option>${JOB_TYPES.map((value) => `<option value="${value}">${formatJobType(value)}</option>`).join("")}</select>
        <label class="application-board__archived-toggle"><input type="checkbox" data-show-archived />显示已归档</label>
      </div>
    </div>
    <div class="application-board__status" role="status" aria-live="polite" aria-atomic="true">正在读取职位...</div>
    <form class="application-form" data-form="application">
      <div class="application-form__header"><h3 data-form-title>创建职位</h3><button type="button" data-action="cancel-edit" hidden>取消编辑</button></div>
      <div class="application-form__grid">
        <label for="application-company">公司<input id="application-company" name="company" required /></label>
        <label for="application-position">职位<input id="application-position" name="position" required /></label>
        <label for="application-stage">阶段<select id="application-stage" name="stageId"></select></label>
        <label for="application-resume">当前简历<select id="application-resume" name="currentResumeId"><option value="">暂不绑定</option></select></label>
      </div>
      <label for="application-jd-text">确认 JD 文本<textarea id="application-jd-text" name="jdText" rows="5" placeholder="粘贴职位描述"></textarea></label>
      <label class="application-file-label" for="application-jd-file">上传 JD（PDF/DOCX）<input id="application-jd-file" name="jdFile" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" /></label>
      <details class="application-form__more"><summary>更多信息（选填）</summary>
        <div class="application-form__grid">
          <label for="application-job-type-field">职位类型<select id="application-job-type-field" name="jobType">${JOB_TYPES.map((value) => `<option value="${value}">${formatJobType(value)}</option>`).join("")}</select></label>
          <label for="application-location">地点<input id="application-location" name="location" /></label>
          <label for="application-work-mode">工作模式<select id="application-work-mode" name="workMode">${WORK_MODES.map((value) => `<option value="${value}">${formatWorkMode(value)}</option>`).join("")}</select></label>
          <label for="application-salary">薪资<input id="application-salary" name="salaryText" /></label>
          <label for="application-source">来源<input id="application-source" name="source" /></label>
          <label for="application-job-url">招聘网址<input id="application-job-url" name="jobUrl" type="url" /></label>
          <label for="application-deadline">截止时间<input id="application-deadline" name="deadline" type="datetime-local" /></label>
          <label for="application-contact">联系人<input id="application-contact" name="contact" /></label>
          <label for="application-priority">优先级<input id="application-priority" name="priority" type="number" min="0" step="1" value="0" /></label>
          <label for="application-note">职位备注<textarea id="application-note" name="note" rows="2"></textarea></label>
        </div>
      </details>
      <div class="application-form__actions"><button type="submit" data-submit-application>保存职位</button><button type="button" data-action="confirm-jd" hidden>确认 JD 文本</button></div>
    </form>
    <div class="application-board-view" data-view-panel="board"></div>
    <div class="application-list-view" data-view-panel="list" hidden></div>
    <section class="stage-manager" aria-labelledby="stage-manager-title">
      <div class="section-heading"><h3 id="stage-manager-title">阶段管理</h3><span class="stage-outcome-counts" role="status"></span></div>
      <div class="stage-manager__list"></div>
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
  const confirmDialog = root.querySelector<HTMLElement>(".application-confirm")!;
  const confirmSummary = root.querySelector<HTMLElement>("[data-confirm-summary]")!;
  const stageSelect = form.elements.namedItem("stageId") as HTMLSelectElement;
  const resumeSelect = form.elements.namedItem("currentResumeId") as HTMLSelectElement;
  let applications: Application[] = [];
  let stages: Stage[] = [];
  let resumes: Resume[] = [];
  let view: "board" | "list" = "board";
  let filter = "";
  let showArchived = false;
  let editingId: string | undefined;
  let pendingAction: { type: "stage-delete"; id: string; preview: ActionPreview; replacementStageId?: string } | undefined;
  let pendingJobDescriptionId: string | undefined;
  let confirmReturnFocus: HTMLElement | undefined;

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
          <p class="application-card__meta">${esc(item.location)} · ${esc(formatJobType(item.jobType))} · ${esc(formatWorkMode(item.workMode))}</p>
          <p class="application-card__stage" style="--stage-color:${esc(stage.color)}">${esc(stage.name)}</p>
          <p class="application-card__resume">${item.currentResumeId ? `简历：${esc(resumes.find((resume) => resume.id === item.currentResumeId)?.name ?? item.currentResumeId)}` : "未绑定简历"}</p>
          <div class="application-card__actions"><button type="button" data-action="details" data-application-id="${esc(item.id)}">查看详情</button><button type="button" data-action="edit" data-application-id="${esc(item.id)}">编辑</button><button type="button" data-action="advance" data-application-id="${esc(item.id)}">推进阶段</button></div>
        </article>`).join("");
      return `<section class="application-stage-column" data-stage-id="${esc(stage.id)}"><h3><span style="--stage-color:${esc(stage.color)}">${esc(stage.name)}</span><small>${cards ? cards.match(/class="application-card"/g)?.length ?? 0 : 0}</small></h3>${cards || `<p class="application-empty">暂无职位</p>`}</section>`;
    }).join("");
    list.innerHTML = items.map((item) => {
      const stage = stageById(item.stageId);
      return `<article class="application-list-row"><div><strong>${esc(item.company)}</strong><span>${esc(item.position)}</span></div><div>${esc(stage?.name ?? "未知阶段")}</div><div>${esc(formatJobType(item.jobType))}</div><div class="application-row-actions"><button type="button" data-action="details" data-application-id="${esc(item.id)}">详情</button><button type="button" data-action="edit" data-application-id="${esc(item.id)}">编辑</button><button type="button" data-action="advance" data-application-id="${esc(item.id)}">推进</button></div></article>`;
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
    form.querySelector(".application-form__more")?.removeAttribute("open");
  }

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
      if (action === "details" && target.dataset.applicationId) { options.bus?.emit("app-navigate", { name: "applications", applicationId: target.dataset.applicationId }); return; }
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
        form.querySelector(".application-form__more")?.setAttribute("open", "");
        (form.elements.namedItem("jdText") as HTMLTextAreaElement).value = item.jdText;
        form.scrollIntoView({ block: "start" });
        setStatus("已载入职位编辑，尚未保存修改");
        return;
      }
      if (action === "advance" && target.dataset.applicationId) {
        const item = applications.find((entry) => entry.id === target.dataset.applicationId); const index = stages.findIndex((stage) => stage.id === item?.stageId); const next = stages[index + 1];
        if (item && next) { await applicationService.changeStage(item.id, next.id); applications = await applicationService.listApplications(); renderApplications(); setStatus("阶段已推进"); }
        return;
      }
      if (action === "cancel-application-action") { closeConfirm(); setStatus("已取消操作，数据未改变"); return; }
      if (action === "confirm-application-action" && pendingAction) { const pending = pendingAction; await stageService.deleteStage(pending.id, { confirmed: true, replacementStageId: pending.replacementStageId }); closeConfirm(); applications = await applicationService.listApplications(); stages = await stageService.listStages(); await renderStages(); renderApplications(); setStatus("阶段已删除"); return; }
      const stageItem = target.closest<HTMLElement>(".stage-manager__item");
      if (stageItem && action === "save-stage") { const id = stageItem.dataset.stageId!; await stageService.updateStage(id, { name: stageItem.querySelector<HTMLInputElement>("[data-stage-name]")?.value, color: stageItem.querySelector<HTMLInputElement>("[data-stage-color]")?.value }); stages = await stageService.listStages(); await renderStages(); renderApplications(); setStatus("阶段已保存"); return; }
      if (stageItem && (action === "move-stage-up" || action === "move-stage-down")) { const index = stages.findIndex((stage) => stage.id === stageItem.dataset.stageId); const next = action === "move-stage-up" ? index - 1 : index + 1; if (index >= 0 && next >= 0 && next < stages.length) { const ids = stages.map((stage) => stage.id); [ids[index], ids[next]] = [ids[next], ids[index]]; stages = await stageService.reorderStages(ids); await renderStages(); renderApplications(); setStatus("阶段顺序已保存"); } return; }
      if (stageItem && action === "delete-stage") { const id = stageItem.dataset.stageId!; const preview = await stageService.previewDelete(id); const replacement = stages.find((stage) => stage.id !== id); pendingAction = { type: "stage-delete", id, preview, replacementStageId: replacement?.id }; confirmSummary.textContent = `将删除阶段“${preview.name}”，影响 ${preview.applicationCount} 个职位${replacement ? `，并迁移到“${replacement.name}”` : ""}。`; openConfirm(target); setStatus("已打开阶段删除预览，尚未修改数据"); return; }
    } catch { setStatus("操作失败，请重试"); }
  });

  documentRef.defaultView?.addEventListener("app-data-cleared", () => void load(), { signal: options.signal });
  options.bus?.on("app-data-changed", () => void load());

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
