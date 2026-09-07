import { afterEach, describe, expect, it } from "vitest";
import { createAppBus } from "../../src/app/appBus";
import { setupRouter, isAppView, parseRoute } from "../../src/app/router";

function mountShell(): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = `
    <button class="app-nav__tab" data-view="overview" aria-selected="true"></button>
    <button class="app-nav__tab" data-view="resumes" aria-selected="false"></button>
    <button class="app-nav__tab" data-view="applications" aria-selected="false"></button>
    <section class="app-view" data-view-panel="overview"></section>
    <section class="app-view" data-view-panel="resumes" hidden></section>
    <section class="app-view" data-view-panel="applications" hidden></section>
  `;
  document.body.append(root);
  return root;
}

describe("router", () => {
  afterEach(() => { document.body.innerHTML = ""; window.history.replaceState(null, "", "#"); });

  it("recognizes known views only", () => {
    expect(isAppView("resumes")).toBe(true);
    expect(isAppView("nope")).toBe(false);
  });

  it("shows the initial view and toggles panels on tab click", () => {
    const root = mountShell();
    setupRouter({ root, documentRef: document, bus: createAppBus() });
    expect(root.querySelector<HTMLElement>('[data-view-panel="overview"]')?.hidden).toBe(false);
    root.querySelector<HTMLButtonElement>('[data-view="resumes"]')?.click();
    expect(root.querySelector<HTMLElement>('[data-view-panel="resumes"]')?.hidden).toBe(false);
    expect(root.querySelector<HTMLElement>('[data-view-panel="overview"]')?.hidden).toBe(true);
    expect(window.location.hash).toBe("#resumes");
  });

  it("navigates when the bus emits app-navigate", () => {
    const root = mountShell();
    const bus = createAppBus();
    setupRouter({ root, documentRef: document, bus });
    bus.emit("app-navigate", { name: "resumes" });
    expect(root.querySelector<HTMLButtonElement>('[data-view="resumes"]')?.getAttribute("aria-selected")).toBe("true");
  });

  it("parses plain, detail and detail-with-tab hashes", () => {
    expect(parseRoute("")).toEqual({ view: "overview" });
    expect(parseRoute("#resumes")).toEqual({ view: "resumes" });
    expect(parseRoute("#applications")).toEqual({ view: "applications" });
    expect(parseRoute("#applications/app-1")).toEqual({ view: "applications", applicationId: "app-1" });
    expect(parseRoute("#applications/app-1/matching")).toEqual({ view: "applications", applicationId: "app-1", tab: "matching" });
    expect(parseRoute("#nonsense")).toEqual({ view: "overview" });
  });

  it("emits application-selected on the bus when navigating to a detail route", () => {
    const root = mountShell();
    const bus = createAppBus();
    const selected: Array<{ applicationId: string; tab?: string }> = [];
    bus.on("application-selected", (d) => selected.push(d));
    setupRouter({ root, documentRef: document, bus });
    bus.emit("app-navigate", { name: "applications", applicationId: "app-9", tab: "ai" });
    expect(selected).toEqual([{ applicationId: "app-9", tab: "ai" }]);
    expect(root.querySelector<HTMLButtonElement>('[data-view="applications"]')?.getAttribute("aria-selected")).toBe("true");
  });
});
