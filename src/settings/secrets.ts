import { requestToPromise, runTransaction } from "../db/database";
import { STORE_NAMES } from "../db/schema";
import type { SensitiveSettingsRecord } from "../db/types";
import type { AiSettings } from "./types";

const ID = "ai" as const;

/** Validate settings before they can reach IndexedDB or the network client. */
export function validateAiSettings(settings: AiSettings): void {
  if (
    typeof settings.apiUrl !== "string" ||
    typeof settings.model !== "string" ||
    typeof settings.apiKey !== "string" ||
    typeof settings.organizationId !== "string" ||
    typeof settings.customHeaders !== "object" ||
    settings.customHeaders === null
  ) {
    throw new Error("Invalid AI settings");
  }
  if (!settings.apiUrl.trim()) throw new Error("AI API URL is required");
  if (!settings.model.trim()) throw new Error("AI model is required");
  if (!settings.apiKey.trim()) throw new Error("AI API key is required");
  if (/[\r\n]/.test(settings.model) || /[\r\n]/.test(settings.apiKey) || /[\r\n]/.test(settings.organizationId)) {
    throw new Error("Invalid AI settings");
  }

  let parsed: URL;
  try {
    parsed = new URL(settings.apiUrl);
  } catch {
    throw new Error("Invalid AI API URL");
  }
  if (
    (parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    !parsed.hostname
  ) {
    throw new Error("Invalid AI API URL");
  }

  if (Array.isArray(settings.customHeaders)) {
    throw new Error("Invalid AI custom headers");
  }
  for (const [name, value] of Object.entries(settings.customHeaders)) {
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name) || /[\r\n]/.test(name)) {
      throw new Error("Invalid AI custom header name");
    }
    if (typeof value !== "string" || /[\r\n]/.test(value)) {
      throw new Error("Invalid AI custom header value");
    }
  }
}

function now(): string {
  return new Date().toISOString();
}

export async function getAiSettings(database: IDBDatabase): Promise<AiSettings | undefined> {
  const record = await runTransaction(database, STORE_NAMES.sensitiveSettings, "readonly", (tx) =>
    requestToPromise<SensitiveSettingsRecord | undefined>(tx.objectStore(STORE_NAMES.sensitiveSettings).get(ID)),
  );
  if (!record) return undefined;
  const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...settings } = record;
  return settings;
}

export async function saveAiSettings(database: IDBDatabase, settings: AiSettings): Promise<AiSettings> {
  validateAiSettings(settings);
  const existing = await runTransaction(database, STORE_NAMES.sensitiveSettings, "readonly", (tx) =>
    requestToPromise<SensitiveSettingsRecord | undefined>(tx.objectStore(STORE_NAMES.sensitiveSettings).get(ID)),
  );
  const timestamp = now();
  const record: SensitiveSettingsRecord = {
    ...settings,
    id: ID,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };
  await runTransaction(database, STORE_NAMES.sensitiveSettings, "readwrite", (tx) =>
    requestToPromise(tx.objectStore(STORE_NAMES.sensitiveSettings).put(record)),
  );
  return settings;
}

export async function clearAiSettings(database: IDBDatabase): Promise<void> {
  await runTransaction(database, STORE_NAMES.sensitiveSettings, "readwrite", (tx) =>
    requestToPromise(tx.objectStore(STORE_NAMES.sensitiveSettings).delete(ID)),
  );
}

export const getSensitiveAiSettings = getAiSettings;
export const saveSensitiveAiSettings = saveAiSettings;
export const clearSensitiveSettings = clearAiSettings;
export const loadAiSettings = getAiSettings;
export const updateAiSettings = saveAiSettings;
