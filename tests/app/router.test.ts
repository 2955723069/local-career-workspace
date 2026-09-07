import { afterEach, describe, expect, it } from "vitest";
import { createAppBus } from "../../src/app/appBus";
import { setupRouter, isAppView } from "../../src/app/router";

function mountShell(): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = `
    <button class="app-nav__tab" data-view="overview" aria-selected="true"></button>
    <button class="app-nav__tab" data-view="resumes" aria-selected="false"></button>
    <section class="app-view" data-view-panel="overview"></section>
    <section class="app-view" data-view-panel="resumes" hidden></section>
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
});
