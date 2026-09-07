import type { Application, Interview, Reminder, ReminderFailure } from "../../db/types";
import { formatInterviewLocalTime, formatReminderLocalTime } from "../../calendar/reminders";
import { getDefaultReminders, getDefaultTimezone } from "../../settings/preferences";

type InterviewInput = Omit<Interview, "id" | "createdAt" | "updatedAt" | "status"> & { status?: Interview["status"] };

export interface InterviewCalendarOptions {
  interviewService?: {
    listInterviews(applicationId?: string): Promise<Interview[]>;
    createInterview(input: InterviewInput): Promise<Interview>;
    updateInterview?(id: string, patch: Partial<InterviewInput>): Promise<Interview>;
    rescheduleInterview(id: string, input: Pick<Interview, "startsAt" | "timezone"> & Partial<Pick<Interview, "endsAt">>): Promise<Interview>;
    cancelInterview(id: string): Promise<Interview>;
    completeInterview(id: string): Promise<Interview>;
  };
  applications?: () => Promise<Application[]>;
  notificationService?: { schedule(interview: Interview, reminder: Reminder): Promise<{ reminderAt: string; failure?: ReminderFailure }>; clearInterview?(interviewId: string): void };
  exportInterviewICS?: (id: string) => Promise<string>;
  now?: () => Date;
  signal?: AbortSignal;
}

const fallbackService = {
  listInterviews: async () => [] as Interview[], createInterview: async (input: InterviewInput) => input as Interview,
  updateInterview: async (_id: string, input: Partial<InterviewInput>) => input as Interview,
  rescheduleInterview: async (_id: string, input: Pick<Interview, "startsAt" | "timezone">) => input as Interview,
  cancelInterview: async () => undefined as never, completeInterview: async () => undefined as never,
};
const escapeHtml = (value: unknown): string => String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);

function timezoneParts(date: Date, timezone: string): Record<string, number> {
  return Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
}

export function zonedLocalToIso(value: string, timezone: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error("请输入有效的面试时间");
  const desired = match.slice(1).map(Number);
  const desiredUtc = Date.UTC(desired[0], desired[1] - 1, desired[2], desired[3], desired[4]);
  let instant = desiredUtc;
  for (let attempt = 0; attempt < 3; attempt += 1) { const actual = timezoneParts(new Date(instant), timezone); instant += desiredUtc - Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute); }
  return new Date(instant).toISOString();
}

function isoToLocalInput(iso: string, timezone: string): string {
  const parts = timezoneParts(new Date(iso), timezone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}T${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}

function inRange(interview: Interview, anchor: string, view: "day" | "week" | "month"): boolean {
  const date = isoToLocalInput(interview.startsAt, interview.timezone).slice(0, 10);
  if (view === "day") return date === anchor;
  if (view === "month") return date.slice(0, 7) === anchor.slice(0, 7);
  const anchorDate = new Date(`${anchor}T00:00:00Z`); const weekday = (anchorDate.getUTCDay() + 6) % 7;
  const start = new Date(anchorDate); start.setUTCDate(start.getUTCDate() - weekday); const end = new Date(start); end.setUTCDate(end.getUTCDate() + 7);
  const candidate = new Date(`${date}T00:00:00Z`); return candidate >= start && candidate < end;
}

function notificationMessage(): string {
  if (typeof Notification === "undefined") return "浏览器通知不可用或浏览器已关闭；应用内提醒和 ICS 导出仍可用。";
  if (Notification.permission === "denied") return "浏览器通知已被拒绝；应用内提醒和 ICS 导出仍可用。";
  if (Notification.permission === "granted") return "浏览器通知已授权；应用内提醒和 ICS 导出仍可用。";
  return "浏览器通知尚未授权；应用内提醒和 ICS 导出仍可用。";
}

export function createInterviewCalendar(documentRef: Document, options: InterviewCalendarOptions = {}): HTMLElement {
  const service: NonNullable<InterviewCalendarOptions["interviewService"]> = options.interviewService ?? fallbackService; const now = options.now?.() ?? new Date(); const today = now.toISOString().slice(0, 10);
  const root = documentRef.createElement("section"); root.className = "interview-calendar"; root.dataset.component = "interview-calendar"; root.setAttribute("aria-labelledby", "interview-calendar-title");
  root.innerHTML = `<div class="section-heading interview-calendar__heading"><div><p class="section-label">面试</p><h2 id="interview-calendar-title">面试日历</h2></div><div class="interview-calendar__views" role="group" aria-label="日历视图"><button type="button" data-calendar-view="day" aria-pressed="true">日</button><button type="button" data-calendar-view="week" aria-pressed="false">周</button><button type="button" data-calendar-view="month" aria-pressed="false">月</button><label for="calendar-anchor">查看日期</label><input id="calendar-anchor" type="date" value="${today}" /></div></div><div class="notification-fallback"><p role="status" aria-live="polite">${notificationMessage()}</p><button type="button" data-action="request-notifications">启用浏览器通知</button></div><ul class="notification-failures" aria-label="通知失败记录"></ul><div class="interview-calendar__status" role="status" aria-live="polite" aria-atomic="true">正在读取面试...</div>
    <form data-form="interview" class="interview-form"><div class="interview-form__heading"><h3 data-form-title>创建面试</h3><button type="button" data-action="cancel-edit" hidden>取消编辑</button></div><div class="interview-form__grid"><label for="interview-application">职位<select id="interview-application" name="applicationId" required></select></label><label for="interview-round">轮次<input id="interview-round" name="round" type="number" min="1" value="1" required /></label><label for="interview-title">标题<input id="interview-title" name="title" required /></label><label for="interview-type">类型<select id="interview-type" name="type"><option value="video">视频</option><option value="phone">电话</option><option value="onsite">现场</option><option value="assessment">测评</option><option value="other">其他</option></select></label><label for="interview-starts-at">开始时间<input id="interview-starts-at" name="startsAt" type="datetime-local" required /></label><label for="interview-ends-at">结束时间<input id="interview-ends-at" name="endsAt" type="datetime-local" /></label><label for="interview-timezone">时区<input id="interview-timezone" name="timezone" value="Asia/Shanghai" required aria-describedby="timezone-help" /><span id="timezone-help">例如 Asia/Shanghai</span></label><label for="interview-location">地点或链接<input id="interview-location" name="locationOrLink" /></label><label for="interview-interviewer">面试官<input id="interview-interviewer" name="interviewer" /></label><label for="interview-reminder-preset">提醒时间<select id="interview-reminder-preset" name="reminderPreset"><option value="10">10 分钟前</option><option value="30" selected>30 分钟前</option><option value="60">1 小时前</option><option value="1440">1 天前</option><option value="custom">自定义</option></select></label><label for="interview-custom-reminder">自定义提醒（分钟）<input id="interview-custom-reminder" name="customReminder" type="number" min="1" value="30" /></label><fieldset><legend>提醒方式</legend><label for="interview-in-app"><input id="interview-in-app" name="inAppReminder" type="checkbox" checked />应用内</label><label for="interview-browser"><input id="interview-browser" name="browserReminder" type="checkbox" />浏览器通知</label></fieldset></div><label for="interview-note">备注<textarea id="interview-note" name="note" rows="2"></textarea></label><button type="submit">保存面试</button></form>
    <form class="reschedule-form" data-form="reschedule" hidden><h3>面试改期</h3><label for="reschedule-starts-at">新的开始时间<input id="reschedule-starts-at" name="startsAt" type="datetime-local" required /></label><label for="reschedule-ends-at">新的结束时间<input id="reschedule-ends-at" name="endsAt" type="datetime-local" /></label><label for="reschedule-timezone">时区<input id="reschedule-timezone" name="timezone" required /></label><button type="submit">确认改期</button><button type="button" data-action="cancel-reschedule">取消</button></form><div class="interview-calendar__list" aria-live="polite"></div><section class="in-app-reminders" aria-labelledby="in-app-reminders-title"><h3 id="in-app-reminders-title">应用内提醒</h3><ul></ul></section>`;

  const status = root.querySelector<HTMLElement>(".interview-calendar__status")!; const form = root.querySelector<HTMLFormElement>('[data-form="interview"]')!; const rescheduleForm = root.querySelector<HTMLFormElement>('[data-form="reschedule"]')!; const list = root.querySelector<HTMLElement>(".interview-calendar__list")!; const appSelect = form.elements.namedItem("applicationId") as HTMLSelectElement; const anchor = root.querySelector<HTMLInputElement>("#calendar-anchor")!;
  const defaultTimezone = getDefaultTimezone();
  (form.elements.namedItem("timezone") as HTMLInputElement).value = defaultTimezone;
  (rescheduleForm.elements.namedItem("timezone") as HTMLInputElement).value = defaultTimezone;
  const defaultReminders = getDefaultReminders();
  if (defaultReminders.length) {
    const first = defaultReminders[0];
    const preset = form.elements.namedItem("reminderPreset") as HTMLSelectElement;
    const custom = form.elements.namedItem("customReminder") as HTMLInputElement;
    preset.value = [10, 30, 60, 1440].includes(first.offsetMinutes) ? String(first.offsetMinutes) : "custom";
    custom.value = String(first.offsetMinutes);
    (form.elements.namedItem("inAppReminder") as HTMLInputElement).checked = defaultReminders.some((item) => item.channel === "in-app");
    (form.elements.namedItem("browserReminder") as HTMLInputElement).checked = defaultReminders.some((item) => item.channel === "browser");
  }
  if (typeof form.scrollIntoView !== "function") form.scrollIntoView = () => undefined;
  let records: Interview[] = []; let applications: Application[] = []; let view: "day" | "week" | "month" = "day"; let editingId: string | undefined; let reschedulingId: string | undefined; const failures: string[] = [];
  const applicationFor = (id: string) => applications.find((application) => application.id === id);
  const render = () => {
    const visible = records.filter((item) => inRange(item, anchor.value, view));
    list.innerHTML = visible.map((item) => { const application = applicationFor(item.applicationId); const reminders = item.reminders.map((reminder) => `${reminder.offsetMinutes} 分钟前 / ${reminder.channel === "browser" ? "浏览器" : "应用内"}`).join("；"); return `<article class="interview-item" data-interview-id="${escapeHtml(item.id)}"><div class="interview-item__body"><h3>${escapeHtml(item.title || `第 ${item.round} 轮面试`)}</h3><p>${escapeHtml(application?.company ?? "未知公司")} · ${escapeHtml(application?.position ?? "未知职位")} · 第 ${item.round} 轮</p><p>${escapeHtml(formatInterviewLocalTime(item.startsAt, item.timezone))} · ${escapeHtml(item.timezone)}</p><p>状态：${escapeHtml(item.status)} · 提醒：${escapeHtml(reminders || "无")}</p><p>${escapeHtml(item.locationOrLink)}${item.interviewer ? ` · 面试官：${escapeHtml(item.interviewer)}` : ""}</p></div><div class="interview-item__actions"><button type="button" data-action="edit" data-interview-id="${escapeHtml(item.id)}">编辑</button><button type="button" data-action="reschedule" data-interview-id="${escapeHtml(item.id)}">改期</button><button type="button" data-action="cancel" data-interview-id="${escapeHtml(item.id)}">取消</button><button type="button" data-action="complete" data-interview-id="${escapeHtml(item.id)}">完成</button><button type="button" data-action="review" data-interview-id="${escapeHtml(item.id)}">填写或编辑复盘</button><button type="button" data-action="export-ics" data-interview-id="${escapeHtml(item.id)}">导出 ICS</button></div></article>`; }).join("") || `<p class="interview-empty">当前范围没有面试安排</p>`;
    root.querySelectorAll<HTMLButtonElement>("[data-calendar-view]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.calendarView === view)));
    const reminders = records.flatMap((interview) => interview.reminders.filter((item) => item.channel === "in-app").map((item) => ({ interview, item })));
    root.querySelector(".in-app-reminders ul")!.innerHTML = reminders.map(({ interview, item }) => `<li>${escapeHtml(interview.title)}：${escapeHtml(formatReminderLocalTime(interview.startsAt, interview.timezone, item))}（${escapeHtml(interview.timezone)}）</li>`).join("") || "<li>暂无应用内提醒</li>";
    root.querySelector(".notification-failures")!.innerHTML = failures.map(() => "<li>浏览器通知失败；已转为应用内提醒。</li>").join("");
    status.textContent = `${visible.length} 场面试 · ${view === "day" ? "日" : view === "week" ? "周" : "月"}视图${failures.length ? ` · ${failures.length} 个通知失败，已保留应用内提醒` : ""}`;
  };
  const refresh = async () => { records = await service.listInterviews(); render(); };
  const load = async () => { try { applications = options.applications ? await options.applications() : []; appSelect.innerHTML = applications.map((application) => `<option value="${escapeHtml(application.id)}">${escapeHtml(application.company)} · ${escapeHtml(application.position)}</option>`).join(""); await refresh(); if (records.length && !records.some((item) => inRange(item, anchor.value, "day"))) { const nearest = records.reduce((candidate, item) => Math.abs(Date.parse(item.startsAt) - now.getTime()) < Math.abs(Date.parse(candidate.startsAt) - now.getTime()) ? item : candidate); anchor.value = isoToLocalInput(nearest.startsAt, nearest.timezone).slice(0, 10); render(); } if (records[0]) root.dispatchEvent(new CustomEvent("interview-selected", { detail: records[0].id })); } catch { status.textContent = "面试读取失败，可重试"; } };
  const resetForm = () => { form.reset(); editingId = undefined; (form.querySelector("[data-form-title]") as HTMLElement).textContent = "创建面试"; (form.querySelector('[data-action="cancel-edit"]') as HTMLButtonElement).hidden = true; };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    status.textContent = "正在保存面试...";
    try {
      const data = new FormData(form);
      const timezone = String(data.get("timezone"));
      const preset = String(data.get("reminderPreset"));
      const offsetMinutes = Number(preset === "custom" ? data.get("customReminder") : preset);
      const reminders: Reminder[] = [];
      if (data.get("inAppReminder")) reminders.push({ offsetMinutes, channel: "in-app" });
      if (data.get("browserReminder")) reminders.push({ offsetMinutes, channel: "browser" });
      const input: InterviewInput = {
        applicationId: String(data.get("applicationId")), round: Number(data.get("round")), title: String(data.get("title")).trim(),
        type: String(data.get("type")) as Interview["type"], startsAt: zonedLocalToIso(String(data.get("startsAt")), timezone),
        endsAt: data.get("endsAt") ? zonedLocalToIso(String(data.get("endsAt")), timezone) : undefined, timezone,
        locationOrLink: String(data.get("locationOrLink") ?? ""), interviewer: String(data.get("interviewer") ?? ""), reminders, note: String(data.get("note") ?? ""),
      };
      const wasEditing = Boolean(editingId);
      const saved = editingId && service.updateInterview ? await service.updateInterview(editingId, input) : await service.createInterview(input);
      anchor.value = isoToLocalInput(saved.startsAt, saved.timezone).slice(0, 10);
      // 编辑已有面试时，先清掉旧的定时器，避免旧提前量或旧渠道的通知重复触发。
      if (wasEditing) options.notificationService?.clearInterview?.(saved.id);
      let notificationFailed = false;
      for (const reminder of saved.reminders) {
        if (!options.notificationService) continue;
        try {
          const result = await options.notificationService.schedule(saved, reminder);
          if (result.failure) { failures.push(result.failure.reason); notificationFailed = true; }
        } catch {
          failures.push("notification-scheduling-failed");
          notificationFailed = true;
        }
      }
      resetForm();
      await refresh();
      status.textContent = `${wasEditing ? "面试已更新" : "面试已保存"}${notificationFailed ? "；浏览器通知失败，已保留应用内提醒和 ICS 导出" : ""}`;
      root.dispatchEvent(new CustomEvent("interview-updated", { detail: saved.id, bubbles: true }));
    } catch {
      status.textContent = "面试保存失败，资料未改变；可重试";
    }
  });
  rescheduleForm.addEventListener("submit", async (event) => { event.preventDefault(); if (!reschedulingId) return; status.textContent = "正在保存改期..."; try { const data = new FormData(rescheduleForm); const timezone = String(data.get("timezone")); const id = reschedulingId; const updated = await service.rescheduleInterview(id, { startsAt: zonedLocalToIso(String(data.get("startsAt")), timezone), endsAt: data.get("endsAt") ? zonedLocalToIso(String(data.get("endsAt")), timezone) : undefined, timezone }); options.notificationService?.clearInterview?.(id); for (const reminder of updated.reminders) await options.notificationService?.schedule(updated, reminder); rescheduleForm.hidden = true; reschedulingId = undefined; await refresh(); status.textContent = "面试已改期，旧时间已保留在职位时间线；提醒时间已重新计算"; root.dispatchEvent(new CustomEvent("interview-updated", { detail: id, bubbles: true })); } catch { status.textContent = "改期失败，原时间未改变；可重试"; } });
  root.querySelectorAll<HTMLButtonElement>("[data-calendar-view]").forEach((button) => button.addEventListener("click", () => { view = button.dataset.calendarView as typeof view; render(); }));
  anchor.addEventListener("change", render);
  root.querySelector('[data-action="request-notifications"]')?.addEventListener("click", async () => { const notice = root.querySelector<HTMLElement>(".notification-fallback p")!; if (typeof Notification === "undefined") { notice.textContent = notificationMessage(); return; } try { await Notification.requestPermission(); notice.textContent = notificationMessage(); } catch { notice.textContent = "通知授权失败；应用内提醒和 ICS 导出仍可用。"; } });
  root.querySelector('[data-action="cancel-edit"]')?.addEventListener("click", resetForm);
  root.querySelector('[data-action="cancel-reschedule"]')?.addEventListener("click", () => { rescheduleForm.hidden = true; reschedulingId = undefined; status.textContent = "已取消改期，面试时间未改变"; });
  list.addEventListener("click", async (event) => { const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-action]"); const id = button?.dataset.interviewId; if (!button || !id) return; const interview = records.find((item) => item.id === id); if (!interview) return; try { if (button.dataset.action === "cancel") { const confirmFn = documentRef.defaultView?.confirm; if (confirmFn && !confirmFn.call(documentRef.defaultView, `确定取消“${interview.title || `第 ${interview.round} 轮面试`}”吗？此操作会记入时间线且不可撤销。`)) { status.textContent = "已保留该面试，未做修改"; return; } await service.cancelInterview(id); options.notificationService?.clearInterview?.(id); } else if (button.dataset.action === "complete") { await service.completeInterview(id); options.notificationService?.clearInterview?.(id); } else if (button.dataset.action === "review") { root.dispatchEvent(new CustomEvent("interview-selected", { detail: id })); status.textContent = "已打开该面试的复盘"; return; } else if (button.dataset.action === "reschedule") { reschedulingId = id; (rescheduleForm.elements.namedItem("startsAt") as HTMLInputElement).value = isoToLocalInput(interview.startsAt, interview.timezone); (rescheduleForm.elements.namedItem("endsAt") as HTMLInputElement).value = interview.endsAt ? isoToLocalInput(interview.endsAt, interview.timezone) : ""; (rescheduleForm.elements.namedItem("timezone") as HTMLInputElement).value = interview.timezone; rescheduleForm.hidden = false; (rescheduleForm.elements.namedItem("startsAt") as HTMLInputElement).focus(); status.textContent = "已打开改期表单，尚未修改时间"; return; } else if (button.dataset.action === "edit") { editingId = id; for (const [name, value] of Object.entries({ applicationId: interview.applicationId, round: interview.round, title: interview.title, type: interview.type, startsAt: isoToLocalInput(interview.startsAt, interview.timezone), endsAt: interview.endsAt ? isoToLocalInput(interview.endsAt, interview.timezone) : "", timezone: interview.timezone, locationOrLink: interview.locationOrLink, interviewer: interview.interviewer, note: interview.note })) { const control = form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | null; if (control) control.value = String(value); } const reminder = interview.reminders[0]; const preset = form.elements.namedItem("reminderPreset") as HTMLSelectElement; const custom = form.elements.namedItem("customReminder") as HTMLInputElement; preset.value = reminder && [10, 30, 60, 1440].includes(reminder.offsetMinutes) ? String(reminder.offsetMinutes) : "custom"; custom.value = String(reminder?.offsetMinutes ?? 30); (form.elements.namedItem("inAppReminder") as HTMLInputElement).checked = interview.reminders.some((item) => item.channel === "in-app"); (form.elements.namedItem("browserReminder") as HTMLInputElement).checked = interview.reminders.some((item) => item.channel === "browser"); (form.querySelector("[data-form-title]") as HTMLElement).textContent = "编辑面试"; (form.querySelector('[data-action="cancel-edit"]') as HTMLButtonElement).hidden = false; form.scrollIntoView({ block: "start" }); status.textContent = "已载入面试编辑，尚未保存"; return; } else if (button.dataset.action === "export-ics") { if (!options.exportInterviewICS) throw new Error("当前无法导出 ICS"); const ics = await options.exportInterviewICS(id); const anchorElement = documentRef.createElement("a"); anchorElement.download = `${interview.title || "interview"}.ics`; anchorElement.href = `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`; documentRef.body.append(anchorElement); anchorElement.click(); anchorElement.remove(); status.textContent = "ICS 已准备下载"; return; } await refresh(); status.textContent = button.dataset.action === "cancel" ? "面试已取消" : "面试已完成"; root.dispatchEvent(new CustomEvent("interview-updated", { detail: id, bubbles: true })); } catch { status.textContent = "操作失败，资料未改变；可重试"; } });
  documentRef.defaultView?.addEventListener("app-data-cleared", () => void load(), { signal: options.signal });
  void load(); return root;
}
