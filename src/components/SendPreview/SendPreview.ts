import type { AiSendPreview } from "../../features/ai/aiAdvisorService";

export interface SendPreviewOptions {
  onConfirm: (preview: AiSendPreview) => Promise<void> | void;
  onCancel?: () => void;
}

export function createSendPreview(documentRef: Document, options: SendPreviewOptions): SendPreviewElement {
  const root = documentRef.createElement("div");
  root.className = "send-preview";
  root.hidden = true;
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-labelledby", "send-preview-title");
  root.setAttribute("aria-describedby", "send-preview-warning");
  root.innerHTML = `<div class="send-preview__panel"><h3 id="send-preview-title">发送前确认</h3><dl data-preview-meta></dl><p id="send-preview-warning" class="send-preview__warning">确认后才会向目标 API 发送请求；取消不会产生网络请求。AI 只能提出建议，不得虚构经历、技能、学历、成果或数字。</p><p class="send-preview__status" role="status" aria-live="polite"></p><div class="send-preview__actions"><button type="button" data-action="confirm-send">确认发送</button><button type="button" data-action="cancel-send">取消</button></div></div>`;
  let current: AiSendPreview | undefined;
  let returnFocus: HTMLElement | undefined;
  const meta = root.querySelector<HTMLElement>("[data-preview-meta]")!;
  const status = root.querySelector<HTMLElement>(".send-preview__status")!;
  const open = (preview: AiSendPreview) => {
    returnFocus = documentRef.activeElement instanceof HTMLElement ? documentRef.activeElement : undefined;
    current = preview;
    meta.innerHTML = `<div><dt>简历版本</dt><dd>${escapeHtml(preview.resumeVersion)}</dd></div><div><dt>简历文本长度</dt><dd>${preview.resumeTextLength}</dd></div><div><dt>JD 长度</dt><dd>${preview.jdLength}</dd></div><div><dt>消息数</dt><dd>${preview.messageCount}</dd></div><div><dt>目标 API 地址</dt><dd>${escapeHtml(safeApiUrl(preview.apiUrl))}</dd></div>`;
    status.textContent = "尚未发送";
    status.setAttribute("aria-busy", "false");
    root.hidden = false;
    root.querySelector<HTMLButtonElement>('[data-action="confirm-send"]')?.focus();
  };
  const close = () => {
    root.hidden = true;
    current = undefined;
    if (returnFocus?.isConnected) returnFocus.focus();
    returnFocus = undefined;
  };
  root.addEventListener("click", async (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-action]");
    if (!target) return;
    if (target.dataset.action === "cancel-send") { close(); options.onCancel?.(); return; }
    if (target.dataset.action === "confirm-send" && current) {
      const preview = current;
      const button = target as HTMLButtonElement;
      button.disabled = true; status.textContent = "正在发送..."; status.setAttribute("aria-busy", "true");
      try { await options.onConfirm(preview); close(); } catch (error) { status.textContent = sendErrorMessage(error); status.setAttribute("aria-busy", "false"); }
      button.disabled = false;
    }
  });
  root.addEventListener("keydown", (event) => {
    if (event.key === "Tab" && !root.hidden) {
      const focusable = Array.from(root.querySelectorAll<HTMLElement>("button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])"));
      if (focusable.length) {
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && documentRef.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && documentRef.activeElement === last) { event.preventDefault(); first.focus(); }
      }
      return;
    }
    if (event.key === "Escape" && !root.hidden) {
      close();
      options.onCancel?.();
    }
  });
  const element = root as unknown as SendPreviewElement;
  element.open = open;
  element.close = close;
  return element;
}

function escapeHtml(value: unknown): string { return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char] ?? char)); }
function sendErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (/timed out/i.test(message)) return "发送超时，可能是网络不通或 API 地址有误；资料未改变，可检查后重试。";
  return "发送失败，资料未改变；可重试";
}
function safeApiUrl(value: string): string {
  try {
    const url = new URL(value);
    // Keep only the origin: paths can also contain bearer-like tokens.
    return url.origin;
  } catch {
    return "已配置的 API 地址";
  }
}

export type SendPreviewElement = HTMLElement & { open(preview: AiSendPreview): void; close(): void };
