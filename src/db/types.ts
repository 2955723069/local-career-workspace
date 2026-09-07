export interface BaseRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export const RESUME_STATUSES = [
  "ready",
  "extraction-failed",
  "needs-review",
  "deleted",
] as const;
export type ResumeStatus = (typeof RESUME_STATUSES)[number];

export const INTERVIEW_STATUSES = [
  "scheduled",
  "completed",
  "cancelled",
  "rescheduled",
] as const;
export type InterviewStatus = (typeof INTERVIEW_STATUSES)[number];

export const STAGE_KINDS = [
  "normal",
  "offer",
  "rejected",
  "withdrawn",
] as const;
export type StageKind = (typeof STAGE_KINDS)[number];

export interface Resume extends BaseRecord {
  name: string;
  type: "pdf" | "docx";
  fileName: string;
  fileSize: number;
  fileHash: string;
  uploadedAt: string;
  tags: string[];
  note: string;
  status: ResumeStatus;
  textSource?: "extracted" | "manual";
  textConfirmedAt?: string;
  originalFileId?: string;
  isDefault?: boolean;
}

export type ResumeTextKind = "extracted" | "confirmed" | "manual";

export interface ResumeText extends BaseRecord {
  resumeId: string;
  kind: ResumeTextKind;
  text: string;
  confirmedAt?: string;
}

export interface JobDescription extends BaseRecord {
  applicationId: string;
  fileName?: string;
  fileType?: "pdf" | "docx";
  fileSize?: number;
  fileHash?: string;
  textSource: "pasted" | "extracted" | "manual";
  textConfirmedAt?: string;
  originalFileId?: string;
}

export type JobDescriptionTextKind =
  | "pasted"
  | "extracted"
  | "confirmed"
  | "manual";

export interface JobDescriptionText extends BaseRecord {
  jobDescriptionId: string;
  kind: JobDescriptionTextKind;
  text: string;
  confirmedAt?: string;
}

export interface Application extends BaseRecord {
  company: string;
  position: string;
  jobType: "graduate" | "internship" | "tech" | "general" | "other";
  location: string;
  workMode: "onsite" | "remote" | "hybrid" | "unknown";
  salaryText: string;
  source: string;
  jobUrl: string;
  jdText: string;
  jdFileId?: string;
  currentResumeId?: string;
  stageId: string;
  priority: number;
  deadline?: string;
  contact: string;
  note: string;
  archivedAt?: string;
}

export interface ResumeUsageHistory extends BaseRecord {
  applicationId: string;
  resumeId: string;
  resumeNameSnapshot: string;
  textSnapshot: string;
  usedAt: string;
}

export interface Stage extends BaseRecord {
  name: string;
  color: string;
  order: number;
  kind: StageKind;
}

export type TimelineEventType =
  | "stage-changed"
  | "resume-changed"
  | "note-added"
  | "archived"
  | "interview-rescheduled";

export interface ApplicationTimelineEvent extends BaseRecord {
  applicationId: string;
  type: TimelineEventType;
  fromValue?: string;
  toValue?: string;
  note: string;
}

export interface Reminder {
  offsetMinutes: number;
  channel: "in-app" | "browser";
}

export interface Interview extends BaseRecord {
  applicationId: string;
  round: number;
  type: "phone" | "video" | "onsite" | "assessment" | "other";
  title: string;
  startsAt: string;
  endsAt?: string;
  timezone: string;
  locationOrLink: string;
  interviewer: string;
  status: InterviewStatus;
  reminders: Reminder[];
  calendarExportedAt?: string;
  note: string;
}

export interface ReviewQuestion {
  question: string;
  answer?: string;
  note?: string;
}

export interface InterviewReview extends BaseRecord {
  interviewId: string;
  overallRating?: number;
  questions: ReviewQuestion[];
  goodAnswers: string;
  weakAnswers: string;
  observedSignals: string;
  salaryDiscussion: string;
  nextStep: string;
  privateNote: string;
}

export interface ReminderFailure extends BaseRecord {
  interviewId: string;
  reminderAt: string;
  reason: string;
}

export interface AnalysisCoverage {
  overall: number;
  required: number;
  preferred: number;
}

export interface AnalysisEvidence {
  keyword: string;
  excerpt: string;
}

export interface AnalysisResult extends BaseRecord {
  applicationId: string;
  resumeId: string;
  mode: "local" | "ai";
  coverage: AnalysisCoverage;
  matchedKeywords: string[];
  weakMatches: string[];
  missingKeywords: string[];
  evidence: AnalysisEvidence[];
  uncertainItems: string[];
  recommendations: string[];
}

export interface AiMessage {
  id: string;
  role: "system" | "user" | "assistant";
  content: string;
  createdAt: string;
}

export interface AiConversation extends BaseRecord {
  applicationId: string;
  messages: AiMessage[];
}

export interface StoredFile extends BaseRecord {
  ownerType: "resume" | "job-description";
  ownerId: string;
  fileName: string;
  fileType: "pdf" | "docx";
  blob: Blob;
}

export interface SensitiveSettingsRecord extends BaseRecord {
  id: "ai";
  apiUrl: string;
  model: string;
  apiKey: string;
  organizationId: string;
  customHeaders: Record<string, string>;
}

export interface DomainRecordMap {
  resumes: Resume;
  resumeTexts: ResumeText;
  jobDescriptions: JobDescription;
  jobDescriptionTexts: JobDescriptionText;
  applications: Application;
  resumeUsageHistory: ResumeUsageHistory;
  stages: Stage;
  applicationTimelineEvents: ApplicationTimelineEvent;
  interviews: Interview;
  interviewReviews: InterviewReview;
  analysisResults: AnalysisResult;
  aiConversations: AiConversation;
  reminderFailures: ReminderFailure;
  originalFiles: StoredFile;
}

export type DomainStoreName = keyof DomainRecordMap;
