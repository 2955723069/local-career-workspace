import type { Application } from "../../db/types";
import type { DashboardService, DashboardSnapshot } from "../../features/dashboard/dashboardService";

export interface DashboardOptions {
  dashboardService?: Pick<DashboardService, "getSnapshot">;
  exportInterviewICS?: (id: string) => Promise<string>;
  signal?: AbortSignal;
}

const JOB_TYPES = ["graduate", "internship", "tech", "general", "other"] as const;

export function createDashboard(documentRef: Document, options: DashboardOptions = {}): HTMLElement {
  const root = documentRef.createElement("section");
  root.className = "dashboard";
  root.setAttribute("aria-labelledby", "dashboard-title");
  root.innerHTML = `<div class="section-heading"><div><p class="section-label">仪表盘</p><h2 id="dashboard-title">求职进展总览</h2></div><label for="dashboard-job-type">职位类型<select id="dashboard-job-type"><option value="">全部类型</option>${JOB_TYPES.map((type) => `<option value="${type}">${type}</option>`).join("")}</select></label></div><div class="dashboard-status" role="status" aria-live="polite">正在读取仪表盘...</div><div class="dashboard-grid"></div>`;
  const status = root.querySelector<HTMLElement>(".dashboard-status")!;
  const grid = root.querySelector<HTMLElement>(".dashboard-grid")!;
  const filter = root.querySelector<HTMLSelectElement>("#dashboard-job-type")!;
  const esc = (value: unknown): string => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char] ?? char));
  const render = (value: DashboardSnapshot) => {
    const today = value.todayInterviews.map(({ interview, application }) => `<li><strong>${esc(interview.title)}</strong><span>${esc(application.company)} · ${esc(application.position)}</span><time datetime="${esc(interview.startsAt)}">${new Date(interview.startsAt).toLocaleString()}</time></li>`).join("");
    const actions = value.upcomingActions.map((action) => `<li><strong>${action.type === "interview" ? "面试" : "截止时间"}</strong><span>${esc(action.application.company)} · ${esc(action.application.position)}</span><time datetime="${esc(action.at)}">${new Date(action.at).toLocaleString()}</time></li>`).join("");
    const followUps = value.pendingFollowUps.map(({ application, stage }) => `<li><strong>${esc(application.company)}</strong><span>${esc(application.position)} · ${esc(stage?.name ?? "待跟进")}</span></li>`).join("");
    const stages = value.stageCounts.map((item) => `<li><span>${esc(item.name)}</span><strong>${item.count}</strong></li>`).join("");
    const pending = value.pendingReviews.map(({ interview, application }) => `<li><strong>${esc(application.company)} · ${esc(interview.title)}</strong><button type="button" data-action="open-review" data-interview-id="${esc(interview.id)}">填写复盘</button></li>`).join("");
    const failures = value.reminderFailures.map((failure) => `<li><span>浏览器通知失败</span><small>${esc(failure.application?.company ?? "")}</small><button type="button" data-action="retry-reminder" data-interview-id="${esc(failure.interviewId)}">重试通知</button>${failure.interview && options.exportInterviewICS ? `<button type="button" data-action="export-ics" data-interview-id="${esc(failure.interviewId)}">导出 ICS</button>` : ""}</li>`).join("");
    const resumes = value.recentResumes.map((resume) => `<li><span>${esc(resume.name)}</span><small>${esc(resume.fileName)}</small></li>`).join("");
    const matches = value.recentAnalysisResults.map(({ result, application }) => `<li><span>${esc(application.company)} · ${esc(application.position)}</span><small>覆盖率 ${Math.round(result.coverage.overall)}%</small></li>`).join("");
    grid.innerHTML = `<section class="dashboard-panel" aria-labelledby="dashboard-today-title"><h3 id="dashboard-today-title">今日面试 <span>${value.todayInterviews.length}</span></h3><ul>${today || "<li class=dashboard-empty>今天没有面试安排</li>"}</ul></section><section class="dashboard-panel" aria-labelledby="dashboard-actions-title"><h3 id="dashboard-actions-title">未来 7 日行动 <span>${value.upcomingActions.length}</span></h3><ul>${actions || "<li class=dashboard-empty>未来 7 日暂无行动</li>"}</ul></section><section class="dashboard-panel" aria-labelledby="dashboard-follow-title"><h3 id="dashboard-follow-title">待跟进职位 <span>${value.pendingFollowUps.length}</span></h3><ul>${followUps || "<li class=dashboard-empty>暂无待跟进职位</li>"}</ul></section><section class="dashboard-panel" aria-labelledby="dashboard-stage-title"><h3 id="dashboard-stage-title">阶段数量</h3><ul>${stages || "<li class=dashboard-empty>暂无阶段数据</li>"}</ul></section><section class="dashboard-panel" aria-labelledby="dashboard-review-title"><h3 id="dashboard-review-title">待复盘面试 <span>${value.pendingReviews.length}</span></h3><ul>${pending || "<li class=dashboard-empty>没有待复盘面试</li>"}</ul></section><section class="dashboard-panel dashboard-panel--warning" aria-labelledby="dashboard-failure-title"><h3 id="dashboard-failure-title">提醒失败 <span>${value.reminderFailures.length}</span></h3><p class="dashboard-fallback-note">通知不可用时，应用内提醒和 ICS 导出仍可使用。</p><ul>${failures || "<li class=dashboard-empty>暂无提醒失败</li>"}</ul></section><section class="dashboard-panel" aria-labelledby="dashboard-recent-resumes-title"><h3 id="dashboard-recent-resumes-title">最近简历 <span>${value.recentResumes.length}</span></h3><ul>${resumes || "<li class=dashboard-empty>暂无简历</li>"}</ul></section><section class="dashboard-panel" aria-labelledby="dashboard-recent-matches-title"><h3 id="dashboard-recent-matches-title">最近匹配 <span>${value.recentAnalysisResults.length}</span></h3><ul>${matches || "<li class=dashboard-empty>暂无匹配结果</li>"}</ul></section>`;
    status.textContent = `已更新 · ${value.generatedAt}`;
  };

  const load = async () => {
    if (!options.dashboardService) {
      status.textContent = "暂无仪表盘数据";
      grid.innerHTML = "<p class=dashboard-empty>连接本地数据库后显示聚合结果。</p>";
      return;
    }
    try { render(await options.dashboardService.getSnapshot(filter.value as Application["jobType"] || undefined)); }
    catch { status.textContent = "仪表盘读取失败，可重试"; grid.innerHTML = "<p class=dashboard-empty>读取失败，可点击筛选重新尝试。</p>"; }
  };
  filter.addEventListener("change", () => void load());
  root.addEventListener("click", async (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-action]");
    if (!button) return;
    const interviewId = button.dataset.interviewId;
    if (button.dataset.action === "open-review" && interviewId) root.dispatchEvent(new CustomEvent("interview-selected", { detail: interviewId, bubbles: true }));
    if (button.dataset.action === "retry-reminder" && interviewId) { status.textContent = "已请求重试提醒，请在日历中确认通知权限"; root.dispatchEvent(new CustomEvent("dashboard-retry-reminder", { detail: interviewId, bubbles: true })); }
    if (button.dataset.action === "export-ics" && interviewId && options.exportInterviewICS) {
      try { const ics = await options.exportInterviewICS(interviewId); const anchor = documentRef.createElement("a"); anchor.download = "interview.ics"; anchor.href = `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`; documentRef.body.append(anchor); anchor.click(); anchor.remove(); status.textContent = "ICS 已准备下载"; } catch { status.textContent = "ICS 导出失败，可从日历重试"; }
    }
  });
  root.addEventListener("interview-updated", () => void load());
  root.addEventListener("review-saved", () => void load());
  documentRef.defaultView?.addEventListener("app-data-cleared", () => void load(), { signal: options.signal });
  void load();
  return root;
}
