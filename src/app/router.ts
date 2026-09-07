import type { AppBus } from "./appBus";

export const APP_VIEWS = ["overview", "resumes", "applications", "interviews", "matching", "ai", "settings"] as const;
export type AppView = (typeof APP_VIEWS)[number];

export function isAppView(name: string): name is AppView {
  return (APP_VIEWS as readonly string[]).includes(name);
}

export interface RouterOptions {
  root: HTMLElement;
  documentRef: Document;
  bus: AppBus;
  signal?: AbortSignal;
}

export function setupRouter({ root, documentRef, bus, signal }: RouterOptions): void {
  const tabs = Array.from(root.querySelectorAll<HTMLButtonElement>(".app-nav__tab"));
  const views = Array.from(root.querySelectorAll<HTMLElement>(".app-view"));
  if (!tabs.length || !views.length) return;

  const view = documentRef.defaultView;

  const showView = (name: AppView, push = false, applicationId?: string) => {
    views.forEach((section) => { section.hidden = section.dataset.viewPanel !== name; });
    tabs.forEach((tab) => { tab.setAttribute("aria-selected", String(tab.dataset.view === name)); });
    root.dispatchEvent(new CustomEvent("app-view-changed", { detail: name }));
    if (view) {
      const current = view.location.hash.replace(/^#/, "");
      if (push || current !== name) {
        try {
          const url = new URL(view.location.href);
          url.hash = name;
          if (applicationId) url.searchParams.set("applicationId", applicationId);
          else url.searchParams.delete("applicationId");
          (push ? view.history.pushState : view.history.replaceState).call(view.history, null, "", url.toString());
        } catch { /* history 不可用时忽略,视图切换仍生效 */ }
      }
    }
  };

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const name = tab.dataset.view;
      if (name && isAppView(name)) showView(name, true);
    }, { signal });
  });

  bus.on("app-navigate", (detail) => {
    if (detail?.name && isAppView(detail.name)) {
      showView(detail.name, true, detail.applicationId);
      if (detail.applicationId) root.querySelector<HTMLElement>(".ai-page")?.dispatchEvent(new CustomEvent("ai-application-selected", { detail: detail.applicationId }));
    }
  });

  view?.addEventListener("hashchange", () => {
    const name = view.location.hash.replace(/^#/, "");
    showView(isAppView(name) ? name : "overview");
  }, { signal });
  view?.addEventListener("popstate", () => {
    const name = view.location.hash.replace(/^#/, "");
    showView(isAppView(name) ? name : "overview");
  }, { signal });

  const initial = view?.location.hash.replace(/^#/, "") ?? "";
  showView(isAppView(initial) ? initial : "overview");
}
