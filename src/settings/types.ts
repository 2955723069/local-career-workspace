import type { Reminder } from "../db/types";

export interface UiPreferences {
  theme?: "light" | "dark" | "system";
  [key: string]: boolean | string | number | undefined;
}

export interface Preferences {
  defaultTimezone: string;
  defaultReminders: Reminder[];
  uiPreferences: UiPreferences;
  migrationMarkers: Record<string, boolean>;
}

export interface AiSettings {
  apiUrl: string;
  model: string;
  apiKey: string;
  organizationId: string;
  customHeaders: Record<string, string>;
}
