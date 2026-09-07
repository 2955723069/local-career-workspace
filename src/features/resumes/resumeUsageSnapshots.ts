import type { ResumeUsageHistory } from "../../db/types";
import type { ResumeLibraryService } from "./resumeLibrary";

export function createResumeUsageSnapshot(
  library: ResumeLibraryService,
  input: { applicationId: string; resumeId: string },
): Promise<ResumeUsageHistory> {
  return library.createUsageSnapshot(input);
}
