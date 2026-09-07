import "./styles/index.css";

import { createApp } from "./app/createApp";
import { openCareerDatabase } from "./db/database";
import { ResumeIngestionService } from "./features/resumes/ingestion";
import { ResumeLibraryService } from "./features/resumes/resumeLibrary";
import { ApplicationService } from "./features/applications/applicationService";
import { StageService } from "./features/stages/stageService";
import { JobDescriptionService } from "./features/job-descriptions/jobDescriptionService";
import { InterviewService } from "./features/interviews/interviewService";
import { InterviewReviewService } from "./features/reviews/interviewReviewService";
import { exportInterviewICS } from "./calendar/ics";
import { NotificationService } from "./calendar/notifications";
import { MatchingService } from "./features/matching/matchingService";
import { getAiSettings } from "./settings/secrets";
import { createOpenAiClient } from "./ai/client";
import { AiAdvisorService } from "./features/ai/aiAdvisorService";
import { DashboardService } from "./features/dashboard/dashboardService";
import { BackupService } from "./features/backup/backupService";

createApp(document);

void openCareerDatabase()
  .then((database) => {
    return getAiSettings(database).then((aiSettings) => {
      const notificationService = new NotificationService(database);
      const interviewService = new InterviewService(database);
      void interviewService.listInterviews().then((interviews) => notificationService.restoreScheduled(interviews));
      createApp(document, {
        resumeIngestion: new ResumeIngestionService(database),
        resumeLibrary: new ResumeLibraryService(database),
        applicationService: new ApplicationService(database),
        stageService: new StageService(database),
        jobDescriptionService: new JobDescriptionService(database),
        matchingService: new MatchingService(database),
        interviewService,
        reviewService: new InterviewReviewService(database),
        notificationService,
        exportInterviewICS: (interviewId: string) => exportInterviewICS(database, interviewId),
        aiAdvisorService: aiSettings ? new AiAdvisorService(database, { settings: aiSettings, client: createOpenAiClient(aiSettings) }) : undefined,
        dashboardService: new DashboardService(database),
        backupService: new BackupService(database),
        database,
      });
    });
  })
  .catch(() => {
    const status = document.querySelector<HTMLElement>(".resume-library-status");
    if (status) status.textContent = "本地简历库暂时无法打开，请刷新后重试";
  });
