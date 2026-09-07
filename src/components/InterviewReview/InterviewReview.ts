import type { InterviewReview, ReviewQuestion } from "../../db/types";

type ReviewInput = Omit<InterviewReview, "id" | "createdAt" | "updatedAt" | "interviewId">;
export interface InterviewReviewOptions {
  interviewId?: string;
  reviewService?: { getReview(id: string): Promise<InterviewReview | undefined>; saveReview(id: string, input: ReviewInput): Promise<InterviewReview> };
}

const esc = (value: unknown): string => String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);

export function createInterviewReview(documentRef: Document, options: InterviewReviewOptions = {}): HTMLElement {
  const root = documentRef.createElement("section"); root.className = "interview-review"; root.dataset.component = "interview-review"; root.setAttribute("aria-labelledby", "interview-review-title");
  root.innerHTML = `<div class="section-heading"><div><p class="section-label">记录</p><h2 id="interview-review-title">面试复盘</h2></div><span data-review-status role="status" aria-live="polite" aria-atomic="true">请选择面试</span></div><form data-form="review" aria-labelledby="interview-review-title"><label for="review-rating">评分（0 至 5）<input id="review-rating" data-review-field="overallRating" type="number" min="0" max="5" step="1" /></label><fieldset class="interview-review__questions"><legend>面试问题记录</legend><div class="interview-review__question-list" data-question-list></div><button type="button" data-action="add-question">添加问题</button></fieldset><label for="review-good-answers">优势回答<textarea id="review-good-answers" data-review-field="goodAnswers"></textarea></label><label for="review-weak-answers">薄弱回答<textarea id="review-weak-answers" data-review-field="weakAnswers"></textarea></label><label for="review-observed-signals">观察信号<textarea id="review-observed-signals" data-review-field="observedSignals"></textarea></label><label for="review-salary">薪资讨论<textarea id="review-salary" data-review-field="salaryDiscussion"></textarea></label><label for="review-next-step">下一步<textarea id="review-next-step" data-review-field="nextStep"></textarea></label><label for="review-private-note">私密备注<textarea id="review-private-note" data-review-field="privateNote"></textarea></label><div class="interview-review__actions"><button type="submit">保存复盘</button><button type="button" data-action="cancel-review">取消编辑</button></div></form>`;
  const form = root.querySelector<HTMLFormElement>("form")!; const status = root.querySelector<HTMLElement>("[data-review-status]")!; const questionList = root.querySelector<HTMLElement>("[data-question-list]")!; let interviewId = options.interviewId; let lastSaved: InterviewReview | undefined;
  const field = (name: string) => root.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[data-review-field="${name}"]`)!;
  // 每个问题一组（问题 + 回答 + 备注），彻底避免此前三个文本框按行号对齐导致的错位。
  const addQuestionRow = (question = "", answer = "", note = "") => {
    const row = documentRef.createElement("div"); row.className = "interview-review__question"; row.dataset.questionRow = "";
    row.innerHTML = `<label>问题<input data-question-field="question" value="${esc(question)}" /></label><label>回答<textarea data-question-field="answer" rows="2">${esc(answer)}</textarea></label><label>备注<input data-question-field="note" value="${esc(note)}" /></label><button type="button" data-action="remove-question" aria-label="删除该问题">删除</button>`;
    questionList.append(row);
  };
  const readQuestions = (): ReviewQuestion[] => [...questionList.querySelectorAll<HTMLElement>("[data-question-row]")].map((row) => {
    const question = row.querySelector<HTMLInputElement>('[data-question-field="question"]')!.value.trim();
    const answer = row.querySelector<HTMLTextAreaElement>('[data-question-field="answer"]')!.value.trim();
    const note = row.querySelector<HTMLInputElement>('[data-question-field="note"]')!.value.trim();
    return { question, answer, note };
  }).filter((item) => item.question).map((item) => ({ question: item.question, ...(item.answer ? { answer: item.answer } : {}), ...(item.note ? { note: item.note } : {}) }));
  const clear = () => { form.reset(); questionList.replaceChildren(); lastSaved = undefined; status.textContent = interviewId ? "待复盘" : "请选择面试"; };
  const apply = (review: InterviewReview) => { lastSaved = review; field("overallRating").value = review.overallRating === undefined ? "" : String(review.overallRating); questionList.replaceChildren(); for (const item of review.questions) addQuestionRow(item.question, item.answer ?? "", item.note ?? ""); for (const name of ["goodAnswers", "weakAnswers", "observedSignals", "salaryDiscussion", "nextStep", "privateNote"] as const) field(name).value = review[name]; status.textContent = "已复盘"; };
  const load = async () => { clear(); if (!interviewId || !options.reviewService) return; try { const review = await options.reviewService.getReview(interviewId); if (review) apply(review); } catch { status.textContent = "复盘读取失败，私密资料未改变；可重试"; } };
  root.addEventListener("interview-selected", (event) => { interviewId = (event as CustomEvent<string>).detail; void load(); });
  root.querySelector('[data-action="add-question"]')?.addEventListener("click", () => { addQuestionRow(); questionList.querySelector<HTMLInputElement>("[data-question-row]:last-child [data-question-field='question']")?.focus(); });
  questionList.addEventListener("click", (event) => { const remove = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-action="remove-question"]'); if (remove) remove.closest("[data-question-row]")?.remove(); });
  form.addEventListener("submit", async (event) => { event.preventDefault(); if (!interviewId || !options.reviewService) { status.textContent = "请先从日历选择一场面试"; return; } status.textContent = "正在保存复盘..."; try { const questionItems = readQuestions(); const saved = await options.reviewService.saveReview(interviewId, { overallRating: field("overallRating").value ? Number(field("overallRating").value) : undefined, questions: questionItems, goodAnswers: field("goodAnswers").value, weakAnswers: field("weakAnswers").value, observedSignals: field("observedSignals").value, salaryDiscussion: field("salaryDiscussion").value, nextStep: field("nextStep").value, privateNote: field("privateNote").value }); apply(saved); status.textContent = "复盘已保存 · 已复盘"; root.dispatchEvent(new CustomEvent("review-saved", { detail: saved, bubbles: true })); } catch { status.textContent = "复盘保存失败，私密资料未改变；可重试"; } });
  root.querySelector('[data-action="cancel-review"]')?.addEventListener("click", () => { if (lastSaved) apply(lastSaved); else clear(); status.textContent = lastSaved ? "已取消编辑，已保存数据未改变" : "已取消编辑，仍待复盘"; });
  void load(); return root;
}
