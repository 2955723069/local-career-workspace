import type { AnalysisResult, Application, Resume } from "../../db/types";

const esc = (value: unknown) => String(value ?? "").replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c] ?? c));

export interface MatchingPageOptions {
  applicationService?: { listApplications(): Promise<Application[]> };
  resumeLibrary?: { search(query?: string): Promise<Resume[]> };
  matchingService?: { run(applicationId: string, resumeId: string): Promise<AnalysisResult>; listHistory(applicationId: string, resumeId?: string): Promise<AnalysisResult[]>; get(id: string): Promise<AnalysisResult | undefined> };
  onOpenAi?: (applicationId: string) => void;
  signal?: AbortSignal;
}

export function renderAnalysisResult(result: AnalysisResult, resumeName = result.resumeId): string {
  return `<article class="matching-result"><p class="matching-result__meta">${esc(result.createdAt)} · ${esc(resumeName)}</p><dl class="matching-coverage"><div><dt>总体覆盖率</dt><dd>${result.coverage.overall}%</dd></div><div><dt>必需覆盖率</dt><dd>${result.coverage.required}%</dd></div><div><dt>加分覆盖率</dt><dd>${result.coverage.preferred}%</dd></div></dl><div class="matching-lists"><div><h5>明确匹配</h5><ul>${result.matchedKeywords.map((v) => `<li>${esc(v)}</li>`).join("") || "<li>暂无</li>"}</ul></div><div><h5>弱匹配</h5><ul>${result.weakMatches.map((v) => `<li>${esc(v)}</li>`).join("") || "<li>暂无</li>"}</ul></div><div><h5>缺失</h5><ul>${result.missingKeywords.map((v) => `<li>${esc(v)}</li>`).join("") || "<li>暂无</li>"}</ul></div></div><h5>证据片段</h5><ul class="matching-evidence">${result.evidence.map((e) => `<li><strong>${esc(e.keyword)}</strong>：${esc(e.excerpt)}</li>`).join("") || "<li>暂无证据</li>"}</ul><p class="matching-disclaimer">仅代表文本证据，不代表真实能力。</p></article>`;
}

export function createMatchingPage(documentRef: Document, options: MatchingPageOptions = {}): HTMLElement {
  const root = documentRef.createElement("section");
  root.className = "matching-page";
  root.setAttribute("aria-labelledby", "matching-page-title");
  root.innerHTML = `<div class="section-heading"><div><p class="section-label">分析</p><h2 id="matching-page-title">JD 匹配</h2></div></div><div class="matching-page__controls"><label>职位<select data-matching-application><option value="">请选择职位</option></select></label><label>简历<select data-matching-resume><option value="">请选择简历</option></select></label><button type="button" data-action="run-matching-page">运行匹配</button><button type="button" data-action="open-ai-page" data-variant="secondary">进入 AI 顾问</button></div><p class="matching-page__status" role="status" aria-live="polite">请选择职位和简历</p><div class="matching-page__history"></div><div class="matching-page__result"></div>`;
  const appSelect = root.querySelector<HTMLSelectElement>("[data-matching-application]")!;
  const resumeSelect = root.querySelector<HTMLSelectElement>("[data-matching-resume]")!;
  const status = root.querySelector<HTMLElement>(".matching-page__status")!;
  const resultHost = root.querySelector<HTMLElement>(".matching-page__result")!;
  const historyHost = root.querySelector<HTMLElement>(".matching-page__history")!;
  let applications: Application[] = [];
  let resumes: Resume[] = [];
  const load = async () => {
    try {
      applications = options.applicationService ? await options.applicationService.listApplications() : [];
      resumes = options.resumeLibrary ? await options.resumeLibrary.search("") : [];
      appSelect.innerHTML = `<option value="">请选择职位</option>${applications.filter((a) => !a.archivedAt).map((a) => `<option value="${esc(a.id)}">${esc(a.company)} · ${esc(a.position)}</option>`).join("")}`;
      resumeSelect.innerHTML = `<option value="">请选择简历</option>${resumes.filter((r) => r.status !== "deleted").map((r) => `<option value="${esc(r.id)}">${esc(r.name)}</option>`).join("")}`;
    } catch { status.textContent = "匹配页面读取失败，可重试"; }
  };
  const loadHistory = async () => {
    if (!options.matchingService || !appSelect.value) return;
    const rows = await options.matchingService.listHistory(appSelect.value, resumeSelect.value || undefined);
    historyHost.innerHTML = rows.map((r) => `<button type="button" data-action="open-analysis" data-analysis-id="${esc(r.id)}">${esc(r.createdAt)} · ${esc(resumes.find((x) => x.id === r.resumeId)?.name ?? r.resumeId)}</button>`).join("") || "<p>暂无匹配历史</p>";
    if (rows[0]) resultHost.innerHTML = renderAnalysisResult(rows[0], resumes.find((x) => x.id === rows[0].resumeId)?.name);
  };
  appSelect.addEventListener("change", () => void loadHistory());
  resumeSelect.addEventListener("change", () => void loadHistory());
  root.addEventListener("click", async (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-action]");
    if (!button) return;
    if (button.dataset.action === "open-ai-page" && appSelect.value) { options.onOpenAi?.(appSelect.value); return; }
    if (button.dataset.action === "open-analysis" && options.matchingService && button.dataset.analysisId) {
      const result = await options.matchingService.get(button.dataset.analysisId);
      if (result) resultHost.innerHTML = renderAnalysisResult(result, resumes.find((x) => x.id === result.resumeId)?.name);
      return;
    }
    if (button.dataset.action !== "run-matching-page") return;
    if (!options.matchingService || !appSelect.value || !resumeSelect.value) { status.textContent = "请先选择职位和简历"; return; }
    status.textContent = "正在本地匹配...";
    try { const result = await options.matchingService.run(appSelect.value, resumeSelect.value); resultHost.innerHTML = renderAnalysisResult(result, resumes.find((x) => x.id === result.resumeId)?.name); status.textContent = "匹配结果已保存"; await loadHistory(); }
    catch { status.textContent = "匹配失败，请确认职位 JD 和简历文本已确认"; }
  });
  void load();
  documentRef.defaultView?.addEventListener("app-data-cleared", () => { appSelect.value = ""; resumeSelect.value = ""; historyHost.innerHTML = "<p>暂无匹配历史</p>"; resultHost.innerHTML = ""; void load(); }, { signal: options.signal });
  return root;
}
