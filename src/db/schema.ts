export const DATABASE_NAME = "local-career-workspace";
export const DATABASE_VERSION = 6;

export const STORE_NAMES = {
  resumes: "resumes",
  resumeTexts: "resumeTexts",
  jobDescriptions: "jobDescriptions",
  jobDescriptionTexts: "jobDescriptionTexts",
  applications: "applications",
  resumeUsageHistory: "resumeUsageHistory",
  stages: "stages",
  applicationTimelineEvents: "applicationTimelineEvents",
  interviews: "interviews",
  interviewReviews: "interviewReviews",
  analysisResults: "analysisResults",
  aiConversations: "aiConversations",
  reminderFailures: "reminderFailures",
  originalFiles: "originalFiles",
  sensitiveSettings: "sensitiveSettings",
} as const;

export type StoreName = (typeof STORE_NAMES)[keyof typeof STORE_NAMES];

interface IndexDefinition {
  name: string;
  keyPath: string | string[];
  unique?: boolean;
}

const INDEXES: Record<StoreName, readonly IndexDefinition[]> = {
  resumes: [
    { name: "status", keyPath: "status" },
    { name: "fileHash", keyPath: "fileHash" },
    { name: "updatedAt", keyPath: "updatedAt" },
  ],
  resumeTexts: [
    { name: "resumeId", keyPath: "resumeId" },
    { name: "resumeId_kind", keyPath: ["resumeId", "kind"], unique: true },
  ],
  jobDescriptions: [
    { name: "applicationId", keyPath: "applicationId" },
    { name: "fileHash", keyPath: "fileHash" },
  ],
  jobDescriptionTexts: [
    { name: "jobDescriptionId", keyPath: "jobDescriptionId" },
    {
      name: "jobDescriptionId_kind",
      keyPath: ["jobDescriptionId", "kind"],
      unique: true,
    },
  ],
  applications: [
    { name: "stageId", keyPath: "stageId" },
    { name: "currentResumeId", keyPath: "currentResumeId" },
    { name: "updatedAt", keyPath: "updatedAt" },
  ],
  resumeUsageHistory: [
    { name: "applicationId", keyPath: "applicationId" },
    { name: "resumeId", keyPath: "resumeId" },
  ],
  stages: [
    { name: "kind", keyPath: "kind" },
    { name: "order", keyPath: "order" },
  ],
  applicationTimelineEvents: [
    { name: "applicationId", keyPath: "applicationId" },
    { name: "createdAt", keyPath: "createdAt" },
  ],
  interviews: [
    { name: "applicationId", keyPath: "applicationId" },
    { name: "startsAt", keyPath: "startsAt" },
    { name: "status", keyPath: "status" },
  ],
  interviewReviews: [
    { name: "interviewId", keyPath: "interviewId", unique: true },
  ],
  analysisResults: [
    { name: "applicationId", keyPath: "applicationId" },
    { name: "resumeId", keyPath: "resumeId" },
    { name: "createdAt", keyPath: "createdAt" },
  ],
  aiConversations: [{ name: "applicationId", keyPath: "applicationId" }],
  reminderFailures: [
    { name: "interviewId", keyPath: "interviewId" },
    { name: "reminderAt", keyPath: "reminderAt" },
  ],
  originalFiles: [
    { name: "ownerId", keyPath: "ownerId" },
    {
      name: "ownerType_ownerId",
      keyPath: ["ownerType", "ownerId"],
      unique: true,
    },
  ],
  sensitiveSettings: [],
};

export function ensureSchema(
  database: IDBDatabase,
  transaction: IDBTransaction,
): void {
  for (const storeName of Object.values(STORE_NAMES)) {
    const store = database.objectStoreNames.contains(storeName)
      ? transaction.objectStore(storeName)
      : database.createObjectStore(storeName, { keyPath: "id" });

    for (const index of INDEXES[storeName]) {
      if (!store.indexNames.contains(index.name)) {
        store.createIndex(index.name, index.keyPath, {
          unique: index.unique ?? false,
        });
      }
    }
  }
}
