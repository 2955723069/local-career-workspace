import type { ResumeIngestionService } from "../features/resumes/ingestion";
import { createApplicationBoard } from "../components/ApplicationBoard/ApplicationBoard";
import { createInterviewCalendar } from "../components/InterviewCalendar/InterviewCalendar";
import { createInterviewReview } from "../components/InterviewReview/InterviewReview";
import type { MatchingService } from "../features/matching/matchingService";
import type { ApplicationBoardOptions } from "../components/ApplicationBoard/ApplicationBoard";
import { createDashboard } from "../components/Dashboard/Dashboard";
import type { DashboardService } from "../features/dashboard/dashboardService";
import type { BackupPanelService } from "../features/backup/BackupPanel";
import type { AiAdvisorService } from "../features/ai/aiAdvisorService";
import { createMatchingPage } from "../components/MatchingPage/MatchingPage";
import { createAiPage } from "../components/AiPage/AiPage";
import { createResumeLibrary } from "../components/ResumeLibrary/ResumeLibrary";
import { createSettingsPage } from "../components/SettingsPage/SettingsPage";
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
          <div class="settings-page-mount"></div>
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

  const settingsMount = root.querySelector<HTMLElement>(".settings-page-mount");
  if (settingsMount) {
    settingsMount.replaceWith(createSettingsPage(documentRef, {
      database: options.database,
      backupService: options.backupService,
      bus,
      onAiSettingsChanged: (service) => {
        aiPage?.dispatchEvent(new CustomEvent("ai-service-changed", { detail: service }));
        options.onAiSettingsChanged?.(service);
      },
      signal,
    }));
  }

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
