import type { Application } from "../../db/types";
import { parseAiAdvisorResult, type AiAdvisorService, type AiAdvisorResult } from "../../features/ai/aiAdvisorService";
import { createSendPreview, type SendPreviewElement } from "../SendPreview/SendPreview";

export interface AiPageOptions {
  applicationService?: { listApplications(): Promise<Application[]> };
  aiAdvisorService?: Pick<AiAdvisorService, "createPreview" | "send" | "getConversation">;
  onOpenSettings?: () => void;
  signal?: AbortSignal;
}

const esc = (v: unknown) => String(v ?? "").replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c] ?? c));
const renderResult = (r: AiAdvisorResult) => `<article class="ai-result"><h5>匹配概览</h5><p>${esc(r.matchOverview || "暂无")}</p><h5>问题</h5><ul>${r.issues.map((v) => `<li>${esc(v)}</li>`).join("") || "<li>暂无</li>"}</ul><h5>建议</h5><ul>${r.suggestions.map((v) => `<li>${esc(v.replace(/^建议：/, ""))}</li>`).join("") || "<li>暂无</li>"}</ul><h5>原文/改写对照</h5><ul>${r.rewrites.map((item) => `<li><strong>原文：</strong>${esc(item.original)}<br><strong>改写：</strong>${esc(item.rewrite)}</li>`).join("") || "<li>暂无</li>"}</ul><h5>待补充信息</h5><ul>${r.missingInfo.map((v) => `<li>${esc(v)}</li>`).join("") || "<li>暂无</li>"}</ul><h5>风险提示</h5><ul>${r.risks.map((v) => `<li>${esc(v)}</li>`).join("") || "<li>暂无</li>"}</ul>${r.authenticityRisk ? `<p class="ai-authenticity-risk" role="alert">真实性风险：请核验所有内容，AI 不得虚构经历、技能、学历、成果或数字。</p>` : ""}</article>`;
/** 历史里 AI 回复以 JSON 字符串存储，尽量解析为结构化结果；解析失败时回退为纯文本。 */
const renderAssistantMessage = (content: string) => {
  try { return renderResult(parseAiAdvisorResult(content)); }
  catch { return `<p>${esc(content)}</p>`; }
};

export function createAiPage(documentRef: Document, options: AiPageOptions = {}): HTMLElement {
  const root = documentRef.createElement("section"); root.className = "ai-page"; root.setAttribute("aria-labelledby", "ai-page-title");
  root.innerHTML = `<div class="section-heading"><div><p class="section-label">顾问</p><h2 id="ai-page-title">AI 求职顾问</h2></div></div><div class="ai-page__controls"><label>职位<select data-ai-application><option value="">请选择职位</option></select></label><button type="button" data-action="open-settings" data-variant="secondary">配置 AI</button></div><form data-ai-page-form><label for="ai-page-prompt">AI 顾问问题<textarea id="ai-page-prompt" required rows="3"></textarea></label><button type="submit">预览并发送</button></form><p class="ai-page__status" role="status" aria-live="polite">请选择职位</p><div class="ai-page__conversation"></div>`;
  const select = root.querySelector<HTMLSelectElement>("[data-ai-application]")!; const form = root.querySelector<HTMLFormElement>("[data-ai-page-form]")!; const status = root.querySelector<HTMLElement>(".ai-page__status")!; const conversationHost = root.querySelector<HTMLElement>(".ai-page__conversation")!;
  let apps: Application[] = []; let service = options.aiAdvisorService; let preview: SendPreviewElement | undefined;
  const loadConversation = async () => { if (!service || !select.value) return; const c = await service.getConversation(select.value); conversationHost.innerHTML = (c?.messages ?? []).filter((m) => m.role !== "system").map((m) => `<article><strong>${m.role === "user" ? "我" : "AI"}</strong>${m.role === "user" ? `<p>${esc(m.content)}</p>` : renderAssistantMessage(m.content)}</article>`).join("") || "<p>暂无对话</p>"; };
  const mountPreview = () => {
    preview?.remove();
    preview = undefined;
    if (!service) return;
    preview = createSendPreview(documentRef, { onConfirm: async (p) => { const result = await service!.send(p.applicationId, p.prompt); conversationHost.insertAdjacentHTML("beforeend", renderResult(result.result)); status.textContent = "AI 建议已保存"; await loadConversation(); } });
    root.append(preview);
  };
  mountPreview();
  root.addEventListener("ai-service-changed", (event) => { service = (event as CustomEvent<typeof service>).detail; mountPreview(); status.textContent = service ? "AI 已配置，请选择职位" : "AI 尚未配置，请先配置 AI"; });
  void (async () => { apps = options.applicationService ? await options.applicationService.listApplications() : []; select.innerHTML = `<option value="">请选择职位</option>${apps.filter((a) => !a.archivedAt).map((a) => `<option value="${a.id}">${a.company} · ${a.position}</option>`).join("")}`; })();
  select.addEventListener("change", () => void loadConversation());
  root.addEventListener("ai-application-selected", (event) => {
    const id = (event as CustomEvent<string>).detail;
    if (id && apps.some((app) => app.id === id)) { select.value = id; void loadConversation(); }
  });
  root.querySelector('[data-action="open-settings"]')?.addEventListener("click", () => options.onOpenSettings?.());
  form.addEventListener("submit", async (event) => { event.preventDefault(); if (!service || !select.value) { status.textContent = service ? "请先选择职位" : "AI 尚未配置，请先配置 AI"; return; } try { status.textContent = "正在生成发送预览..."; preview?.open(await service.createPreview(select.value, new FormData(form).get("prompt") as string)); } catch { status.textContent = "无法生成预览，请检查 AI 配置和职位资料"; } });
  documentRef.defaultView?.addEventListener("app-data-cleared", () => { select.value = ""; conversationHost.innerHTML = ""; status.textContent = service ? "请选择职位" : "AI 尚未配置，请先配置 AI"; }, { signal: options.signal });
  return root;
}
