import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/app/createApp";

describe("interview calendar UI", () => {
  afterEach(() => { document.body.innerHTML = ""; vi.unstubAllGlobals(); });

  it("mounts calendar, creates multiple rounds, switches views and supports review editing", async () => {
    document.body.innerHTML = '<div id="app"></div>';
    const interviews: any[] = [];
    const interviewService = {
      listInterviews: vi.fn(async () => interviews),
      createInterview: vi.fn(async (input: any) => { const value = { ...input, id: `i-${interviews.length + 1}`, status: "scheduled" }; interviews.push(value); return value; }),
      rescheduleInterview: vi.fn(async (id: string, input: any) => Object.assign(interviews.find((item) => item.id === id), input, { status: "rescheduled" })),
      cancelInterview: vi.fn(async (id: string) => Object.assign(interviews.find((item) => item.id === id), { status: "cancelled" })),
      completeInterview: vi.fn(async (id: string) => Object.assign(interviews.find((item) => item.id === id), { status: "completed" })),
    };
    const reviewService = { getReview: vi.fn(async () => undefined), saveReview: vi.fn(async (_id: string, input: any) => input) };
    const root = createApp(document, {
      applicationService: { listApplications: async () => [{ id: "a-1", company: "Acme", position: "Engineer", jobType: "tech", stageId: "s", currentResumeId: undefined }] as any } as any,
      interviewService: interviewService as any,
      reviewService: reviewService as any,
      exportInterviewICS: vi.fn(async () => "BEGIN:VCALENDAR\\nEND:VCALENDAR"),
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(root.querySelector("[data-component=interview-calendar]")).toBeTruthy();
    expect(root.querySelector('form[data-form="interview"]')).toBeTruthy();
    const form = root.querySelector<HTMLFormElement>('form[data-form="interview"]')!;
    for (const round of ["1", "2"]) {
      (form.elements.namedItem("round") as HTMLInputElement).value = round;
      (form.elements.namedItem("startsAt") as HTMLInputElement).value = "2026-09-01T09:00";
      (form.elements.namedItem("timezone") as HTMLInputElement).value = "Asia/Shanghai";
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    expect(interviewService.createInterview).toHaveBeenCalledTimes(2);
    expect(interviewService.createInterview.mock.calls[0][0].startsAt).toBe("2026-09-01T01:00:00.000Z");
    expect(root.querySelectorAll(".interview-item")).toHaveLength(2);
    expect(root.querySelector('[data-calendar-view="day"]')).toBeTruthy();
    (root.querySelector('[data-calendar-view="week"]') as HTMLButtonElement).click();
    expect(root.querySelector('[data-calendar-view="week"]')?.getAttribute("aria-pressed")).toBe("true");
    (root.querySelector('[data-calendar-view="month"]') as HTMLButtonElement).click();
    expect(root.querySelector('[data-calendar-view="month"]')?.getAttribute("aria-pressed")).toBe("true");
    (root.querySelector('[data-action="cancel"]') as HTMLButtonElement).click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(interviewService.cancelInterview).not.toHaveBeenCalled();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    (root.querySelector('[data-action="cancel"]') as HTMLButtonElement).click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(interviewService.cancelInterview).toHaveBeenCalledWith("i-1");
    (root.querySelectorAll('[data-action="complete"]')[1] as HTMLButtonElement).click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(interviewService.completeInterview).toHaveBeenCalledWith("i-2");
    (root.querySelector('[data-action="reschedule"]') as HTMLButtonElement).click();
    const reschedule = root.querySelector<HTMLFormElement>('[data-form="reschedule"]')!;
    (reschedule.elements.namedItem("startsAt") as HTMLInputElement).value = "2026-09-03T10:00";
    reschedule.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(interviewService.rescheduleInterview).toHaveBeenCalledWith("i-1", expect.objectContaining({ startsAt: "2026-09-03T02:00:00.000Z", timezone: "Asia/Shanghai" }));
    expect(root.textContent).toContain("旧时间已保留在职位时间线");
    expect(root.querySelector('[data-action="export-ics"]')).toBeTruthy();
    expect(root.querySelector('[data-component="interview-review"]')).toBeTruthy();
    expect(root.querySelector('[data-calendar-view="day"]')?.tagName).toBe("BUTTON");
    expect((form.elements.namedItem("startsAt") as HTMLInputElement).labels?.length).toBe(1);
  });

  it("canceling review edit preserves saved values", async () => {
    document.body.innerHTML = '<div id="app"></div>';
    const review = { interviewId: "i-1", overallRating: 4, questions: [], goodAnswers: "saved", weakAnswers: "", observedSignals: "", salaryDiscussion: "", nextStep: "", privateNote: "" };
    const root = createApp(document, {
      interviewService: { listInterviews: async () => [{ id: "i-1", applicationId: "a-1", round: 1, title: "Tech", startsAt: "2026-09-01T01:00:00.000Z", timezone: "UTC", status: "scheduled", reminders: [], type: "video", locationOrLink: "", interviewer: "", note: "" }] } as any,
      applicationService: { listApplications: async () => [{ id: "a-1", company: "Acme", position: "Engineer", jobType: "tech" }] } as any,
      reviewService: { getReview: async () => review, saveReview: vi.fn() } as any,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const textarea = root.querySelector<HTMLTextAreaElement>('[data-review-field="goodAnswers"]')!;
    textarea.value = "changed";
    (root.querySelector('[data-action="cancel-review"]') as HTMLButtonElement).click();
    expect(textarea.value).toBe("saved");
  });

  it("keeps in-app reminders and ICS available when notifications are denied", async () => {
    class DeniedNotification { static permission = "denied" as NotificationPermission; static requestPermission = vi.fn(async () => "denied" as NotificationPermission); }
    vi.stubGlobal("Notification", DeniedNotification);
    document.body.innerHTML = '<div id="app"></div>';
    const root = createApp(document);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(root.querySelector(".notification-fallback")?.textContent).toContain("已被拒绝");
    expect(root.querySelector(".in-app-reminders")).toBeTruthy();
    expect(root.querySelector('button[data-action="request-notifications"]')).toBeTruthy();
    expect(root.querySelector('button[data-action="export-ics"]')).toBeNull();
    expect(root.textContent).toContain("ICS 导出仍可用");
  });

  it("keeps the saved interview visible when notification scheduling rejects", async () => {
    document.body.innerHTML = '<div id="app"></div>';
    const interviews: any[] = [];
    const root = createApp(document, {
      applicationService: { listApplications: async () => [{ id: "a-1", company: "Acme", position: "Engineer", jobType: "tech" }] as any } as any,
      interviewService: {
        listInterviews: async () => [...interviews],
        createInterview: async (input: any) => {
          const interview = { ...input, id: "i-1", createdAt: "2026-09-02T00:00:00.000Z", updatedAt: "2026-09-02T00:00:00.000Z", status: "scheduled" };
          interviews.push(interview);
          return interview;
        },
      } as any,
      notificationService: { schedule: vi.fn(async () => { throw new Error("notification transport failed"); }) } as any,
      exportInterviewICS: async () => "BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n",
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const form = root.querySelector<HTMLFormElement>('form[data-form="interview"]')!;
    (form.elements.namedItem("title") as HTMLInputElement).value = "技术面";
    (form.elements.namedItem("startsAt") as HTMLInputElement).value = "2026-09-02T09:00";
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(root.querySelectorAll(".interview-item")).toHaveLength(1);
    expect(root.querySelector(".in-app-reminders")?.textContent).toContain("技术面");
    expect(root.querySelector('[data-action="export-ics"]')).toBeTruthy();
    expect(root.querySelector(".interview-calendar__status")?.textContent).toContain("通知失败");
  });

  it("keeps review wiring working after createApp is called twice (skeleton then services)", async () => {
    document.body.innerHTML = '<div id="app"></div>';
    const saveReview = vi.fn(async (interviewId: string, input: any) => ({ ...input, interviewId, id: "review-1", createdAt: "2026-09-02T00:00:00.000Z", updatedAt: "2026-09-02T00:00:00.000Z" }));
    // First render is the skeleton with no services (mirrors main.ts).
    createApp(document);
    // Second render wires the real services onto the same #app node.
    const root = createApp(document, {
      applicationService: { listApplications: async () => [{ id: "a-1", company: "Acme", position: "Engineer", jobType: "tech" }] as any } as any,
      interviewService: { listInterviews: async () => [{ id: "i-1", applicationId: "a-1", round: 1, title: "Tech", startsAt: "2026-09-02T01:00:00.000Z", timezone: "UTC", status: "scheduled", reminders: [], type: "video", locationOrLink: "", interviewer: "", note: "" }] } as any,
      reviewService: { getReview: async () => undefined, saveReview } as any,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    (root.querySelector('[data-action="review"]') as HTMLButtonElement).click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const reviewRoot = root.querySelector<HTMLElement>('[data-component="interview-review"]')!;
    expect(reviewRoot.querySelector('[data-review-status]')?.textContent).not.toBe("请选择面试");
  });

  it("opens the review from the dashboard 待复盘 entry", async () => {
    document.body.innerHTML = '<div id="app"></div>';
    const interview = { id: "i-1", applicationId: "a-1", round: 1, title: "Tech", startsAt: "2026-09-02T01:00:00.000Z", timezone: "UTC", status: "completed", reminders: [], type: "video", locationOrLink: "", interviewer: "", note: "" };
    const application = { id: "a-1", company: "Acme", position: "Engineer", jobType: "tech" };
    const emptySnapshot = { generatedAt: "2026-09-02T00:00:00.000Z", todayInterviews: [], upcomingActions: [], pendingFollowUps: [], stageCounts: [], recentResumes: [], recentAnalysisResults: [], pendingReviews: [{ interview, application }], reminderFailures: [] };
    const root = createApp(document, {
      // Calendar returns no interviews so nothing auto-selects — isolates the dashboard entry.
      applicationService: { listApplications: async () => [application] as any } as any,
      interviewService: { listInterviews: async () => [] } as any,
      reviewService: { getReview: async () => undefined, saveReview: vi.fn() } as any,
      dashboardService: { getSnapshot: async () => emptySnapshot as any } as any,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const reviewRoot = root.querySelector<HTMLElement>('[data-component="interview-review"]')!;
    expect(reviewRoot.querySelector('[data-review-status]')?.textContent).toBe("请选择面试");
    (root.querySelector('.dashboard [data-action="open-review"]') as HTMLButtonElement).click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(reviewRoot.querySelector('[data-review-status]')?.textContent).not.toBe("请选择面试");
  });

  it("executes ICS export and persists all review fields for the selected interview", async () => {
    document.body.innerHTML = '<div id="app"></div>';
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const exportInterviewICS = vi.fn(async () => "BEGIN:VCALENDAR\r\nSUMMARY:Tech\r\nEND:VCALENDAR\r\n");
    const saveReview = vi.fn(async (interviewId: string, input: any) => ({ ...input, interviewId, id: "review-1", createdAt: "2026-09-02T00:00:00.000Z", updatedAt: "2026-09-02T00:00:00.000Z" }));
    const root = createApp(document, {
      applicationService: { listApplications: async () => [{ id: "a-1", company: "Acme", position: "Engineer", jobType: "tech" }] as any } as any,
      interviewService: { listInterviews: async () => [{ id: "i-1", applicationId: "a-1", round: 1, title: "Tech", startsAt: "2026-09-02T01:00:00.000Z", timezone: "UTC", status: "scheduled", reminders: [], type: "video", locationOrLink: "Room 1", interviewer: "A", note: "" }] } as any,
      reviewService: { getReview: async () => undefined, saveReview } as any,
      exportInterviewICS,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    (root.querySelector('[data-action="export-ics"]') as HTMLButtonElement).click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(exportInterviewICS).toHaveBeenCalledWith("i-1");

    (root.querySelector('[data-action="review"]') as HTMLButtonElement).click();
    const reviewRoot = root.querySelector<HTMLElement>('[data-component="interview-review"]')!;
    (reviewRoot.querySelector('[data-review-field="overallRating"]') as HTMLInputElement).value = "5";
    (reviewRoot.querySelector('[data-action="add-question"]') as HTMLButtonElement).click();
    const questionRow = reviewRoot.querySelector<HTMLElement>("[data-question-row]")!;
    (questionRow.querySelector('[data-question-field="question"]') as HTMLInputElement).value = "系统设计";
    (questionRow.querySelector('[data-question-field="answer"]') as HTMLTextAreaElement).value = "给出分层方案";
    (questionRow.querySelector('[data-question-field="note"]') as HTMLInputElement).value = "回答清晰";
    for (const [name, value] of Object.entries({ goodAnswers: "优势", weakAnswers: "不足", observedSignals: "积极", salaryDiscussion: "已讨论", nextStep: "等待通知", privateNote: "私密" })) {
      (reviewRoot.querySelector(`[data-review-field="${name}"]`) as HTMLTextAreaElement).value = value;
    }
    reviewRoot.querySelector<HTMLFormElement>('form[data-form="review"]')!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(saveReview).toHaveBeenCalledWith("i-1", expect.objectContaining({ overallRating: 5, questions: [{ question: "系统设计", answer: "给出分层方案", note: "回答清晰" }], privateNote: "私密" }));
    expect(reviewRoot.querySelector('[data-review-status]')?.textContent).toContain("已复盘");
  });

  it("loads reminder settings when editing an existing interview", async () => {
    document.body.innerHTML = '<div id="app"></div>';
    const root = createApp(document, {
      applicationService: { listApplications: async () => [{ id: "a-1", company: "Acme", position: "Engineer", jobType: "tech" }] as any } as any,
      interviewService: { listInterviews: async () => [{ id: "i-1", applicationId: "a-1", round: 1, title: "Tech", startsAt: "2026-09-02T01:00:00.000Z", timezone: "UTC", status: "scheduled", reminders: [{ offsetMinutes: 45, channel: "browser" }], type: "video", locationOrLink: "", interviewer: "", note: "" }] } as any,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    (root.querySelector('[data-component="interview-calendar"] [data-action="edit"]') as HTMLButtonElement).click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const form = root.querySelector<HTMLFormElement>('form[data-form="interview"]')!;
    expect((form.elements.namedItem("reminderPreset") as HTMLSelectElement).value).toBe("custom");
    expect((form.elements.namedItem("customReminder") as HTMLInputElement).value).toBe("45");
    expect((form.elements.namedItem("browserReminder") as HTMLInputElement).checked).toBe(true);
    expect((form.elements.namedItem("inAppReminder") as HTMLInputElement).checked).toBe(false);
  });

  it("anchors an existing interview into the day view when today has no interviews", async () => {
    document.body.innerHTML = '<div id="app"></div>';
    const root = createApp(document, {
      interviewService: {
        listInterviews: async () => [{ id: "i-1", applicationId: "a-1", round: 1, title: "Tech", startsAt: "2026-09-02T01:00:00.000Z", timezone: "UTC", status: "scheduled", reminders: [], type: "video", locationOrLink: "", interviewer: "", note: "" }],
      } as any,
      applicationService: { listApplications: async () => [{ id: "a-1", company: "Acme", position: "Engineer", jobType: "tech" }] as any } as any,
      now: () => new Date("2026-09-03T08:00:00.000Z"),
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(root.querySelectorAll(".interview-item")).toHaveLength(1);
    expect((root.querySelector<HTMLInputElement>("#calendar-anchor")!).value).toBe("2026-09-02");
  });
});
