import type { AiSettings } from "../settings/types";
import { validateAiSettings } from "../settings/secrets";

export interface AiChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface OpenAiClientOptions {
  fetch?: typeof fetch;
  /** 单次请求超时（毫秒）。默认 60 秒；<=0 表示不设超时。 */
  timeoutMs?: number;
}

export const DEFAULT_AI_TIMEOUT_MS = 60_000;

export interface AiCompletionRequest {
  messages: readonly AiChatMessage[];
}

function endpoint(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${path}`;
}

function requestHeaders(settings: AiSettings): Record<string, string> {
  const headers: Record<string, string> = { ...settings.customHeaders };
  for (const name of Object.keys(headers)) {
    if (["authorization", "openai-organization", "content-type"].includes(name.toLowerCase())) {
      delete headers[name];
    }
  }
  headers.Authorization = `Bearer ${settings.apiKey}`;
  if (settings.organizationId.trim()) {
    headers["OpenAI-Organization"] = settings.organizationId;
  } else {
    delete headers["OpenAI-Organization"];
  }
  return headers;
}

function validateMessages(messages: readonly AiChatMessage[]): void {
  if (!Array.isArray(messages) || messages.length === 0) throw new Error("AI messages are required");
  for (const message of messages) {
    if (!["system", "user", "assistant"].includes(message.role) || typeof message.content !== "string" || !message.content.trim()) {
      throw new Error("Invalid AI message");
    }
  }
}

/** Small OpenAI-compatible transport. It deliberately has no logging side effects. */
export class OpenAiClient {
  readonly #settings: AiSettings;
  readonly #fetch: typeof fetch;
  readonly #timeoutMs: number;

  constructor(settings: AiSettings, fetchImpl?: typeof fetch | OpenAiClientOptions, options: OpenAiClientOptions = {}) {
    this.#settings = { ...settings, customHeaders: { ...settings.customHeaders } };
    const suppliedFetch = typeof fetchImpl === "function" ? fetchImpl : fetchImpl?.fetch;
    const suppliedOptions = typeof fetchImpl === "object" && fetchImpl ? fetchImpl : options;
    this.#fetch = suppliedFetch ?? options.fetch ?? globalThis.fetch.bind(globalThis);
    this.#timeoutMs = suppliedOptions.timeoutMs ?? options.timeoutMs ?? DEFAULT_AI_TIMEOUT_MS;
  }

  /** 发起一次带超时/中断的请求；超时会抛出可识别的“请求超时”错误。 */
  async #fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    if (this.#timeoutMs <= 0 || typeof AbortController === "undefined") {
      return this.#fetch(url, init);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.#timeoutMs);
    try {
      return await this.#fetch(url, { ...init, signal: controller.signal });
    } catch (error) {
      if (controller.signal.aborted) throw new Error("AI request timed out");
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async testConnection(): Promise<void> {
    validateAiSettings(this.#settings);
    const response = await this.#fetchWithTimeout(endpoint(this.#settings.apiUrl, "models"), {
      method: "GET",
      headers: requestHeaders(this.#settings),
      body: undefined,
    });
    if (!response.ok) throw new Error(`AI connection failed (${response.status})`);
  }

  async complete(messagesOrRequest: readonly AiChatMessage[] | AiCompletionRequest): Promise<string> {
    validateAiSettings(this.#settings);
    const messages = "messages" in messagesOrRequest ? messagesOrRequest.messages : messagesOrRequest;
    validateMessages(messages);
    const response = await this.#fetchWithTimeout(endpoint(this.#settings.apiUrl, "chat/completions"), {
      method: "POST",
      headers: (() => {
        const headers = requestHeaders(this.#settings);
        headers["Content-Type"] = "application/json";
        return headers;
      })(),
      body: JSON.stringify({ model: this.#settings.model, messages }),
    });
    if (!response.ok) throw new Error(`AI request failed (${response.status})`);
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new Error("AI response was not valid JSON");
    }
    const content = (payload as { choices?: Array<{ message?: { content?: unknown } }> })
      .choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("AI response did not contain message content");
    return content;
  }
}

export function createOpenAiClient(settings: AiSettings, fetchImpl?: typeof fetch): OpenAiClient {
  return new OpenAiClient(settings, fetchImpl);
}
