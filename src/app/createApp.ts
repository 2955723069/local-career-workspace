import type { ResumeIngestionService } from "../features/resumes/ingestion";
import { createApplicationBoard } from "../components/ApplicationBoard/ApplicationBoard";
import { createInterviewCalendar } from "../components/InterviewCalendar/InterviewCalendar";
import { createInterviewReview } from "../components/InterviewReview/InterviewReview";
import type { MatchingService } from "../features/matching/matchingService";
import type { ApplicationBoardOptions } from "../components/ApplicationBoard/ApplicationBoard";
import { createDashboard } from "../components/Dashboard/Dashboard";
import type { DashboardService } from "../features/dashboard/dashboardService";
import { createBackupPanel, type BackupPanelService } from "../features/backup/BackupPanel";
import { getPreferences, savePreferences, getDefaultReminders, getDefaultTimezone } from "../settings/preferences";
import { clearAllData, previewDataClear, CLEAR_CONFIRMATION_WORD } from "../storage/dataManagement";
import { getAiSettings, saveAiSettings, clearAiSettings, validateAiSettings } from "../settings/secrets";
import { createOpenAiClient } from "../ai/client";
import { AiAdvisorService } from "../features/ai/aiAdvisorService";
import { createMatchingPage } from "../components/MatchingPage/MatchingPage";
import { createAiPage } from "../components/AiPage/AiPage";
import { createResumeLibrary } from "../components/ResumeLibrary/ResumeLibrary";
import { createAppBus } from "./appBus";

export interface CreateAppOptions {
  resumeLibrary?: any;
  resumeIngestion?: ResumeIngestionService;
  applicationService?: ApplicationBoardOptions["applicationService"];
  stageService?: ApplicationBoardOptions["stageService"];
  jobDescriptionService?: ApplicationBoardOptions["jobDescriptionService"];
  matchingService?: MatchingService;
  aiAdvisorService?: ApplicationBoardOptions["aiAdvisorService"];
  interviewService?: any;
  reviewService?: any;
  notificationService?: any;
  exportInterviewICS?: (id: string) => Promise<string>;
  dashboardService?: Pick<DashboardService, "getSnapshot">;
  backupService?: BackupPanelService;
  database?: IDBDatabase;
  onAiSettingsChanged?: (service: AiAdvisorService | undefined) => void;
  now?: () => Date;
}

export function createApp(
  documentRef: Document,
  options: CreateAppOptions = {},
): HTMLElement {
  const root = documentRef.getElementById("app");

  if (!root) {
    throw new Error("找不到应用挂载节点 #app");
  }

  // main.ts 会调用两次 createApp（先渲染骨架，DB 打开后再渲染）。root 本身与 window 上的
  // 监听不会被 innerHTML 重置而累加，导致重复绑定和内存泄漏。用 AbortController 在每次进入时
  // 先中止上一轮注册的持久监听，再统一挂到新的 signal 上。
  const previousController = (root as HTMLElement & { __appListeners?: AbortController }).__appListeners;
  previousController?.abort();
  const listenerController = new AbortController();
  (root as HTMLElement & { __appListeners?: AbortController }).__appListeners = listenerController;
  const signal = listenerController.signal;
  const bus = createAppBus(signal);

  root.innerHTML = `
    <div class="app-shell">
      <header class="topbar">
        <div class="brand" aria-label="求职工作台">
          <span class="brand-mark" aria-hidden="true">职</span>
          <span>求职工作台</span>
        </div>
        <div class="local-status" role="status" aria-live="polite">
          <span class="status-dot" aria-hidden="true"></span>
          本地数据已就绪
        </div>
      </header>

      <nav class="app-nav" aria-label="主导航" role="tablist">
        <button class="app-nav__tab" type="button" role="tab" data-view="overview" aria-controls="view-overview" aria-selected="true">首页</button>
        <button class="app-nav__tab" type="button" role="tab" data-view="resumes" aria-controls="view-resumes" aria-selected="false">简历库</button>
        <button class="app-nav__tab" type="button" role="tab" data-view="applications" aria-controls="view-applications" aria-selected="false">职位申请</button>
        <button class="app-nav__tab" type="button" role="tab" data-view="interviews" aria-controls="view-interviews" aria-selected="false">面试日历</button>
        <button class="app-nav__tab" type="button" role="tab" data-view="matching" aria-controls="view-matching" aria-selected="false">JD 匹配</button>
        <button class="app-nav__tab" type="button" role="tab" data-view="ai" aria-controls="view-ai" aria-selected="false">AI 顾问</button>
        <button class="app-nav__tab" type="button" role="tab" data-view="settings" aria-controls="view-settings" aria-selected="false">设置与备份</button>
      </nav>

      <main>
        <section id="view-overview" class="app-view" data-view-panel="overview" role="tabpanel" aria-labelledby="page-title">
          <section class="overview" aria-labelledby="page-title">
            <p class="section-label">概览</p>
            <div class="overview-heading">
              <h1 id="page-title">求职工作台</h1>
              <p>数据仅保存在此浏览器</p>
            </div>

            <dl class="summary-grid" aria-label="本地资料概览">
              <div class="summary-item"><dt>简历</dt><dd class="resume-summary-count">0 份简历</dd></div>
              <div class="summary-item"><dt>职位</dt><dd class="application-summary-count">0 个职位</dd></div>
              <div class="summary-item summary-item--accent"><dt>近期面试</dt><dd class="interview-summary-count">暂无安排</dd></div>
            </dl>
          </section>
          <div class="dashboard-mount"></div>
        </section>

        <section id="view-resumes" class="app-view" data-view-panel="resumes" role="tabpanel" aria-labelledby="resume-library-title" hidden>
          <div class="resume-library-mount"></div>
        </section>
        <section id="view-applications" class="app-view" data-view-panel="applications" role="tabpanel" aria-labelledby="application-board-title" hidden>
          <div class="application-board-mount"></div>
        </section>
        <section id="view-interviews" class="app-view" data-view-panel="interviews" role="tabpanel" aria-labelledby="interview-calendar-title" hidden>
          <div class="interview-calendar-mount"></div>
          <div class="interview-review-mount"></div>
        </section>
        <section id="view-matching" class="app-view" data-view-panel="matching" role="tabpanel" aria-labelledby="matching-page-title" hidden>
          <div class="matching-page-mount"></div>
        </section>
        <section id="view-ai" class="app-view" data-view-panel="ai" role="tabpanel" aria-labelledby="ai-page-title" hidden>
          <div class="ai-page-mount"></div>
        </section>
        <section id="view-settings" class="app-view" data-view-panel="settings" role="tabpanel" aria-labelledby="backup-page-title" hidden>
          <section class="settings-panel" aria-labelledby="backup-page-title">
            <div class="section-heading"><div><p class="section-label">偏好与隐私</p><h2 id="backup-page-title">设置</h2></div></div>
            <form class="settings-preferences" data-form="settings-preferences">
              <label for="settings-default-timezone">默认时区<input id="settings-default-timezone" name="defaultTimezone" required /></label>
              <fieldset><legend>默认提醒</legend><label><input type="checkbox" name="reminderInApp" />应用内</label><label><input type="checkbox" name="reminderBrowser" />浏览器通知</label><label>提前分钟数<input name="reminderOffset" type="number" min="1" value="30" /></label></fieldset>
              <div class="settings-actions"><button type="submit">保存偏好</button><button type="button" data-action="request-notifications" data-variant="secondary">启用浏览器通知</button></div>
            </form>
            <p class="settings-status" role="status" aria-live="polite"></p>
          </section>
          <section class="settings-panel ai-settings-panel" aria-labelledby="ai-settings-title">
            <div class="section-heading"><div><p class="section-label">可选服务</p><h2 id="ai-settings-title">AI 接口</h2></div></div>
            <form class="ai-settings-form" data-form="ai-settings">
              <label for="ai-api-url">API 地址<input id="ai-api-url" name="apiUrl" type="url" placeholder="https://api.openai.com/v1" required /></label>
              <label for="ai-model">模型名<input id="ai-model" name="model" required /></label>
              <label for="ai-api-key">API Key<input id="ai-api-key" name="apiKey" type="password" autocomplete="new-password" placeholder="保存后仅显示已配置" required /></label>
              <label for="ai-organization-id">组织 ID<input id="ai-organization-id" name="organizationId" /></label>
              <label for="ai-custom-headers">自定义请求头<textarea id="ai-custom-headers" name="customHeaders" rows="3" placeholder="X-Header: value"></textarea></label>
              <div class="settings-actions"><button type="button" data-action="test-ai-settings" data-variant="secondary">测试连接</button><button type="submit">保存 AI 设置</button><button type="button" data-action="clear-ai-settings" class="danger-action">清除 AI 设置</button></div>
            </form>
            <p class="ai-settings-status" role="status" aria-live="polite">尚未配置 AI</p>
          </section>
          <section class="data-management-panel" aria-labelledby="data-management-title">
            <div class="section-heading"><div><p class="section-label">本地存储</p><h2 id="data-management-title">数据管理</h2></div></div>
            <p class="data-preview-summary">点击查看当前浏览器中的本地记录数量。</p>
            <div class="settings-actions"><button type="button" data-action="refresh-data-preview" data-variant="secondary">查看数据统计</button><button type="button" data-action="open-clear-data" class="danger-action">清除全部数据</button></div>
            <div class="data-clear-dialog" role="dialog" aria-modal="true" aria-labelledby="clear-data-title" hidden><h3 id="clear-data-title">确认清除本地数据</h3><p class="data-clear-summary"></p><label for="clear-data-confirmation">输入 DELETE 确认<input id="clear-data-confirmation" autocomplete="off" /></label><div class="settings-actions"><button type="button" data-action="confirm-clear-data" class="danger-action">确认清除</button><button type="button" data-action="cancel-clear-data" data-variant="secondary">取消</button></div></div>
          </section>
          <div class="backup-panel-mount"></div>
        </section>
      </main>
    </div>
  `;

  const applicationMount = root.querySelector<HTMLElement>(".application-board-mount");
  if (applicationMount) {
    applicationMount.replaceWith(createApplicationBoard(documentRef, {
      applicationService: options.applicationService,
      stageService: options.stageService,
      jobDescriptionService: options.jobDescriptionService,
      resumeLibrary: options.resumeLibrary,
      matchingService: options.matchingService,
      aiAdvisorService: options.aiAdvisorService,
      signal,
    }));
  }

  const dashboardMount = root.querySelector<HTMLElement>(".dashboard-mount");
  let dashboard: HTMLElement | undefined;
  if (dashboardMount) {
    dashboard = createDashboard(documentRef, {
      dashboardService: options.dashboardService,
      exportInterviewICS: options.exportInterviewICS,
      signal,
    });
    dashboardMount.replaceWith(dashboard);
  }

  const interviewMount = root.querySelector<HTMLElement>(".interview-calendar-mount");
  if (interviewMount) {
    interviewMount.replaceWith(createInterviewCalendar(documentRef, {
      interviewService: options.interviewService,
      applications: async () => options.applicationService?.listApplications?.() ?? [],
      notificationService: options.notificationService,
      exportInterviewICS: options.exportInterviewICS,
      now: options.now,
      signal,
    }));
  }
  const reviewMount = root.querySelector<HTMLElement>(".interview-review-mount");
  if (reviewMount) {
    const review = createInterviewReview(documentRef, { reviewService: options.reviewService });
    reviewMount.replaceWith(review);
    // 日历卡片的“填写复盘”在日历元素上派发（不冒泡），直接转发给复盘组件。
    root.querySelector("[data-component=interview-calendar]")?.addEventListener("interview-selected", (event) => {
      review.dispatchEvent(new CustomEvent("interview-selected", { detail: (event as CustomEvent<string>).detail }));
    });
    // 首页仪表盘“待复盘”的“填写复盘”按钮派发的事件会冒泡到 #app root；
    // 在 root 层转发给复盘组件，并切换到面试视图，否则从首页点击后复盘一直停在“请选择面试”。
    root.addEventListener("interview-selected", (event) => {
      const detail = (event as CustomEvent<string>).detail;
      if (!detail) return;
      review.dispatchEvent(new CustomEvent("interview-selected", { detail }));
      navigateToView(root, documentRef, "interviews");
      review.scrollIntoView?.({ block: "start" });
    }, { signal });
  }
  root.addEventListener("interview-updated", () => dashboard?.dispatchEvent(new Event("interview-updated")), { signal });
  root.addEventListener("review-saved", () => dashboard?.dispatchEvent(new Event("review-saved")), { signal });
  const refreshOverview = async () => {
    const applicationCount = options.applicationService ? (await options.applicationService.listApplications()).filter((item) => !item.archivedAt).length : 0;
    const interviewRows = options.interviewService ? await options.interviewService.listInterviews() : [];
    const nowMs = (options.now?.() ?? new Date()).getTime();
    const upcoming = interviewRows.filter((item: any) => ["scheduled", "rescheduled"].includes(item.status) && Date.parse(item.startsAt) >= nowMs && Date.parse(item.startsAt) <= nowMs + 7 * 86_400_000).length;
    const applicationSummary = root.querySelector<HTMLElement>(".application-summary-count");
    const interviewSummary = root.querySelector<HTMLElement>(".interview-summary-count");
    if (applicationSummary) applicationSummary.textContent = `${applicationCount} 个职位`;
    if (interviewSummary) interviewSummary.textContent = upcoming ? `${upcoming} 场近期面试` : "暂无安排";
  };
  void refreshOverview();
  root.addEventListener("app-data-changed", () => void refreshOverview(), { signal });
  root.addEventListener("interview-updated", () => void refreshOverview(), { signal });
  bus.on("app-data-changed", () => void refreshOverview());

  const backupMount = root.querySelector<HTMLElement>(".backup-panel-mount");
  if (backupMount) {
    backupMount.replaceWith(createBackupPanel(documentRef, { backupService: options.backupService }));
  }

  const matchingMount = root.querySelector<HTMLElement>(".matching-page-mount");
  if (matchingMount) matchingMount.replaceWith(createMatchingPage(documentRef, {
    applicationService: options.applicationService,
    resumeLibrary: options.resumeLibrary,
    matchingService: options.matchingService,
    onOpenAi: (applicationId) => navigateToView(root, documentRef, "ai", applicationId),
    signal,
  }));
  const aiMount = root.querySelector<HTMLElement>(".ai-page-mount");
  let aiPage: HTMLElement | undefined;
  if (aiMount) {
    aiPage = createAiPage(documentRef, {
    applicationService: options.applicationService,
    aiAdvisorService: options.aiAdvisorService,
    onOpenSettings: () => navigateToView(root, documentRef, "settings"),
    signal,
    });
    aiMount.replaceWith(aiPage);
  }

  setupSettingsPanel(root, options.database, (service) => {
    aiPage?.dispatchEvent(new CustomEvent("ai-service-changed", { detail: service }));
    options.onAiSettingsChanged?.(service);
  });

  const resumeMount = root.querySelector<HTMLElement>(".resume-library-mount");
  if (resumeMount) {
    resumeMount.replaceWith(createResumeLibrary(documentRef, {
      resumeLibrary: options.resumeLibrary,
      resumeIngestion: options.resumeIngestion,
      applicationService: options.applicationService,
      bus,
      signal,
    }));
  }
  const resumeSummary = root.querySelector<HTMLElement>(".resume-summary-count");
  bus.on("resumes-changed", ({ count }) => {
    if (resumeSummary) resumeSummary.textContent = `${count} 份简历`;
  });

  setupViewNavigation(root, documentRef, signal);

  return root;
}

function setupSettingsPanel(root: HTMLElement, database?: IDBDatabase, onAiSettingsChanged?: (service: AiAdvisorService | undefined) => void): void {
  const settingsRoot = root.querySelector<HTMLElement>(".settings-panel") ?? root;
  const form = settingsRoot.querySelector<HTMLFormElement>('[data-form="settings-preferences"]');
  const timezone = settingsRoot.querySelector<HTMLInputElement>("#settings-default-timezone");
  const reminderInApp = settingsRoot.querySelector<HTMLInputElement>('input[name="reminderInApp"]');
  const reminderBrowser = settingsRoot.querySelector<HTMLInputElement>('input[name="reminderBrowser"]');
  const reminderOffset = settingsRoot.querySelector<HTMLInputElement>('input[name="reminderOffset"]');
  const status = settingsRoot.querySelector<HTMLElement>(".settings-status");
  const preview = root.querySelector<HTMLElement>(".data-preview-summary");
  const clearDialog = root.querySelector<HTMLElement>(".data-clear-dialog");
  const clearSummary = root.querySelector<HTMLElement>(".data-clear-summary");
  const clearConfirmation = root.querySelector<HTMLInputElement>("#clear-data-confirmation");
  const notificationButton = settingsRoot.querySelector<HTMLButtonElement>('[data-action="request-notifications"]');
  const refreshButton = root.querySelector<HTMLButtonElement>('[data-action="refresh-data-preview"]');
  const clearButton = root.querySelector<HTMLButtonElement>('[data-action="open-clear-data"]');

  if (!form || !timezone || !status || !preview || !clearDialog || !clearSummary || !clearConfirmation) return;

  const preferences = getPreferences();
  timezone.value = preferences.defaultTimezone || getDefaultTimezone();
  const reminders = preferences.defaultReminders.length ? preferences.defaultReminders : getDefaultReminders();
  if (reminderInApp) reminderInApp.checked = reminders.some((item) => item.channel === "in-app");
  if (reminderBrowser) reminderBrowser.checked = reminders.some((item) => item.channel === "browser");
  if (reminderOffset && reminders[0]) reminderOffset.value = String(reminders[0].offsetMinutes);
  status.textContent = notificationStatus();

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    try {
      const offset = Number(reminderOffset?.value ?? 30);
      if (!Number.isFinite(offset) || offset <= 0) throw new Error("invalid reminder offset");
      const defaultReminders = [
        ...(reminderInApp?.checked ? [{ offsetMinutes: offset, channel: "in-app" as const }] : []),
        ...(reminderBrowser?.checked ? [{ offsetMinutes: offset, channel: "browser" as const }] : []),
      ];
      savePreferences({ defaultTimezone: timezone.value.trim(), defaultReminders });
      status.textContent = "默认时区和提醒设置已保存到此浏览器。";
    } catch {
      status.textContent = "时区无效，请使用 IANA 格式，例如 Asia/Shanghai。";
      timezone.focus();
    }
  });

  notificationButton?.addEventListener("click", async () => {
    if (typeof Notification === "undefined") {
      status.textContent = notificationStatus();
      return;
    }
    try {
      await Notification.requestPermission();
      status.textContent = notificationStatus();
    } catch {
      status.textContent = "通知授权失败；应用内提醒和 ICS 导出仍可用。";
    }
  });

  const updatePreview = async (): Promise<void> => {
    if (!database) {
      preview.textContent = "本地数据库连接后可显示记录数量。";
      return;
    }
    try {
      const result = await previewDataClear(database);
      preview.textContent = `当前有 ${result.totalRecords} 条业务记录、${result.textRecords} 条文本记录和 ${result.blobs} 个原始文件。`;
      clearSummary.textContent = `将永久删除 ${result.totalRecords} 条业务记录、${result.textRecords} 条文本记录和 ${result.blobs} 个原始文件，以及本地 AI 设置和界面偏好。此操作不能撤销。`;
    } catch {
      preview.textContent = "无法读取本地数据统计，可刷新页面后重试。";
    }
  };

  refreshButton?.addEventListener("click", () => void updatePreview());
  clearButton?.addEventListener("click", async () => {
    await updatePreview();
    clearDialog.hidden = false;
    clearConfirmation.value = "";
    clearConfirmation.focus();
  });
  clearDialog.addEventListener("click", async (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-action]");
    if (!button) return;
    if (button.dataset.action === "cancel-clear-data") {
      clearDialog.hidden = true;
      status.textContent = "已取消清除，本地数据未改变。";
      clearButton?.focus();
      return;
    }
    if (button.dataset.action !== "confirm-clear-data") return;
    if (!database) {
      status.textContent = "本地数据库尚未连接，无法清除数据。";
      return;
    }
    if (clearConfirmation.value !== CLEAR_CONFIRMATION_WORD) {
      status.textContent = `请输入 ${CLEAR_CONFIRMATION_WORD} 后再确认。`;
      clearConfirmation.focus();
      return;
    }
    button.disabled = true;
    const result = await clearAllData(database, { confirmationWord: clearConfirmation.value });
    button.disabled = false;
    if (!result.cleared) {
      status.textContent = "清除失败，本地数据未改变；可刷新页面后重试。";
      return;
    }
    clearDialog.hidden = true;
    preview.textContent = "本地数据已清除。";
    status.textContent = "全部本地数据和设置已清除。";
    root.ownerDocument.defaultView?.dispatchEvent(new Event("app-data-cleared"));
    root.dispatchEvent(new CustomEvent("app-data-changed", { bubbles: true }));
  });

  const aiForm = root.querySelector<HTMLFormElement>('[data-form="ai-settings"]');
  const aiStatus = root.querySelector<HTMLElement>(".ai-settings-status");
  const aiUrl = root.querySelector<HTMLInputElement>('input[name="apiUrl"]');
  const aiModel = root.querySelector<HTMLInputElement>('input[name="model"]');
  const aiKey = root.querySelector<HTMLInputElement>('input[name="apiKey"]');
  const aiOrg = root.querySelector<HTMLInputElement>('input[name="organizationId"]');
  const aiHeaders = root.querySelector<HTMLTextAreaElement>('textarea[name="customHeaders"]');
  const testAi = root.querySelector<HTMLButtonElement>('[data-action="test-ai-settings"]');
  const clearAi = root.querySelector<HTMLButtonElement>('[data-action="clear-ai-settings"]');
  const readAiForm = () => ({
    apiUrl: aiUrl?.value.trim() ?? "",
    model: aiModel?.value.trim() ?? "",
    apiKey: aiKey?.value.trim() ?? "",
    organizationId: aiOrg?.value.trim() ?? "",
    customHeaders: Object.fromEntries((aiHeaders?.value ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
      const separator = line.indexOf(":");
      return separator > 0 ? [line.slice(0, separator).trim(), line.slice(separator + 1).trim()] : ["", ""];
    }).filter(([name, value]) => name && value)),
  });
  const loadAi = async () => {
    if (!database || !aiForm) return;
    try {
      const settings = await getAiSettings(database);
      if (!settings) return;
      if (aiUrl) aiUrl.value = settings.apiUrl;
      if (aiModel) aiModel.value = settings.model;
      if (aiOrg) aiOrg.value = settings.organizationId;
      if (aiHeaders) aiHeaders.value = Object.entries(settings.customHeaders).map(([name, value]) => `${name}: ${value}`).join("\n");
      if (aiKey) { aiKey.required = false; aiKey.placeholder = "已配置，留空则保持原 Key"; }
      if (aiStatus) aiStatus.textContent = "AI 已配置，可测试连接。";
    } catch { if (aiStatus) aiStatus.textContent = "AI 设置读取失败。"; }
  };
  void loadAi();
  testAi?.addEventListener("click", async () => {
    if (!aiStatus) return;
    try { const settings = readAiForm(); validateAiSettings(settings); aiStatus.textContent = "正在测试连接..."; await createOpenAiClient(settings).testConnection(); aiStatus.textContent = "连接成功。"; }
    catch { aiStatus.textContent = "连接失败，请检查地址、模型和密钥。"; }
  });
  aiForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!database || !aiStatus) { if (aiStatus) aiStatus.textContent = "数据库尚未连接，无法保存 AI 设置。"; return; }
    try {
      const current = await getAiSettings(database);
      const next = readAiForm();
      if (!next.apiKey && current) next.apiKey = current.apiKey;
      validateAiSettings(next);
      await saveAiSettings(database, next);
      const service = new AiAdvisorService(database, { settings: next, client: createOpenAiClient(next) });
      onAiSettingsChanged?.(service);
      if (aiKey) { aiKey.value = ""; aiKey.required = false; aiKey.placeholder = "已配置，留空则保持原 Key"; }
      aiStatus.textContent = "AI 设置已保存。";
    } catch { aiStatus.textContent = "AI 设置无效或保存失败，请检查输入。"; }
  });
  clearAi?.addEventListener("click", async () => {
    if (!database || !aiStatus) return;
    const confirm = root.ownerDocument.defaultView?.confirm;
    if (confirm && !confirm.call(root.ownerDocument.defaultView, "确定清除 AI 设置吗？")) return;
    try { await clearAiSettings(database); onAiSettingsChanged?.(undefined); aiForm?.reset(); if (aiStatus) aiStatus.textContent = "AI 设置已清除。"; }
    catch { aiStatus.textContent = "AI 设置清除失败。"; }
  });
}

function notificationStatus(): string {
  if (typeof Notification === "undefined") return "浏览器通知不可用；应用内提醒和 ICS 导出仍可用。";
  if (Notification.permission === "granted") return "浏览器通知已授权；应用内提醒和 ICS 导出仍可用。";
  if (Notification.permission === "denied") return "浏览器通知已被拒绝；应用内提醒和 ICS 导出仍可用。";
  return "浏览器通知尚未授权；应用内提醒和 ICS 导出仍可用。";
}

const APP_VIEWS = ["overview", "resumes", "applications", "interviews", "matching", "ai", "settings"] as const;
type AppView = (typeof APP_VIEWS)[number];

function navigateToView(root: HTMLElement, documentRef: Document, name: AppView, applicationId?: string): void {
  root.dispatchEvent(new CustomEvent("app-navigate", { detail: { name, applicationId } }));
  if (applicationId) root.querySelector<HTMLElement>(".ai-page")?.dispatchEvent(new CustomEvent("ai-application-selected", { detail: applicationId }));
  if (!documentRef.defaultView) return;
}

function setupViewNavigation(root: HTMLElement, documentRef: Document, signal?: AbortSignal): void {
  const tabs = Array.from(root.querySelectorAll<HTMLButtonElement>(".app-nav__tab"));
  const views = Array.from(root.querySelectorAll<HTMLElement>(".app-view"));
  if (!tabs.length || !views.length) return;

  const view = documentRef.defaultView;
  const isKnown = (name: string): name is AppView =>
    (APP_VIEWS as readonly string[]).includes(name);

  const showView = (name: AppView, push = false, applicationId?: string) => {
    views.forEach((section) => {
      section.hidden = section.dataset.viewPanel !== name;
    });
    tabs.forEach((tab) => {
      tab.setAttribute("aria-selected", String(tab.dataset.view === name));
    });
    root.dispatchEvent(new CustomEvent("app-view-changed", { detail: name }));
    if (view) {
      const current = view.location.hash.replace(/^#/, "");
      if (push || current !== name) {
        try {
          const url = new URL(view.location.href);
          url.hash = name;
          if (applicationId) url.searchParams.set("applicationId", applicationId);
          else url.searchParams.delete("applicationId");
          (push ? view.history.pushState : view.history.replaceState).call(view.history, null, "", url.toString());
        } catch {
          /* history 不可用时忽略,视图切换仍生效 */
        }
      }
    }
  };

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const name = tab.dataset.view;
      if (name && isKnown(name)) showView(name, true);
    });
  });

  root.addEventListener("app-navigate", (event) => {
    const detail = (event as CustomEvent<{ name?: string; applicationId?: string }>).detail;
    if (detail?.name && isKnown(detail.name)) showView(detail.name, true, detail.applicationId);
  }, { signal });
  view?.addEventListener("hashchange", () => {
    const name = view.location.hash.replace(/^#/, "");
    showView(isKnown(name) ? name : "overview");
  }, { signal });
  view?.addEventListener("popstate", () => {
    const name = view.location.hash.replace(/^#/, "");
    showView(isKnown(name) ? name : "overview");
  }, { signal });

  const initial = view?.location.hash.replace(/^#/, "") ?? "";
  showView(isKnown(initial) ? initial : "overview");
}
