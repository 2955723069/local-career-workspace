import type { Preferences } from "./types";

const PREFIX = "career.preferences.";
const KEYS = {
  defaultTimezone: `${PREFIX}defaultTimezone`,
  defaultReminders: `${PREFIX}defaultReminders`,
  uiPreferences: `${PREFIX}uiPreferences`,
  migrationMarkers: `${PREFIX}migrationMarkers`,
} as const;

const defaults: Preferences = {
  defaultTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  defaultReminders: [],
  uiPreferences: {},
  migrationMarkers: {},
};

function parse<T>(key: string, fallback: T): T {
  const value = localStorage.getItem(key);
  if (value === null) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function validateTimezone(value: string): void {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
  } catch {
    throw new Error("Invalid default timezone");
  }
}

function validatePreferences(value: Preferences): void {
  validateTimezone(value.defaultTimezone);
  if (value.defaultTimezone.length > 128) {
    throw new Error("Default timezone is too large");
  }
  if (!Array.isArray(value.defaultReminders) || value.defaultReminders.some((reminder) =>
    !Number.isFinite(reminder.offsetMinutes) ||
    (reminder.channel !== "in-app" && reminder.channel !== "browser")
  )) {
    throw new Error("Invalid default reminders");
  }
  if (Object.values(value.migrationMarkers).some((marker) => typeof marker !== "boolean")) {
    throw new Error("Invalid migration markers");
  }
  for (const preference of Object.values(value.uiPreferences)) {
    if (!["boolean", "string", "number"].includes(typeof preference)) {
      throw new Error("Invalid UI preferences");
    }
    if (typeof preference === "string" && preference.length > 256) {
      throw new Error("UI preference is too large");
    }
  }
  const serialized = JSON.stringify(value);
  if (serialized.includes("[object Blob]") || serialized.length > 16_384) {
    throw new Error("Preferences are too large");
  }
}

export function getPreferences(): Preferences {
  return {
    defaultTimezone: parse(KEYS.defaultTimezone, defaults.defaultTimezone),
    defaultReminders: parse(KEYS.defaultReminders, defaults.defaultReminders),
    uiPreferences: parse(KEYS.uiPreferences, defaults.uiPreferences),
    migrationMarkers: parse(KEYS.migrationMarkers, defaults.migrationMarkers),
  };
}

export function savePreferences(value: Partial<Preferences>): Preferences {
  const next = { ...getPreferences(), ...value };
  validatePreferences(next);
  localStorage.setItem(KEYS.defaultTimezone, JSON.stringify(next.defaultTimezone));
  localStorage.setItem(KEYS.defaultReminders, JSON.stringify(next.defaultReminders));
  localStorage.setItem(KEYS.uiPreferences, JSON.stringify(next.uiPreferences));
  localStorage.setItem(KEYS.migrationMarkers, JSON.stringify(next.migrationMarkers));
  return next;
}

export function updatePreferences(patch: Partial<Preferences>): Preferences {
  return savePreferences(patch);
}

export function clearPreferences(): void {
  Object.values(KEYS).forEach((key) => localStorage.removeItem(key));
}

export const PREFERENCE_KEYS = Object.values(KEYS);

export const getDefaultTimezone = (): string => getPreferences().defaultTimezone;
export const setDefaultTimezone = (defaultTimezone: string): Preferences =>
  updatePreferences({ defaultTimezone });
export const getDefaultReminders = () => getPreferences().defaultReminders;
export const setDefaultReminders = (defaultReminders: Preferences["defaultReminders"]) =>
  updatePreferences({ defaultReminders });
export const getMigrationMarkers = () => getPreferences().migrationMarkers;
export const setMigrationMarker = (name: string, value = true): Preferences =>
  updatePreferences({ migrationMarkers: { ...getPreferences().migrationMarkers, [name]: value } });
