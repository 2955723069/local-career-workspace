import { requestToPromise, runTransaction } from "../../db/database";
import { STORE_NAMES } from "../../db/schema";
import type {
  AnalysisResult,
  Application,
  Interview,
  InterviewReview,
  ReminderFailure,
  Resume,
  Stage,
} from "../../db/types";

export interface DashboardServiceOptions {
  now?: () => string;
  recentLimit?: number;
}

export interface DashboardInterviewItem {
  interview: Interview;
  application: Application;
}

export interface DashboardAction {
  type: "interview" | "deadline";
  at: string;
  interview?: Interview;
  application: Application;
}

export interface DashboardFollowUp {
  application: Application;
  stage?: Stage;
}

export interface DashboardStageCount {
  stageId: string;
  name: string;
  kind: Stage["kind"];
  color: string;
  count: number;
}

export interface DashboardAnalysisItem {
  result: AnalysisResult;
  application: Application;
  resume?: Resume;
}

export interface DashboardPendingReview extends DashboardInterviewItem {
  review?: InterviewReview;
}

export interface DashboardReminderFailure extends ReminderFailure {
  interview?: Interview;
  application?: Application;
}

export interface DashboardSnapshot {
  jobType?: Application["jobType"];
  generatedAt: string;
  todayInterviews: DashboardInterviewItem[];
  upcomingActions: DashboardAction[];
  pendingFollowUps: DashboardFollowUp[];
  stageCounts: DashboardStageCount[];
  recentResumes: Resume[];
  recentAnalysisResults: DashboardAnalysisItem[];
  pendingReviews: DashboardPendingReview[];
  reminderFailures: DashboardReminderFailure[];
  /** Short aliases used by dashboard consumers. */
  today: DashboardInterviewItem[];
  next7Days: DashboardAction[];
  next7DaysActions: DashboardAction[];
  followUps: DashboardFollowUp[];
  stages: DashboardStageCount[];
  recentMatches: DashboardAnalysisItem[];
  reviewsDue: DashboardPendingReview[];
  notificationFailures: DashboardReminderFailure[];
  stageCountsById: Record<string, number>;
}

function localDate(iso: string, timezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(iso));
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  } catch {
    return iso.slice(0, 10);
  }
}

function addDays(iso: string, days: number): string {
  return new Date(Date.parse(iso) + days * 86_400_000).toISOString();
}

export class DashboardService {
  readonly #database: IDBDatabase;
  readonly #now: () => string;
  readonly #recentLimit: number;

  constructor(database: IDBDatabase, options: DashboardServiceOptions = {}) {
    this.#database = database;
    this.#now = options.now ?? (() => new Date().toISOString());
    this.#recentLimit = options.recentLimit ?? 5;
  }

  async getSnapshot(jobType?: Application["jobType"]): Promise<DashboardSnapshot> {
    const generatedAt = this.#now();
    const data = await runTransaction(
      this.#database,
      [
        STORE_NAMES.applications,
        STORE_NAMES.interviews,
        STORE_NAMES.interviewReviews,
        STORE_NAMES.stages,
        STORE_NAMES.resumes,
        STORE_NAMES.analysisResults,
        STORE_NAMES.reminderFailures,
      ],
      "readonly",
      async (transaction) => {
        const read = <T>(store: string) => requestToPromise<T[]>(transaction.objectStore(store).getAll());
        const [applications, interviews, reviews, stages, resumes, analysisResults, reminderFailures] = await Promise.all([
          read<Application>(STORE_NAMES.applications),
          read<Interview>(STORE_NAMES.interviews),
          read<InterviewReview>(STORE_NAMES.interviewReviews),
          read<Stage>(STORE_NAMES.stages),
          read<Resume>(STORE_NAMES.resumes),
          read<AnalysisResult>(STORE_NAMES.analysisResults),
          read<ReminderFailure>(STORE_NAMES.reminderFailures),
        ]);
        return { applications, interviews, reviews, stages, resumes, analysisResults, reminderFailures };
      },
    );

    const applications = data.applications.filter((application) => !application.archivedAt && (!jobType || application.jobType === jobType));
    const applicationIds = new Set(applications.map((application) => application.id));
    const applicationById = new Map(applications.map((application) => [application.id, application]));
    const stageById = new Map(data.stages.map((stage) => [stage.id, stage]));
    const interviewItems = data.interviews
      .filter((interview) => applicationIds.has(interview.applicationId))
      .map((interview) => ({ interview, application: applicationById.get(interview.applicationId)! }));
    const todayInterviews = interviewItems
      .filter(({ interview }) => ["scheduled", "rescheduled"].includes(interview.status) && localDate(interview.startsAt, interview.timezone) === localDate(generatedAt, interview.timezone))
      .sort((a, b) => Date.parse(a.interview.startsAt) - Date.parse(b.interview.startsAt));

    const endOfWindow = Date.parse(addDays(generatedAt, 7));
    const upcomingActions: DashboardAction[] = [];
    for (const item of interviewItems) {
      const at = Date.parse(item.interview.startsAt);
      if (["scheduled", "rescheduled"].includes(item.interview.status) && at >= Date.parse(generatedAt) && at <= endOfWindow) {
        upcomingActions.push({ type: "interview", at: item.interview.startsAt, interview: item.interview, application: item.application });
      }
    }
    for (const application of applications) {
      if (!application.deadline) continue;
      const at = Date.parse(application.deadline);
      if (at >= Date.parse(generatedAt) && at <= endOfWindow) upcomingActions.push({ type: "deadline", at: application.deadline, application });
    }
    upcomingActions.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

    const pendingFollowUps = applications
      .filter((application) => stageById.get(application.stageId)?.kind === "normal" && !application.archivedAt)
      .map((application) => ({ application, stage: stageById.get(application.stageId) }))
      .sort((a, b) => (b.application.priority - a.application.priority) || (Date.parse(a.application.updatedAt) - Date.parse(b.application.updatedAt)));

    const stageCounts = data.stages
      .map((stage) => ({ stageId: stage.id, name: stage.name, kind: stage.kind, color: stage.color, count: applications.filter((application) => application.stageId === stage.id).length }))
      .sort((a, b) => (stageById.get(a.stageId)?.order ?? 0) - (stageById.get(b.stageId)?.order ?? 0));

    const resumeIds = jobType
      ? new Set([
          ...applications.map((application) => application.currentResumeId).filter((id): id is string => Boolean(id)),
          ...data.analysisResults.filter((result) => applicationIds.has(result.applicationId)).map((result) => result.resumeId),
        ])
      : undefined;
    const recentResumes = [...data.resumes]
      .filter((resume) => resume.status !== "deleted" && (!resumeIds || resumeIds.has(resume.id)))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, this.#recentLimit);
    const recentAnalysisResults = data.analysisResults
      .filter((result) => applicationIds.has(result.applicationId))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, this.#recentLimit)
      .map((result) => ({ result, application: applicationById.get(result.applicationId)!, resume: data.resumes.find((resume) => resume.id === result.resumeId) }));

    const reviewByInterviewId = new Map(data.reviews.map((review) => [review.interviewId, review]));
    const pendingReviews = interviewItems
      .filter(({ interview }) => interview.status === "completed" && !reviewByInterviewId.has(interview.id))
      .map((item) => ({ ...item }));
    const reminderFailures = data.reminderFailures
      .filter((failure) => {
        const interview = data.interviews.find((item) => item.id === failure.interviewId);
        return Boolean(interview && applicationIds.has(interview.applicationId));
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((failure) => {
        const interview = data.interviews.find((item) => item.id === failure.interviewId);
        return { ...failure, interview, application: interview ? applicationById.get(interview.applicationId) : undefined };
      });

    return {
      jobType,
      generatedAt,
      todayInterviews,
      upcomingActions,
      pendingFollowUps,
      stageCounts,
      recentResumes,
      recentAnalysisResults,
      pendingReviews,
      reminderFailures,
      today: todayInterviews,
      next7Days: upcomingActions,
      next7DaysActions: upcomingActions,
      followUps: pendingFollowUps,
      stages: stageCounts,
      recentMatches: recentAnalysisResults,
      reviewsDue: pendingReviews,
      notificationFailures: reminderFailures,
      stageCountsById: Object.fromEntries(stageCounts.map((item) => [item.stageId, item.count])),
    };
  }

  aggregate(jobType?: Application["jobType"]): Promise<DashboardSnapshot> {
    return this.getSnapshot(jobType);
  }

  getDashboard(jobType?: Application["jobType"]): Promise<DashboardSnapshot> {
    return this.getSnapshot(jobType);
  }

  getDashboardData(jobType?: Application["jobType"]): Promise<DashboardSnapshot> {
    return this.getSnapshot(jobType);
  }
}
