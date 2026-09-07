import type { AppBus } from "./appBus";

export const APP_VIEWS = ["overview", "resumes", "applications", "interviews", "settings"] as const;
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

export interface ParsedRoute {
  view: AppView;
  applicationId?: string;
  tab?: string;
}

export function parseRoute(hash: string): ParsedRoute {
  const raw = hash.replace(/^#/, "");
  if (!raw) return { view: "overview" };
  const [head, id, tab] = raw.split("/");
  if (!isAppView(head)) return { view: "overview" };
  if (head === "applications" && id) return { view: "applications", applicationId: id, tab: tab || undefined };
  return { view: head };
}

export function setupRouter({ root, documentRef, bus, signal }: RouterOptions): void {
  const tabs = Array.from(root.querySelectorAll<HTMLButtonElement>(".app-nav__tab"));
  const views = Array.from(root.querySelectorAll<HTMLElement>(".app-view"));
  if (!tabs.length || !views.length) return;

  const view = documentRef.defaultView;

  const showView = (name: AppView, push = false, applicationId?: string, tab?: string) => {
    views.forEach((section) => { section.hidden = section.dataset.viewPanel !== name; });
    tabs.forEach((tab) => { tab.setAttribute("aria-selected", String(tab.dataset.view === name)); });
    root.dispatchEvent(new CustomEvent("app-view-changed", { detail: name }));
    if (view) {
      const current = view.location.hash.replace(/^#/, "");
      const nextHash = name === "applications" && applicationId
        ? `applications/${applicationId}${tab ? "/" + tab : ""}`
        : name;
      if (push || current !== nextHash) {
        try {
          const url = new URL(view.location.href);
          url.hash = nextHash;
          (push ? view.history.pushState : view.history.replaceState).call(view.history, null, "", url.toString());
        } catch { /* history 不可用时忽略,视图切换仍生效 */ }
      }
    }
  };

  const applyRoute = (route: ParsedRoute, push = false) => {
    showView(route.view, push, route.applicationId, route.tab);
    if (route.view === "applications") {
      if (route.applicationId) bus.emit("application-selected", { applicationId: route.applicationId, tab: route.tab });
      else bus.emit("application-list", undefined);
    }
  };

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const name = tab.dataset.view;
      if (name && isAppView(name)) applyRoute({ view: name }, true);
    }, { signal });
  });

  bus.on("app-navigate", (detail) => {
    if (detail?.name && isAppView(detail.name)) {
      applyRoute({ view: detail.name, applicationId: detail.applicationId, tab: detail.tab }, true);
    }
  });

  view?.addEventListener("hashchange", () => {
    applyRoute(parseRoute(view.location.hash));
  }, { signal });
  view?.addEventListener("popstate", () => {
    applyRoute(parseRoute(view.location.hash));
  }, { signal });

  applyRoute(parseRoute(view?.location.hash ?? ""));
}
