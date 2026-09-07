import { afterEach, describe, expect, it } from "vitest";
import { createSettingsPage } from "../../src/components/SettingsPage/SettingsPage";

describe("settings page component", () => {
  afterEach(() => { document.body.innerHTML = ""; });

  it("renders preference, notification and data-management controls standalone", () => {
    const page = createSettingsPage(document);
    expect(page.querySelector("#settings-default-timezone")).not.toBeNull();
    expect(page.querySelector('[data-action="request-notifications"]')).not.toBeNull();
    expect(page.querySelector('[data-action="refresh-data-preview"]')).not.toBeNull();
    expect(page.querySelector('[data-action="open-clear-data"]')).not.toBeNull();
  });

  it("renders the AI settings form fields", () => {
    const page = createSettingsPage(document);
    expect(page.querySelector('[data-form="ai-settings"] input[name="apiUrl"]')).not.toBeNull();
    expect(page.querySelector('[data-form="ai-settings"] input[name="model"]')).not.toBeNull();
    expect(page.querySelector('[data-form="ai-settings"] input[name="apiKey"]')).not.toBeNull();
  });
});
