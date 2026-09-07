import { requestToPromise, runTransaction } from "../../db/database";
import { STORE_NAMES } from "../../db/schema";
import { assertAbsoluteIsoTimestamp, nextUpdatedTimestamp } from "../../db/timestamps";
import type { AiConversation, AiMessage } from "../../db/types";
import { buildAiContext, type AiContextInput } from "../../ai/prompts";
import type { AiChatMessage } from "../../ai/client";

export interface AiCompletionClient {
  complete(messages: readonly AiChatMessage[]): Promise<string>;
}

export interface AiConversationServiceDependencies {
  client: AiCompletionClient;
  now?: () => string;
  createId?: () => string;
}

function defaultNow(): string { return new Date().toISOString(); }
function defaultCreateId(): string { return crypto.randomUUID(); }

function validateMessage(message: Pick<AiMessage, "role" | "content">): void {
  if (!["system", "user", "assistant"].includes(message.role)) throw new Error("Invalid AI message role");
  if (typeof message.content !== "string" || !message.content.trim()) throw new Error("AI message content is required");
}

export class AiConversationService {
  readonly #database: IDBDatabase;
  readonly #client: AiCompletionClient;
  readonly #now: () => string;
  readonly #createId: () => string;

  constructor(database: IDBDatabase, dependencies: AiConversationServiceDependencies) {
    this.#database = database;
    this.#client = dependencies.client;
    this.#now = dependencies.now ?? defaultNow;
    this.#createId = dependencies.createId ?? defaultCreateId;
  }

  async getConversation(applicationId: string): Promise<AiConversation | undefined> {
    return runTransaction(this.#database, STORE_NAMES.aiConversations, "readonly", async (tx) => {
      const records = await requestToPromise<AiConversation[]>(
        tx.objectStore(STORE_NAMES.aiConversations).index("applicationId").getAll(applicationId),
      );
      return records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    });
  }

  async appendMessage(applicationId: string, message: Pick<AiMessage, "role" | "content">): Promise<AiConversation> {
    validateMessage(message);
    return runTransaction(this.#database, STORE_NAMES.aiConversations, "readwrite", async (tx) => {
      const store = tx.objectStore(STORE_NAMES.aiConversations);
      const existing = (await requestToPromise<AiConversation[]>(store.index("applicationId").getAll(applicationId)))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
      const timestamp = this.#now();
      assertAbsoluteIsoTimestamp(timestamp, "AiConversation.createdAt");
      const createdMessage: AiMessage = { id: this.#createId(), role: message.role, content: message.content, createdAt: timestamp };
      const conversation: AiConversation = existing
        ? { ...existing, messages: [...existing.messages, createdMessage], updatedAt: nextUpdatedTimestamp(timestamp, existing.updatedAt) }
        : { id: this.#createId(), applicationId, messages: [createdMessage], createdAt: timestamp, updatedAt: timestamp };
      await requestToPromise(store.put(conversation));
      return conversation;
    });
  }

  /** Complete remotely first; only a successful response is persisted locally. */
  async sendMessage(applicationId: string, contentOrMessage: string | Pick<AiMessage, "role" | "content">, context: AiContextInput): Promise<AiConversation> {
    const content = typeof contentOrMessage === "string" ? contentOrMessage : contentOrMessage.content;
    if (typeof contentOrMessage !== "string" && contentOrMessage.role !== "user") {
      throw new Error("AI send message must have user role");
    }
    validateMessage({ role: "user", content });
    const aiContext = buildAiContext(context);
    const existing = await this.getConversation(applicationId);
    const messages: AiChatMessage[] = [
      { role: "system", content: aiContext.system },
      { role: "user", content: aiContext.user },
      ...(existing?.messages ?? []).map(({ role, content: messageContent }) => ({ role, content: messageContent })),
      { role: "user", content },
    ];
    const assistantContent = await this.#client.complete(messages);
    validateMessage({ role: "assistant", content: assistantContent });

    return runTransaction(this.#database, STORE_NAMES.aiConversations, "readwrite", async (tx) => {
      const store = tx.objectStore(STORE_NAMES.aiConversations);
      const latest = (await requestToPromise<AiConversation[]>(store.index("applicationId").getAll(applicationId)))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
      const timestamp = this.#now();
      assertAbsoluteIsoTimestamp(timestamp, "AiConversation.updatedAt");
      const userMessage: AiMessage = { id: this.#createId(), role: "user", content, createdAt: timestamp };
      const assistantMessage: AiMessage = { id: this.#createId(), role: "assistant", content: assistantContent, createdAt: timestamp };
      const conversation: AiConversation = latest
        ? { ...latest, messages: [...latest.messages, userMessage, assistantMessage], updatedAt: nextUpdatedTimestamp(timestamp, latest.updatedAt) }
        : { id: this.#createId(), applicationId, messages: [userMessage, assistantMessage], createdAt: timestamp, updatedAt: timestamp };
      await requestToPromise(store.put(conversation));
      return conversation;
    });
  }

  get(applicationId: string): Promise<AiConversation | undefined> { return this.getConversation(applicationId); }
  refresh(applicationId: string): Promise<AiConversation | undefined> { return this.getConversation(applicationId); }
  append(applicationId: string, message: Pick<AiMessage, "role" | "content">): Promise<AiConversation> { return this.appendMessage(applicationId, message); }
  send(applicationId: string, content: string | Pick<AiMessage, "role" | "content">, context: AiContextInput): Promise<AiConversation> { return this.sendMessage(applicationId, content, context); }
}
