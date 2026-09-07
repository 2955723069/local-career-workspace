import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { openCareerDatabase } from "../../src/db/database";
import { InterviewReviewService } from "../../src/features/reviews/interviewReviewService";

describe("InterviewReviewService", () => {
  it("upserts a review without changing its stable id or interviewId", async () => {
    const db = await openCareerDatabase({ name: `review-${crypto.randomUUID()}` });
    const service = new InterviewReviewService(db);
    const first = await service.saveReview("interview-1", { overallRating: 3, questions: [], goodAnswers: "good", weakAnswers: "", observedSignals: "", salaryDiscussion: "", nextStep: "", privateNote: "secret" });
    const second = await service.saveReview("interview-1", { overallRating: 4, questions: [], goodAnswers: "better", weakAnswers: "", observedSignals: "", salaryDiscussion: "", nextStep: "", privateNote: "updated" });
    expect(second.id).toBe(first.id);
    expect(second.interviewId).toBe("interview-1");
    expect(second.overallRating).toBe(4);
    db.close();
  });
});
