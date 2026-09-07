# 第 2a 期 · 职位详情枢纽页 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `ApplicationBoard` 里已测试的内联"职位详情"抽成独立的路由枢纽组件 `createApplicationDetail`，用二级子标签（概览/JD/简历/匹配/AI/时间线/备注）组织；退役无测试的顶层 `matching`/`ai` 独立页，顶层从 7 区收敛到 5 区；路由支持 `#applications/:id/:tab`。

**Architecture:** 纯前端结构 + 交互重组，不改数据/服务层。现有内联 `showDetail`（含本地匹配、AI 顾问、时间线、简历历史、备注、阶段/简历切换、归档/删除）是**已测试的聚合体**——本期把它**整体搬进**新组件 `src/components/ApplicationDetail/ApplicationDetail.ts` 并按子标签重排，而不是重写。顶层 `MatchingPage`/`AiPage` 是零测试的重复实现，直接删除。看板"查看详情"从"内联展开"改为"经 appBus 导航到 `#applications/:id`"。`router` 扩展为解析 `#applications/:id/:tab` 三段 hash。

**Tech Stack:** TypeScript、Vite、Vitest（+ fake-indexeddb / jsdom）、原生 DOM、`appBus`（第 1 期）、`router`（第 1 期）。

**Spec:** `docs/superpowers/specs/2026-09-04-job-search-app-restructure-design.md`（见 §5 实现修正、§8 第 2a 期）

## Global Constraints

- **不改底层**：不修改 `src/db/*`、`src/features/*` 服务层接口语义、`src/backup/*`、`src/calendar/*`、`src/settings/*`、`src/storage/*`、`src/ai/*`、`src/matching/*`、`src/parsers/*`。
- **顶层收敛到 5 区**：`APP_VIEWS = ["overview","resumes","applications","interviews","settings"]`（移除 `matching`、`ai`）。顺序保持这 5 个。
- **面试日历保留顶层**；本职位的面试/复盘子标签是**第 2b 期**，本期详情页**不含**面试/复盘子标签。
- **复用已测试逻辑，不重写匹配/AI**：详情的匹配面板、AI 顾问面板、run-matching/open-analysis/AI 预览发送/copy/export 等行为**逐字搬移**，只改"组织方式"（分子标签）与"数据来源"（组件自载）。
- **保留 SendPreview**：`src/components/SendPreview/` 仍被详情的 AI 面板使用，**不删**。
- **删除**：`src/components/MatchingPage/`、`src/components/AiPage/`（及其在 createApp 的导入与挂载、顶层 tab、view 面板）。
- **被测选择器/行为必须存活**：详情内容里 `.application-detail`、`[data-action="run-matching"]`、`.matching-result`（含文案“仅代表文本证据”）、AI 面板 `[data-ai-form]`、归档/删除确认 `[data-action="confirm-application-action"]`/`cancel-application-action`、看板 `[data-action="details"]`/`edit`/`advance`、`form[data-form="application"]`、`.application-stage-column` 等，在重构后行为等价（详见各任务）。
- **组件形态**：`create*(documentRef, options): HTMLElement` 工厂，无 class。所有持久监听接入 `signal`。
- **不泄漏敏感信息**：错误提示沿用安全中文文案，不回显 `error.message`。
- **命令**：单文件测试 `npx vitest run <path>`；全量 `npm test`；类型 `npx tsc --noEmit`；构建 `npm run build`。
- **提交**：git 可用（分支由执行者按 SDD 流程创建）。identity 若缺失用 `git -c user.name='qh' -c user.email='qh@local' commit ...`。

---

## 文件结构

**新增：**
- `src/components/ApplicationDetail/ApplicationDetail.ts` — 职位详情枢纽组件（承接 ApplicationBoard 的 `showDetail` 逻辑，分子标签）。
- `tests/applications/application-detail.test.ts` — 详情组件独立 UI 测试。

**改写：**
- `src/app/router.ts` — 扩展解析 `#applications/:id/:tab`，导出 `parseRoute`。
- `src/components/ApplicationBoard/ApplicationBoard.ts` — 移除内联详情（`showDetail`/`renderAiResult`/详情相关 click&submit 分支/advisorPreview），"details" 动作改为经 bus 导航。
- `src/app/createApp.ts` — 移除顶层 matching/ai tab+view+挂载+导入；在 applications 视图内挂载 detail 组件；按路由在"看板/详情"间切换。
- `tests/app.test.ts` — 7→5 tab；移除对 matching/ai 视图的断言（若有）。
- `tests/applications/application-board.test.ts` — 详情相关用例（"shows details…"、"runs local matching from details…"）改为反映"点详情→路由→详情组件渲染"的新流程（见 Task 4）。

**删除：**
- `src/components/MatchingPage/MatchingPage.ts`、`src/components/AiPage/AiPage.ts`。

---

## Task 1: 退役顶层 matching/ai，收敛到 5 区

移除顶层 `JD 匹配`/`AI 顾问` tab、`#view-matching`/`#view-ai` 面板与挂载、createApp 里对两组件的导入/挂载/导航接线；删除两个独立组件文件；`router` 的 `APP_VIEWS` 收敛为 5；更新 `app.test.ts`。此任务不触碰 ApplicationBoard 的内联详情（详情仍暂留在看板里，Task 3/4 再搬）。

**Files:**
- Modify: `src/app/router.ts`（`APP_VIEWS` 7→5）
- Modify: `src/app/createApp.ts`（删 matching/ai 的 import、nav 按钮、view 面板、挂载块、`onOpenAi`/`onOpenSettings` 接线）
- Delete: `src/components/MatchingPage/MatchingPage.ts`、`src/components/AiPage/AiPage.ts`
- Modify(test): `tests/app.test.ts`

**Interfaces:**
- Consumes: 无新增。
- Produces: `APP_VIEWS = ["overview","resumes","applications","interviews","settings"] as const`（其余导出不变：`AppView`/`isAppView`/`RouterOptions`/`setupRouter`）。

- [ ] **Step 1: 更新 app.test.ts 断言（先让它失败）**

在 `tests/app.test.ts`：把 `expect(root.querySelectorAll(".app-nav__tab")).toHaveLength(7);` 改为 `toHaveLength(5);`。检查该文件是否有对 `data-view="matching"`/`"ai"` 或 `view-matching`/`view-ai` 的断言，若有则删除对应行（当前仓库中搜索确认没有，若无则跳过）。

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/app.test.ts`
Expected: FAIL —"starts on the overview page" 用例因当前仍渲染 7 个 tab 而断言 5 失败。

- [ ] **Step 3: router APP_VIEWS 收敛为 5**

`src/app/router.ts`：
```typescript
export const APP_VIEWS = ["overview", "resumes", "applications", "interviews", "settings"] as const;
```
其余不动。

- [ ] **Step 4: createApp 删除 matching/ai 顶层**

`src/app/createApp.ts`：
1. 删除导入：`import { createMatchingPage } from "../components/MatchingPage/MatchingPage";` 与 `import { createAiPage } from "../components/AiPage/AiPage";`；删除 `import type { MatchingService }`（若仅此处用）。保留 `matchingService`/`aiAdvisorService` 仍传给 ApplicationBoard 的选项（详情匹配/AI 需要）。
2. 删除 nav 里这两行：
   ```html
   <button ... data-view="matching" ...>JD 匹配</button>
   <button ... data-view="ai" ...>AI 顾问</button>
   ```
3. 删除 `#view-matching`、`#view-ai` 两个 `<section>` 面板（含 `.matching-page-mount`、`.ai-page-mount`）。
4. 删除挂载块：`const matchingMount = ...` 与 `const aiMount = ... aiPage = createAiPage(...)`，以及 `let aiPage` 变量。若 `setupSettingsPanel`/settings 组件的 `onAiSettingsChanged` 里引用了 `aiPage?.dispatchEvent(new CustomEvent("ai-service-changed", …))`，把该行删除（顶层 AiPage 已不存在；ApplicationBoard 的 AI 走它自己的 `aiAdvisorService`，不监听该事件）。保留把 `service` 透传给 `options.onAiSettingsChanged?.(service)` 的逻辑。
5. 删除任何 `bus.emit("app-navigate", { name: "ai" | "matching", … })` 的调用点（原 MatchingPage `onOpenAi`、AiPage `onOpenSettings` 已随组件删除）。ApplicationBoard 不需要这些。

- [ ] **Step 5: 删除两个独立组件文件**

```bash
git rm src/components/MatchingPage/MatchingPage.ts src/components/AiPage/AiPage.ts
```
（若目录空则一并移除空目录。）

- [ ] **Step 6: 运行相关测试 + 类型检查**

Run: `npx vitest run tests/app.test.ts tests/applications/application-board.test.ts tests/interviews/interview-ui.test.ts`
Expected: PASS。ApplicationBoard 的内联详情/匹配/AI 仍在，其用例应继续通过；app.test.ts 现在断言 5 个 tab。

Run: `npx tsc --noEmit`
Expected: 0 错误（尤其确认无残留的 MatchingService/未使用导入）。

- [ ] **Step 7: 全量测试**

Run: `npm test`
Expected: 全绿（数量 = 之前 158 − 已删组件无独立测试，应仍为 158；app.test 用例数不变）。

- [ ] **Step 8: 提交**

```bash
git add -A
git commit -m "refactor(app): retire top-level matching/ai pages, collapse nav to 5 views"
```

---

## Task 2: router 支持 `#applications/:id/:tab` 子路由

扩展 `router.ts`：解析三段 hash，识别出 `{ view, applicationId?, tab? }`；当导航到 `applications` 且带 `applicationId` 时，除了显示 applications 视图外，通过 `bus` 发一个 `application-selected` 事件（detail: `{ applicationId, tab }`），供 createApp 切换"看板/详情"。保持既有单段行为不变。

**Files:**
- Modify: `src/app/router.ts`
- Modify: `src/app/appBus.ts`（新增事件键）
- Test: `tests/app/router.test.ts`（新增子路由用例）

**Interfaces:**
- Consumes: `AppBus`（第 1 期）。
- Produces:
  - `appBus.ts` 的 `AppEventMap` 新增键：`"application-selected": { applicationId: string; tab?: string }`，以及 `"application-list": void`（回到看板、无选中）。
  - `router.ts` 导出 `parseRoute(hash: string): { view: AppView; applicationId?: string; tab?: string }`（未知/空 → `{ view: "overview" }`；`applications/:id` / `applications/:id/:tab` → 带 applicationId[/tab]）。
  - `app-navigate` 的 detail 扩展为 `{ name: string; applicationId?: string; tab?: string }`（`tab` 可选，向后兼容）。

- [ ] **Step 1: 写失败测试**

在 `tests/app/router.test.ts` 顶部 import 增加 `parseRoute`：
```typescript
import { setupRouter, isAppView, parseRoute } from "../../src/app/router";
```
在 `describe("router", …)` 内追加：
```typescript
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
```
`mountShell` 需要含 `applications` tab/panel——在该测试文件的 `mountShell` 里补一个 `applications` 的 tab 与 panel（若尚无）。

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/app/router.test.ts`
Expected: FAIL —`parseRoute` 未导出 / `application-selected` 键不存在。

- [ ] **Step 3: appBus 新增事件键**

`src/app/appBus.ts` 的 `AppEventMap` 增加：
```typescript
  "application-selected": { applicationId: string; tab?: string };
  "application-list": void;
```
并把 `"app-navigate"` 的类型改为：
```typescript
  "app-navigate": { name: string; applicationId?: string; tab?: string };
```

- [ ] **Step 4: router 解析与派发**

`src/app/router.ts`：
1. 新增导出：
   ```typescript
   export function parseRoute(hash: string): { view: AppView; applicationId?: string; tab?: string } {
     const raw = hash.replace(/^#/, "");
     if (!raw) return { view: "overview" };
     const [head, id, tab] = raw.split("/");
     if (!isAppView(head)) return { view: "overview" };
     if (head === "applications" && id) return { view: "applications", applicationId: id, tab: tab || undefined };
     return { view: head };
   }
   ```
2. `RouterOptions` 增加 `bus`（已有）。在 `showView` 之外新增一个处理导航 detail 的分支：当 `app-navigate` 或初始/hashchange 解析出 `applicationId` 时，`showView("applications", …)` 后再 `bus.emit("application-selected", { applicationId, tab })`；解析为纯 `applications`（无 id）时 `bus.emit("application-list", undefined)`。
3. 把内部 `showView(name, push, applicationId)` 扩展为可携带 `tab`，写 hash 时用 `#applications/:id[/:tab]` 形式（仅当 name === "applications" 且有 id）；其余 view 仍写 `#<name>`。
   - hash 写法：`url.hash = applicationId ? \`applications/${applicationId}${tab ? "/" + tab : ""}\` : name;`（注意去掉之前的 `applicationId` searchParam 逻辑——改用路径段承载；`ai-application-selected` 的旧 DOM 派发可删除，因为顶层 AiPage 已不存在）。
4. `bus.on("app-navigate", …)`、`hashchange`、`popstate`、初始渲染都改为经 `parseRoute` 得到 `{view, applicationId, tab}`，据此 `showView` + 视情况 emit `application-selected`/`application-list`。

- [ ] **Step 5: 运行 router 测试 + app 回归**

Run: `npx vitest run tests/app/router.test.ts tests/app.test.ts`
Expected: PASS。app.test 的 "switches pages … supports hash deep links" 仍绿（纯段 hash 行为不变）。

- [ ] **Step 6: 全量 + 类型**

Run: `npm test && npx tsc --noEmit`
Expected: 全绿。

- [ ] **Step 7: 提交**

```bash
git add src/app/router.ts src/app/appBus.ts tests/app/router.test.ts
git commit -m "feat(router): parse #applications/:id/:tab and emit application-selected"
```

---

## Task 3: 创建 createApplicationDetail 组件（移动 showDetail + 子标签化）

把 `ApplicationBoard.ts` 的详情逻辑**整体搬进**新组件：`showDetail` 渲染、`renderAiResult`、详情相关的 click 分支（`run-matching`/`open-analysis`/`save-detail-stage`/`save-detail-resume`/`save-detail-note`/`archive`/`delete`/`confirm-application-action`/`cancel-application-action`/`copy-ai-message`/`copy-ai-all`/`export-ai-report`/`close-detail`）、AI `submit` 处理、`advisorPreview`（SendPreview）挂载、`confirmDialog` 焦点陷阱。组件按 `applicationId` **自载数据**并把详情内容按**子标签**重排。本任务只做"组件独立可用 + 独立测试通过"，尚不接入看板路由（Task 4 接线）。

**Files:**
- Create: `src/components/ApplicationDetail/ApplicationDetail.ts`
- Create(test): `tests/applications/application-detail.test.ts`

**Interfaces:**
- Consumes: `AppBus`（可选）、`AnalysisResult`/`Application`/`Resume`/`Stage`（`../../db/types`）、`exportAdvisorReport`/`parseAiAdvisorResult`/`AiAdvisorResult`/`AiAdvisorService`（`../../features/ai/aiAdvisorService`）、`createSendPreview`/`SendPreviewElement`（`../SendPreview/SendPreview`）、以及与 `ApplicationBoardOptions` 相同的 `applicationService`/`stageService`/`jobDescriptionService`/`resumeLibrary`/`matchingService`/`aiAdvisorService` 服务子集。
- Produces:
  - `interface ApplicationDetailOptions { applicationService; stageService; jobDescriptionService?; resumeLibrary?; matchingService?; aiAdvisorService?; bus?: AppBus; signal?: AbortSignal }`（服务类型直接复用 `ApplicationBoardOptions` 里对应字段的形状——可从 ApplicationBoard 导出这些类型，或在本文件重声明与之一致的最小接口）。
  - `createApplicationDetail(documentRef: Document, options: ApplicationDetailOptions): HTMLElement`（返回 `<section class="application-detail-view">` 元素，含子标签栏 + 内容区）。
  - `show(applicationId: string, tab?: DetailTab): Promise<void>` 方法挂在返回元素上（`(el as ApplicationDetailElement).show(...)`），供 Task 4 路由调用。
  - `type DetailTab = "overview" | "jd" | "resume" | "matching" | "ai" | "timeline" | "note"`。
  - `type ApplicationDetailElement = HTMLElement & { show(applicationId: string, tab?: DetailTab): Promise<void> }`。

- [ ] **Step 1: 写失败测试（组件独立渲染 + 匹配 + AI + 子标签）**

创建 `tests/applications/application-detail.test.ts`：
```typescript
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApplicationDetail, type ApplicationDetailElement } from "../../src/components/ApplicationDetail/ApplicationDetail";

const application = { id: "app-1", company: "Acme", position: "Engineer", jobType: "tech", workMode: "onsite", location: "SF", stageId: "s1", currentResumeId: "resume-a", jobUrl: "", jdText: "JD text", note: "note text", priority: 0 };
const stages = [{ id: "s1", name: "已申请", color: "#888", order: 0, kind: "normal" }];
const resumes = [{ id: "resume-a", name: "简历 A", status: "ready", tags: [], fileName: "a.pdf" }];

function baseServices(overrides: Record<string, unknown> = {}) {
  return {
    applicationService: {
      listApplications: async () => [application],
      listTimeline: async () => [{ id: "t1", type: "stage-changed", note: "→ 已申请" }],
      listResumeUsageHistory: async () => [{ id: "u1", resumeNameSnapshot: "简历 A", textSnapshot: "文本快照" }],
      changeStage: vi.fn(async () => application), bindResume: vi.fn(async () => application), updateNote: vi.fn(async () => application),
      previewArchive: async () => ({ id: "app-1", company: "Acme", position: "Engineer", resumeUsageCount: 1, timelineEventCount: 1 }),
      confirmArchive: vi.fn(async () => application), previewDelete: async () => ({ id: "app-1", company: "Acme", position: "Engineer", resumeUsageCount: 1, timelineEventCount: 1 }), confirmDelete: vi.fn(async () => undefined),
    },
    stageService: { listStages: async () => stages },
    resumeLibrary: { search: async () => resumes },
    ...overrides,
  } as any;
}

describe("application detail hub", () => {
  afterEach(() => { document.body.innerHTML = ""; });

  it("renders sub-tabs and the overview tab facts for an application", async () => {
    const el = createApplicationDetail(document, baseServices()) as ApplicationDetailElement;
    document.body.append(el);
    await el.show("app-1");
    expect(el.matches("section.application-detail-view")).toBe(true);
    expect(el.querySelector('[data-detail-tab="overview"]')).toBeTruthy();
    expect(el.querySelector('[data-detail-tab="matching"]')).toBeTruthy();
    expect(el.querySelector('[data-detail-tab="ai"]')).toBeTruthy();
    expect(el.textContent).toContain("Acme");
    expect(el.textContent).toContain("Engineer");
  });

  it("runs local matching from the matching tab and shows the disclaimer", async () => {
    const result = { id: "an-1", applicationId: "app-1", resumeId: "resume-a", mode: "local", createdAt: "2026-09-02T00:00:00.000Z", coverage: { overall: 50, required: 40, preferred: 60 }, matchedKeywords: ["TS"], weakMatches: [], missingKeywords: [], uncertainItems: [], evidence: [] };
    const matchingService = { run: vi.fn(async () => result), listHistory: vi.fn(async () => [result]), get: vi.fn(async () => result) };
    const el = createApplicationDetail(document, baseServices({ matchingService })) as ApplicationDetailElement;
    document.body.append(el);
    await el.show("app-1", "matching");
    expect(el.querySelector('[data-action="run-matching"]')).toBeTruthy();
    (el.querySelector('[data-action="run-matching"]') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 0));
    expect(matchingService.run).toHaveBeenCalledWith("app-1", "resume-a");
    expect(el.querySelector(".matching-result")?.textContent).toContain("仅代表文本证据");
  });

  it("opens the AI preview from the ai tab", async () => {
    const aiAdvisorService = { createPreview: vi.fn(async () => ({ applicationId: "app-1", prompt: "hi", resumeName: "简历 A", resumeTextLength: 10, jdLength: 5, messageCount: 0, apiUrl: "https://x" })), send: vi.fn(), getConversation: vi.fn(async () => undefined) };
    const el = createApplicationDetail(document, baseServices({ aiAdvisorService })) as ApplicationDetailElement;
    document.body.append(el);
    await el.show("app-1", "ai");
    const form = el.querySelector<HTMLFormElement>("[data-ai-form]")!;
    (form.elements.namedItem("prompt") as HTMLTextAreaElement).value = "如何优化？";
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 0));
    expect(aiAdvisorService.createPreview).toHaveBeenCalledWith("app-1", "如何优化？");
  });

  it("switches active tab via the tab bar", async () => {
    const el = createApplicationDetail(document, baseServices()) as ApplicationDetailElement;
    document.body.append(el);
    await el.show("app-1");
    (el.querySelector('[data-detail-tab="timeline"]') as HTMLButtonElement).click();
    expect(el.querySelector('[data-detail-tab="timeline"]')?.getAttribute("aria-selected")).toBe("true");
    expect(el.querySelector('[data-detail-panel="timeline"]')?.hasAttribute("hidden")).toBe(false);
    expect(el.querySelector('[data-detail-panel="overview"]')?.hasAttribute("hidden")).toBe(true);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/applications/application-detail.test.ts`
Expected: FAIL — `createApplicationDetail` 模块不存在。

- [ ] **Step 3: 创建组件骨架 + 子标签框架**

创建 `src/components/ApplicationDetail/ApplicationDetail.ts`。根元素 `<section class="application-detail-view">`，结构：
```
上下文条(.application-detail__context: 公司·职位·当前简历·阶段)
子标签栏(.application-detail__tabs: 7 个 button[data-detail-tab])
内容区(每个 tab 一个 div[data-detail-panel=...])
状态行(.application-detail__status role=status)
```
`DetailTab` 顺序：`overview, jd, resume, matching, ai, timeline, note`。中文标签名：概览 / JD / 简历 / 匹配 / AI / 时间线 / 备注。骨架示例：
```typescript
import type { AnalysisResult, Application, Resume, Stage } from "../../db/types";
import { exportAdvisorReport, parseAiAdvisorResult, type AiAdvisorResult, type AiAdvisorService } from "../../features/ai/aiAdvisorService";
import { createSendPreview, type SendPreviewElement } from "../SendPreview/SendPreview";
import type { AppBus } from "../../app/appBus";

export type DetailTab = "overview" | "jd" | "resume" | "matching" | "ai" | "timeline" | "note";
export type ApplicationDetailElement = HTMLElement & { show(applicationId: string, tab?: DetailTab): Promise<void> };

const TABS: Array<{ key: DetailTab; label: string }> = [
  { key: "overview", label: "概览" }, { key: "jd", label: "JD" }, { key: "resume", label: "简历" },
  { key: "matching", label: "匹配" }, { key: "ai", label: "AI" }, { key: "timeline", label: "时间线" }, { key: "note", label: "备注" },
];

export interface ApplicationDetailOptions {
  applicationService: /* 同 ApplicationBoardOptions.applicationService 形状 */ any;
  stageService: any;
  jobDescriptionService?: any;
  resumeLibrary?: Pick<import("../../features/resumes/resumeLibrary").ResumeLibraryService, "search" | "getConfirmedText">;
  matchingService?: { run(a: string, r: string): Promise<AnalysisResult>; listHistory(a: string, r?: string, m?: "local" | "ai"): Promise<AnalysisResult[]>; get(id: string): Promise<AnalysisResult | undefined> };
  aiAdvisorService?: Pick<AiAdvisorService, "createPreview" | "send" | "getConversation">;
  bus?: AppBus;
  signal?: AbortSignal;
}

export function createApplicationDetail(documentRef: Document, options: ApplicationDetailOptions): HTMLElement {
  const root = documentRef.createElement("section") as ApplicationDetailElement;
  root.className = "application-detail-view";
  root.setAttribute("aria-labelledby", "application-detail-title");
  root.innerHTML = `
    <div class="application-detail__context"><h2 id="application-detail-title"></h2><p class="application-detail__subtitle"></p></div>
    <div class="application-detail__tabs" role="tablist">${TABS.map((t) => `<button type="button" role="tab" data-detail-tab="${t.key}" aria-selected="${t.key === "overview"}">${t.label}</button>`).join("")}</div>
    ${TABS.map((t) => `<div class="application-detail__panel" data-detail-panel="${t.key}"${t.key === "overview" ? "" : " hidden"}></div>`).join("")}
    <p class="application-detail__status" role="status" aria-live="polite"></p>
    <div class="application-confirm" role="dialog" aria-modal="true" aria-labelledby="application-confirm-title" hidden><h3 id="application-confirm-title">确认操作</h3><p data-confirm-summary></p><div><button type="button" data-action="confirm-application-action">确认</button><button type="button" data-action="cancel-application-action">取消</button></div></div>
  `;
  // ... 状态、数据、活动 tab、SendPreview 挂载、事件委托见后续步骤
  root.show = async (applicationId, tab = "overview") => { /* Step 4 */ };
  return root;
}
```

- [ ] **Step 4: 迁入 showDetail 渲染 + 子标签分配 + 数据自载**

把 `ApplicationBoard.ts` 的 `showDetail` 与 `renderAiResult` 逻辑迁入本组件的 `show()`，**逐字保留各片段的渲染 HTML**（尤其 `.matching-result`、`matching-disclaimer` 文案“仅代表文本证据”、`.ai-result`、`ai-authenticity-risk`、`data-ai-form`、`data-matching-resume`、`data-action="run-matching"`/`open-analysis`/`save-detail-stage`/`save-detail-resume`/`save-detail-note`/`archive`/`delete`/`copy-ai-message`/`copy-ai-all`/`export-ai-report`），仅把"一整块 innerHTML"**按 tab 拆分**到对应 `[data-detail-panel]`：
- `overview` 面板 = 原 `.application-detail__facts`（公司/职位/阶段/网址）+ `.application-detail__actions`（推进阶段/切换简历/添加备注/归档/删除）。
- `jd` 面板 = facts 里的 JD 段（`item.jdText` 长文本）。
- `resume` 面板 = 当前简历 + “简历使用历史”列表。
- `matching` 面板 = 原 `.matching-panel` 整块（run 控件 + 历史 + 当前结果）。
- `ai` 面板 = 原 `aiSection` 整块（表单 + 结果 + 会话 + 复制/导出）。
- `timeline` 面板 = 原“时间线”`<ol>`。
- `note` 面板 = 备注编辑（`data-detail-note` + save-detail-note）。可与 overview 的备注按钮二选一：**备注编辑放 note 面板**，overview 不再放备注编辑（避免重复 id/重复 `data-detail-note`）。

`show()` 自载数据：`applications = await applicationService.listApplications()`（取 `find(id)`）、`stages = await stageService.listStages()`、`resumes = options.resumeLibrary ? await search("") : []`、以及 `listTimeline/listResumeUsageHistory/matchingService.listHistory/aiAdvisorService.getConversation`（与原 `showDetail` 相同的并行加载）。渲染上下文条：`公司 · 职位`、副标题 `当前简历：… · 阶段：…`。渲染后按 `tab` 参数激活对应子标签。

迁移替换规则：
1. 原 `showDetail` 里对 `detailContent`、`detail`、`activeAdvisorResult`、`stageById`、`resumes`、`stages`、`applications`、`setStatus` 的引用 → 组件内的等价局部变量/函数（`setStatus` = 写 `.application-detail__status`）。
2. 原本 `activeAdvisorResult`、`advisorPreview` 提升为组件级变量；`advisorPreview` 用 `createSendPreview` 在组件初始化时挂载一次（`onConfirm` 内 `await aiAdvisorService.send(...)` 后 `await root.show(currentId, "ai")` 重渲染并 `setStatus("AI 建议已保存")`）。
3. 归档/删除确认走组件自带的 `.application-confirm` 对话框 + 焦点陷阱（从 ApplicationBoard 迁入 keydown 逻辑）。确认成功后：`bus?.emit("app-data-changed", undefined)`，并 `bus?.emit("application-list", undefined)`（归档/删除后回看板——Task 4 让 createApp 据此切回看板）。
4. `save-detail-*`、`run-matching`、`open-analysis` 成功后调用 `await root.show(currentId, <当前tab>)` 重渲染，并在数据类操作后 `bus?.emit("app-data-changed", undefined)`。
5. AI `submit`：组件根监听 `submit`，`closest("[data-ai-form]")`，`createPreview` 后 `advisorPreview.open(...)`（与原逻辑一致）。
6. `close-detail`（若保留）→ `bus?.emit("application-list", undefined)`。

- [ ] **Step 5: 子标签切换（tab 栏点击 + 键盘）**

组件根监听 click：`closest("[data-detail-tab]")` → 设置 `aria-selected` 与各 `[data-detail-panel]` 的 `hidden`，并把当前 tab 记入组件状态；同时 `bus?.emit("app-navigate", { name: "applications", applicationId: currentId, tab })`（更新 hash，便于刷新/分享/后退）。切 tab **不重新拉全量数据**（数据已在 `show()` 时载入并渲染进各面板——懒渲染留到 2b/后续优化，本期一次性渲染各面板即可，符合 YAGNI）。

- [ ] **Step 6: 运行组件测试确认通过**

Run: `npx vitest run tests/applications/application-detail.test.ts`
Expected: PASS（4 个用例）。

- [ ] **Step 7: 类型检查**

Run: `npx tsc --noEmit`
Expected: 0 错误。（此步组件尚未接入 createApp，全量测试留到 Task 4。）

- [ ] **Step 8: 提交**

```bash
git add src/components/ApplicationDetail/ApplicationDetail.ts tests/applications/application-detail.test.ts
git commit -m "feat(applications): add createApplicationDetail hub with sub-tabs (extracted from board)"
```

---

## Task 4: 接线路由——看板"详情"→导航，createApp 按路由切换看板/详情，移除看板内联详情

让 `ApplicationBoard` 的 "details" 动作改为经 bus 导航 `#applications/:id`；createApp 挂载 `createApplicationDetail` 并在 applications 视图内根据 `application-selected`/`application-list` 事件切换"看板 vs 详情"；**删除 ApplicationBoard 里已迁走的内联详情**（`.application-detail` section、`showDetail`、`renderAiResult`、详情 click/submit 分支、`advisorPreview`、`confirmDialog` 及相关状态）。更新看板详情相关测试到新流程。

**Files:**
- Modify: `src/components/ApplicationBoard/ApplicationBoard.ts`（删内联详情，"details" 改导航）
- Modify: `src/app/createApp.ts`（挂载 detail 组件、按路由切换、透传服务与 bus）
- Modify(test): `tests/applications/application-board.test.ts`

**Interfaces:**
- Consumes: `createApplicationDetail`/`ApplicationDetailElement`（Task 3）、`application-selected`/`application-list`（Task 2）。
- Produces: ApplicationBoard 仍导出 `createApplicationBoard`（签名不变，但不再渲染内联详情）；board 的 "details" 动作产生 `bus.emit("app-navigate", { name: "applications", applicationId })`。

- [ ] **Step 1: 更新看板详情测试到新流程（先失败）**

在 `tests/applications/application-board.test.ts`：
- "shows details and keeps cancelled deletion side-effect free"：改为点击 `[data-action="details"]` 后断言发生了到 `#applications/application-1` 的导航（可断言 `window.location.hash` 或详情组件出现 `.application-detail-view` 且含“简历 A”）。删除操作与取消改在详情视图内进行（`.application-detail-view` 内的 `[data-action="delete"]` → `cancel-application-action`）。
- "runs local matching from details…"：点击 details 后在 `.application-detail-view` 内切到匹配 tab、点 `run-matching`，断言 `matchingService.run` 调用与 `.matching-result` 文案（与 Task 3 组件测试等价，但经由 createApp 全链路）。

（这些用例现在经 `createApp` 全链路，需要 deps 里带 `matchingService` 等；沿用文件顶部既有 `deps`。）

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/applications/application-board.test.ts`
Expected: FAIL — 旧断言（点 details 出现内联 `.application-detail`）与新流程不符 / 详情已不在看板内联。

- [ ] **Step 3: ApplicationBoard 移除内联详情、details 改导航**

`src/components/ApplicationBoard/ApplicationBoard.ts`：
1. 删除骨架里的 `<section class="application-detail" …>…</section>` 与 `.application-confirm` 对话框（`.application-confirm` 随详情迁到 detail 组件；看板归档/删除入口移到详情页——看板卡片保留“查看详情/编辑/推进阶段”，归档/删除在详情页操作）。
2. 删除 `showDetail`、`renderAiResult`、`activeAdvisorResult`、`advisorPreview`、`detail`/`detailContent`/`confirmDialog`/`confirmSummary`/`detailId`/`pendingAction`/`confirmReturnFocus`、`openConfirm`/`closeConfirm`、`createSendPreview` 挂载块、根 `submit`（AI）监听、`confirmDialog` keydown 监听，以及 click 委托里所有详情相关分支（`copy-ai-message`/`copy-ai-all`/`export-ai-report`/`run-matching`/`open-analysis`/`close-detail`/`save-detail-*`/`archive`/`delete`/`confirm-application-action`/`cancel-application-action`）。
   - **保留**：阶段管理相关分支（`save-stage`/`move-stage-up`/`move-stage-down`/`delete-stage` 及其 `stage-delete` 的确认）。为此，阶段删除的确认对话框需要保留——把 `.application-confirm` **保留在看板**用于阶段删除，仅把"职位归档/删除"确认迁到详情组件。（即：`.application-confirm` 两处各留其一。）
   - `SendPreview` 导入：看板不再直接用 → 删除该 import（详情组件用自己的）。
3. `details` 分支改为：`if (action === "details" && target.dataset.applicationId) { options.bus?.emit("app-navigate", { name: "applications", applicationId: target.dataset.applicationId }); return; }`。为此在 `ApplicationBoardOptions` 增加 `bus?: AppBus`（`import type { AppBus } from "../../app/appBus"`）。
4. `advance` 分支保留（看板卡片上直接推进阶段）。

- [ ] **Step 4: createApp 挂载详情组件并按路由切换**

`src/app/createApp.ts`：
1. `import { createApplicationDetail, type ApplicationDetailElement } from "../components/ApplicationDetail/ApplicationDetail";`
2. applications 视图骨架改为并列两个容器：
   ```html
   <section id="view-applications" ... data-view-panel="applications" ...>
     <div class="application-board-mount"></div>
     <div class="application-detail-mount"></div>
   </section>
   ```
3. 给 `createApplicationBoard(...)` 传 `bus`。挂载详情组件：
   ```typescript
   const detailMount = root.querySelector<HTMLElement>(".application-detail-mount");
   let applicationDetail: ApplicationDetailElement | undefined;
   if (detailMount) {
     applicationDetail = createApplicationDetail(documentRef, {
       applicationService: options.applicationService, stageService: options.stageService,
       jobDescriptionService: options.jobDescriptionService, resumeLibrary: options.resumeLibrary,
       matchingService: options.matchingService, aiAdvisorService: options.aiAdvisorService, bus, signal,
     }) as ApplicationDetailElement;
     detailMount.replaceWith(applicationDetail);
   }
   ```
   （注意变量指针：`replaceWith` 后 `applicationDetail` 仍指向该元素。）
4. 看板/详情切换：
   ```typescript
   const boardEl = () => root.querySelector<HTMLElement>(".application-board");
   const showBoard = () => { boardEl()?.removeAttribute("hidden"); applicationDetail?.setAttribute("hidden", ""); };
   const showDetailView = () => { boardEl()?.setAttribute("hidden", ""); applicationDetail?.removeAttribute("hidden"); };
   showBoard(); // 默认看板
   bus.on("application-selected", ({ applicationId, tab }) => { showDetailView(); void applicationDetail?.show(applicationId, tab as any); });
   bus.on("application-list", () => showBoard());
   ```
   （`.application-detail-view` 初始加 `hidden`，由事件控制显隐；`showBoard/showDetailView` 只切显隐，不动路由。）
5. 数据变更后刷新：详情里 `app-data-changed` 已 emit；createApp 既有 `bus.on("app-data-changed", …refreshOverview)` 保留。看板在详情归档/删除后需刷新——`bus.on("application-list", …)` 里可顺带触发看板重载（看板组件监听 `app-data-cleared` 已有；此处可 `boardEl()?.dispatchEvent(new Event("app-data-changed"))` 若看板监听，或简单接受回看板时看板自身状态；**最小方案**：归档/删除后详情 emit `app-data-changed`，看板对该事件重载——为此给看板加一个 `bus.on("app-data-changed", ()=>load())`？avoid 过度。**采用**：createApp 在 `application-list` 时调用一个看板刷新（若看板暴露）——为避免扩接口，改为：详情删除/归档成功 → `bus.emit("application-list")` → createApp `showBoard()` 且 `location.hash="#applications"`；看板数据在下次进入或 `app-data-cleared` 时刷新。**为确保即时正确**：给 ApplicationBoard 增加 `bus?.on("app-data-changed", () => void load())`（一行，幂等）——把它加入 Task 4 Step 3 的看板改动中。

- [ ] **Step 5: 运行看板 + 详情 + app 回归**

Run: `npx vitest run tests/applications/application-board.test.ts tests/applications/application-detail.test.ts tests/app.test.ts`
Expected: PASS。

- [ ] **Step 6: 全量 + 类型 + 构建**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: 全绿、0 类型错误、构建 `✓ built`。

- [ ] **Step 7: 提交**

```bash
git add -A
git commit -m "refactor(applications): route board->detail hub, remove inline detail from board"
```

---

## Task 5: 收尾与整期验证

确认无残留、样式可用、行为闭环，整期三绿。

**Files:**
- Modify(如需): `src/styles/applications.css`（详情子标签栏最小样式）、`src/styles/index.css`（若需 import）
- Test: 全量 + e2e（best-effort）

**Interfaces:** 无新增。

- [ ] **Step 1: 残留核对**

grep 确认已无对已删组件/内联详情的引用：
```bash
grep -rn "MatchingPage\|AiPage\|createMatchingPage\|createAiPage" src || echo "clean"
grep -rn "showDetail\|renderAiResult" src/components/ApplicationBoard || echo "board clean"
grep -rn 'data-view="matching"\|data-view="ai"\|view-matching\|view-ai' src || echo "nav clean"
```
Expected: 三条均 clean（ApplicationBoard 不再有 showDetail；createApp 无 matching/ai 视图）。

- [ ] **Step 2: 详情子标签栏最小样式**

在 `src/styles/applications.css` 追加 `.application-detail-view`、`.application-detail__tabs`（横向排布、选中态）、`.application-detail__panel[hidden]{display:none}`、上下文条样式。使用既有 `tokens.css` 变量（`--s-*`/`--line`/`--accent-weak` 等），与既有 nav tab 视觉一致。确认 `[hidden]` 面板确实隐藏（`display:none`）。

- [ ] **Step 3: 全量测试**

Run: `npm test`
Expected: 全绿（≥ 158 + 新增详情/路由用例）。

- [ ] **Step 4: 类型 + 构建**

Run: `npx tsc --noEmit && npm run build`
Expected: 0 错误、构建成功。

- [ ] **Step 5: e2e（best-effort）**

Run: `npm run test:e2e`
Expected: 记录结果。已知 backup password-confirm 的 2 个失败为**既有问题**（与本期无关）。若 e2e 中有流程点击顶层“JD 匹配/AI 顾问”tab，则需更新为经详情页操作——但当前 e2e 无此引用（已确认），预期不新增失败。若因环境无浏览器无法运行，记录“e2e 未在本机执行”，不阻断。

- [ ] **Step 6: 提交**

```bash
git add -A
git commit -m "style(applications): detail hub sub-tab styles; phase 2a cleanup"
```

---

## Self-Review

**1. Spec 覆盖（对照 §5 修正 + §8 第 2a 期）：**
- 抽取内联详情为 `createApplicationDetail` → Task 3 ✅
- 子标签（概览/JD/简历/匹配/AI/时间线/备注）→ Task 3 Step 4 ✅（面试/复盘明确留 2b）
- 退役顶层 matching/ai + 删独立组件 + 7→5 → Task 1 ✅
- 路由 `#applications/:id/:tab` + 前进后退 → Task 2 ✅
- 上下文条「公司·职位·当前简历·阶段」→ Task 3 Step 4 ✅
- 复用已测试逻辑不重写 → Task 3/4 用"整体搬移 + 迁移规则" ✅

**2. 占位符扫描：** 大块搬移采用"引用具体函数/片段 + 迁移替换规则"（与第 1 期一致，原逻辑经测试固化）。ApplicationDetailOptions 里服务类型标注为 `any`/最小接口以避免与 ApplicationBoard 循环导入——已在 Interfaces 说明；执行者可选择从 ApplicationBoard 导出服务类型再复用，二者皆可，行为不受影响。无 TODO/TBD。

**3. 类型一致性：** `application-selected {applicationId, tab?}` 在 Task 2 定义、Task 4 消费一致；`app-navigate` detail 加 `tab?` 向后兼容（第 1 期用法不带 tab，仍合法）；`createApplicationDetail`/`ApplicationDetailElement.show(applicationId, tab?)` 在 Task 3 定义、Task 4 调用一致；`DetailTab` 七值与 TABS 一致、与子标签测试断言（overview/matching/ai/timeline）一致；`ApplicationBoardOptions` 新增 `bus?` 在 Task 4 定义并由 createApp 传入。

**4. 风险点复核：**
- Task 4 是最高风险（拆看板内联详情 + 接线路由 + 改测试）。缓解：Task 3 已让详情组件**独立测试通过**后再接线；Task 1 已先安全移除无测试的顶层页降低干扰面。
- `.application-confirm` 两用（阶段删除留看板、职位归删迁详情）——Task 4 Step 3 明确二者各留其一，避免选择器冲突。
- 归档/删除后看板刷新：Task 4 Step 4 末给出确定方案（看板加一行 `bus.on("app-data-changed", load)`）。
- e2e 无顶层 matching/ai 引用（已确认），7→5 不破 e2e。
