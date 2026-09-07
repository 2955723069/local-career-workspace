import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { openCareerDatabase } from "../../src/db/database";
import { createRepositories } from "../../src/db/repositories";
import { DashboardService } from "../../src/features/dashboard/dashboardService";

const base = "2026-09-02T09:00:00.000Z";

describe("DashboardService", () => {
  it("aggregates dashboard sections and filters every section by jobType", async () => {
    const db = await openCareerDatabase({ name: `dashboard-${crypto.randomUUID()}` });
    const repos = createRepositories(db, { now: () => base });
    const stage = await repos.stages.create({ name: "面试中", color: "#d97706", order: 1, kind: "normal" });
    const otherStage = await repos.stages.create({ name: "收藏", color: "#64748b", order: 0, kind: "normal" });
    const graduate = await repos.applications.create({ company: "甲公司", position: "前端", jobType: "graduate", location: "", workMode: "unknown", salaryText: "", source: "", jobUrl: "", jdText: "", stageId: stage.id, priority: 1, contact: "", note: "", deadline: "2026-09-04T09:00:00.000Z" });
    const internship = await repos.applications.create({ company: "乙公司", position: "实习生", jobType: "internship", location: "", workMode: "unknown", salaryText: "", source: "", jobUrl: "", jdText: "", stageId: otherStage.id, priority: 0, contact: "", note: "" });
    const todayInterview = await repos.interviews.create({ applicationId: graduate.id, round: 1, type: "video", title: "技术面", startsAt: "2026-09-02T10:00:00.000Z", timezone: "Asia/Shanghai", locationOrLink: "https://meet", interviewer: "A", status: "scheduled", reminders: [], note: "" });
    await repos.interviews.create({ applicationId: internship.id, round: 1, type: "phone", title: "电话面", startsAt: "2026-09-03T10:00:00.000Z", timezone: "Asia/Shanghai", locationOrLink: "", interviewer: "B", status: "scheduled", reminders: [], note: "" });
    const completedInterview = await repos.interviews.create({ applicationId: graduate.id, round: 2, type: "onsite", title: "终面", startsAt: "2026-09-01T10:00:00.000Z", timezone: "Asia/Shanghai", locationOrLink: "", interviewer: "C", status: "completed", reminders: [], note: "" });
    await repos.reminderFailures.create({ interviewId: todayInterview.id, reminderAt: "2026-09-02T09:30:00.000Z", reason: "permission-denied" });
    const resume = await repos.resumes.create({ name: "版本 A", type: "pdf", fileName: "a.pdf", fileSize: 1, fileHash: "hash", uploadedAt: base, tags: [], note: "", status: "ready" });
    await repos.analysisResults.create({ applicationId: graduate.id, resumeId: resume.id, mode: "local", coverage: { overall: 0.5, required: 0.5, preferred: 0.5 }, matchedKeywords: ["ts"], weakMatches: [], missingKeywords: [], evidence: [], uncertainItems: [], recommendations: [] });

    const service = new DashboardService(db, { now: () => base });
    const all = await service.getSnapshot();
    expect(all.todayInterviews).toHaveLength(1);
    expect(all.upcomingActions.length).toBeGreaterThanOrEqual(2);
    expect(all.pendingFollowUps.map((item) => item.application.id)).toContain(graduate.id);
    expect(all.stageCounts.find((item) => item.stageId === stage.id)?.count).toBe(1);
    expect(all.recentResumes[0]?.id).toBe(resume.id);
    expect(all.recentAnalysisResults[0]?.application.id).toBe(graduate.id);
    expect(all.pendingReviews.map((item) => item.interview.id)).toContain(completedInterview.id);
    expect(all.reminderFailures[0]?.reason).toBe("permission-denied");

    const filtered = await service.getSnapshot("graduate");
    expect(filtered.todayInterviews.every((item) => item.application.jobType === "graduate")).toBe(true);
    expect(filtered.upcomingActions.every((item) => item.application.jobType === "graduate")).toBe(true);
    expect(filtered.pendingFollowUps.every((item) => item.application.jobType === "graduate")).toBe(true);
    expect(filtered.recentAnalysisResults.every((item) => item.application.jobType === "graduate")).toBe(true);
    expect(filtered.reminderFailures.every((item) => item.application?.jobType === "graduate")).toBe(true);
    db.close();
  });

  it("removes completed interviews from pending reviews after a review is saved", async () => {
    const db = await openCareerDatabase({ name: `dashboard-${crypto.randomUUID()}` });
    const repos = createRepositories(db, { now: () => base });
    const stage = await repos.stages.create({ name: "完成", color: "#000", order: 1, kind: "normal" });
    const app = await repos.applications.create({ company: "甲", position: "职", jobType: "tech", location: "", workMode: "unknown", salaryText: "", source: "", jobUrl: "", jdText: "", stageId: stage.id, priority: 0, contact: "", note: "" });
    const interview = await repos.interviews.create({ applicationId: app.id, round: 1, type: "video", title: "面试", startsAt: "2026-09-01T10:00:00.000Z", timezone: "UTC", locationOrLink: "", interviewer: "", status: "completed", reminders: [], note: "" });
    const service = new DashboardService(db, { now: () => base });
    expect((await service.getSnapshot()).pendingReviews).toHaveLength(1);
    await repos.interviewReviews.create({ interviewId: interview.id, questions: [], goodAnswers: "", weakAnswers: "", observedSignals: "", salaryDiscussion: "", nextStep: "", privateNote: "" });
    expect((await service.getSnapshot()).pendingReviews).toHaveLength(0);
    db.close();
  });
});
