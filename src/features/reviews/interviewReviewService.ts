import { requestToPromise, runTransaction } from "../../db/database";
import { STORE_NAMES } from "../../db/schema";
import { assertAbsoluteIsoTimestamp, nextUpdatedTimestamp } from "../../db/timestamps";
import type { InterviewReview } from "../../db/types";

export type InterviewReviewInput = Omit<InterviewReview, "id" | "createdAt" | "updatedAt" | "interviewId">;

export class InterviewReviewService {
  readonly #database: IDBDatabase;
  readonly #now: () => string;
  readonly #createId: () => string;
  constructor(database: IDBDatabase, dependencies: { now?: () => string; createId?: () => string } = {}) {
    this.#database = database; this.#now = dependencies.now ?? (() => new Date().toISOString()); this.#createId = dependencies.createId ?? (() => crypto.randomUUID());
  }
  async saveReview(interviewId: string, input: InterviewReviewInput): Promise<InterviewReview> {
    if (input.overallRating !== undefined && (!Number.isFinite(input.overallRating) || input.overallRating < 0 || input.overallRating > 5)) throw new Error("Invalid InterviewReview.overallRating");
    const timestamp = this.#now(); assertAbsoluteIsoTimestamp(timestamp, "InterviewReview.createdAt");
    return runTransaction(this.#database, STORE_NAMES.interviewReviews, "readwrite", async tx => {
      const store = tx.objectStore(STORE_NAMES.interviewReviews);
      const existing = await requestToPromise<InterviewReview | undefined>(store.index("interviewId").get(interviewId));
      const review: InterviewReview = existing ? { ...existing, ...input, id: existing.id, interviewId, updatedAt: nextUpdatedTimestamp(timestamp, existing.updatedAt) } : { ...input, id: this.#createId(), interviewId, createdAt: timestamp, updatedAt: timestamp };
      await requestToPromise(store.put(review)); return review;
    });
  }
  save(interviewId: string, input: InterviewReviewInput): Promise<InterviewReview> { return this.saveReview(interviewId, input); }
  createOrUpdate(interviewId: string, input: InterviewReviewInput): Promise<InterviewReview> { return this.saveReview(interviewId, input); }
  getReview(interviewId: string): Promise<InterviewReview | undefined> { return runTransaction(this.#database, STORE_NAMES.interviewReviews, "readonly", tx => requestToPromise(tx.objectStore(STORE_NAMES.interviewReviews).index("interviewId").get(interviewId))); }
}
