import type { ResumeIngestionService } from "../features/resumes/ingestion";
import { createApplicationBoard } from "../components/ApplicationBoard/ApplicationBoard";
import { createApplicationDetail, type ApplicationDetailElement } from "../components/ApplicationDetail/ApplicationDetail";
import { createInterviewCalendar } from "../components/InterviewCalendar/InterviewCalendar";
import { createInterviewReview } from "../components/InterviewReview/InterviewReview";
import type { MatchingService } from "../features/matching/matchingService";
import type { ApplicationBoardOptions } from "../components/ApplicationBoard/ApplicationBoard";
import { createDashboard } from "../components/Dashboard/Dashboard";
import type { DashboardService } from "../features/dashboard/dashboardService";
import type { BackupPanelService } from "../features/backup/BackupPanel";
import type { AiAdvisorService } from "../features/ai/aiAdvisorService";
import { createResumeLibrary } from "../components/ResumeLibrary/ResumeLibrary";
import { createSettingsPage } from "../components/SettingsPage/SettingsPage";
import { createAppBus } from "./appBus";
import { setupRouter } from "./router";

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
          <div class="application-detail-mount"></div>
        </section>
        <section id="view-interviews" class="app-view" data-view-panel="interviews" role="tabpanel" aria-labelledby="interview-calendar-title" hidden>
          <div class="interview-calendar-mount"></div>
          <div class="interview-review-mount"></div>
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
      bus,
      signal,
    }));
  }

  const detailMount = root.querySelector<HTMLElement>(".application-detail-mount");
  let applicationDetail: ApplicationDetailElement | undefined;
  if (detailMount) {
    applicationDetail = createApplicationDetail(documentRef, {
      applicationService: options.applicationService as NonNullable<typeof options.applicationService>,
      stageService: options.stageService as NonNullable<typeof options.stageService>,
      jobDescriptionService: options.jobDescriptionService,
      resumeLibrary: options.resumeLibrary,
      matchingService: options.matchingService,
      aiAdvisorService: options.aiAdvisorService,
      interviewService: options.interviewService,
      reviewService: options.reviewService,
      bus,
      signal,
    }) as ApplicationDetailElement;
    detailMount.replaceWith(applicationDetail);
    applicationDetail.setAttribute("hidden", "");
  }

  const boardEl = () => root.querySelector<HTMLElement>(".application-board");
  const showBoard = () => { boardEl()?.removeAttribute("hidden"); applicationDetail?.setAttribute("hidden", ""); };
  const showDetailView = () => { boardEl()?.setAttribute("hidden", ""); applicationDetail?.removeAttribute("hidden"); };
  showBoard();
  bus.on("application-selected", ({ applicationId, tab }) => {
    showDetailView();
    void applicationDetail?.show(applicationId, tab as never);
  });
  bus.on("application-list", () => showBoard());

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
      bus.emit("app-navigate", { name: "interviews" });
      review.scrollIntoView?.({ block: "start" });
    }, { signal });
  }
  root.addEventListener("interview-updated", () => bus.emit("interview-updated", undefined), { signal });
  root.addEventListener("review-saved", () => bus.emit("review-saved", undefined), { signal });
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
  bus.on("app-data-changed", () => void refreshOverview());
  bus.on("interview-updated", () => {
    dashboard?.dispatchEvent(new Event("interview-updated"));
    void refreshOverview();
  });
  bus.on("review-saved", () => dashboard?.dispatchEvent(new Event("review-saved")));

  const settingsMount = root.querySelector<HTMLElement>(".settings-page-mount");
  if (settingsMount) {
    settingsMount.replaceWith(createSettingsPage(documentRef, {
      database: options.database,
      backupService: options.backupService,
      bus,
      onAiSettingsChanged: (service) => {
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

  setupRouter({ root, documentRef, bus, signal });

  return root;
}
