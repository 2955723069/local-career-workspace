# 第 1 期 · 地基期 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 877 行的 `createApp.ts` 上帝文件拆成组合根 + 独立组件，引入 `appBus` 事件总线与 `router` 模块，删除死代码，统一 `create*` 工厂写法——全程不改数据/服务层、不破坏任何现有测试。

**Architecture:** 纯前端结构重构。新增 `src/app/appBus.ts`（极薄类型化发布/订阅）与 `src/app/router.ts`（从 `setupViewNavigation` 抽出）。把内联的简历库 UI、设置 UI 分别抽成 `createResumeLibrary`、`createSettingsPage` 工厂组件，`createApp` 退化为"建外壳 + 挂载组件 + 连总线"的组合根。跨组件通信（概览计数刷新、数据变更、面试更新）从脆弱的 root 冒泡 CustomEvent 迁到 `appBus`。

**Tech Stack:** TypeScript、Vite、Vitest（+ fake-indexeddb / jsdom）、原生 DOM（无框架）。

**Spec:** `docs/superpowers/specs/2026-09-04-job-search-app-restructure-design.md`

## Global Constraints

- **不改底层**：不修改 `src/db/*`、`src/features/*` 服务层接口语义、`src/backup/*`、`src/calendar/*`、`src/settings/*`、`src/storage/*`、`src/ai/*`、`src/matching/*`、`src/parsers/*`。本期只动 `src/app/*`、`src/components/*`、必要的样式。
- **不改导航标签数量**：顶层仍为 **7 个** tab（`overview / resumes / applications / interviews / matching / ai / settings`）。收敛到 5 区是第 2 期，本期严禁改动 tab 数量与 `APP_VIEWS`。
- **保持全部现有测试绿**：`tests/app.test.ts`、`tests/resume/library-ui.test.ts`、`tests/interviews/interview-ui.test.ts`、`tests/backup/backup-ui.test.ts` 等直接调用 `createApp`；所有被测选择器（`.resume-library-status`、`.resume-file-input`、`.resume-library-list`、`#resume-library-title`、`.resume-delete-preview`、`#settings-default-timezone`、`[data-action="request-notifications"]`、`[data-action="refresh-data-preview"]`、`[data-action="open-clear-data"]` 等）在重构后必须以完全相同的结构出现在 `root` 内。
- **组件形态统一**：所有 UI 组件为 `create<Name>(documentRef: Document, options): HTMLElement` 工厂函数；禁止新增 class 组件。
- **监听生命周期**：所有 window/document 级和总线级持久监听必须接入 `createApp` 的 `AbortController` signal，二次渲染自动清理（现有机制，勿破坏）。
- **不泄漏敏感信息**：错误提示沿用现有"安全中文文案"，不得回显 `error.message`（可能含简历正文/Key）。
- **命令**：单文件测试 `npx vitest run <path>`；全量 `npm test`；类型检查 `npx tsc --noEmit`；构建 `npm run build`（内部先跑 `tsc --noEmit` 再 `vite build`）。
- **提交**：当前工作区可能报告为非 git 仓库；若 `git` 命令不可用，跳过 commit 步骤但完成该步的所有代码与验证，并在任务结束时说明"提交已跳过（非 git 环境）"。

---

## 文件结构

**新增：**
- `src/app/appBus.ts` — 类型化事件总线。
- `src/app/router.ts` — hash 路由 + 视图切换（从 `createApp` 的 `setupViewNavigation`/`navigateToView` 抽出）。
- `src/components/SettingsPage/SettingsPage.ts` — 设置页组件（偏好 + AI 接口 + 数据管理），承接原 `setupSettingsPanel`。
- `tests/app/appBus.test.ts` — appBus 单元测试。
- `tests/app/router.test.ts` — router 单元测试。

**改写：**
- `src/components/ResumeLibrary/ResumeLibrary.ts` — 删除未被引用的 `ResumeLibrary` class，替换为 `createResumeLibrary` 工厂，承接原 `createApp` 内联的 270 行简历库 UI。
- `src/app/createApp.ts` — 瘦身为组合根：建外壳骨架、创建 `appBus`、挂载各组件、经总线连接跨组件刷新；移除已抽出的简历 UI、设置 UI、导航逻辑。

**不动：** `src/main.ts`（`createApp` 的对外签名保持兼容，无需改调用方）、所有服务层与其测试。

---

## Task 1: appBus 事件总线

**Files:**
- Create: `src/app/appBus.ts`
- Test: `tests/app/appBus.test.ts`

**Interfaces:**
- Consumes: 无（纯新增，仅依赖 `AbortSignal`）。
- Produces:
  - `AppEventMap`（事件类型 → detail 类型映射）
  - `AppBus` 接口：`emit<K extends keyof AppEventMap>(type: K, detail: AppEventMap[K]): void`；`on<K extends keyof AppEventMap>(type: K, handler: (detail: AppEventMap[K]) => void): () => void`（返回取消订阅函数）
  - `createAppBus(signal?: AbortSignal): AppBus`（`signal` abort 后清空所有订阅且 `emit` 变为 no-op）

- [ ] **Step 1: 写失败测试**

创建 `tests/app/appBus.test.ts`：

```typescript
import { describe, expect, it, vi } from "vitest";
import { createAppBus } from "../../src/app/appBus";

describe("appBus", () => {
  it("delivers an emitted event to a subscriber with typed detail", () => {
    const bus = createAppBus();
    const handler = vi.fn();
    bus.on("resumes-changed", handler);
    bus.emit("resumes-changed", { count: 3 });
    expect(handler).toHaveBeenCalledWith({ count: 3 });
  });

  it("stops delivering after unsubscribe", () => {
    const bus = createAppBus();
    const handler = vi.fn();
    const off = bus.on("app-data-changed", handler);
    off();
    bus.emit("app-data-changed", undefined);
    expect(handler).not.toHaveBeenCalled();
  });

  it("delivers to multiple subscribers of the same event", () => {
    const bus = createAppBus();
    const a = vi.fn();
    const b = vi.fn();
    bus.on("interview-updated", a);
    bus.on("interview-updated", b);
    bus.emit("interview-updated", undefined);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("clears all subscriptions and ignores emits once its signal aborts", () => {
    const controller = new AbortController();
    const bus = createAppBus(controller.signal);
    const handler = vi.fn();
    bus.on("app-navigate", handler);
    controller.abort();
    bus.emit("app-navigate", { name: "resumes" });
    expect(handler).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/app/appBus.test.ts`
Expected: FAIL，报 `createAppBus` 无法从 `../../src/app/appBus` 导入（模块不存在）。

- [ ] **Step 3: 写最小实现**

创建 `src/app/appBus.ts`：

```typescript
/**
 * 极薄的类型化事件总线：组件间通信、导航切换、跨视图刷新统一走它，
 * 取代脆弱易漏的 root 冒泡 CustomEvent。订阅生命周期由可选 signal 托管。
 */
export type AppEventMap = {
  "app-navigate": { name: string; applicationId?: string };
  "app-data-changed": void;
  "resumes-changed": { count: number };
  "interview-updated": void;
  "review-saved": void;
};

export interface AppBus {
  emit<K extends keyof AppEventMap>(type: K, detail: AppEventMap[K]): void;
  on<K extends keyof AppEventMap>(
    type: K,
    handler: (detail: AppEventMap[K]) => void,
  ): () => void;
}

export function createAppBus(signal?: AbortSignal): AppBus {
  const handlers = new Map<string, Set<(detail: unknown) => void>>();
  signal?.addEventListener("abort", () => handlers.clear());
  return {
    emit(type, detail) {
      if (signal?.aborted) return;
      handlers.get(type as string)?.forEach((handler) => handler(detail));
    },
    on(type, handler) {
      const set = handlers.get(type as string) ?? new Set();
      set.add(handler as (detail: unknown) => void);
      handlers.set(type as string, set);
      return () => set.delete(handler as (detail: unknown) => void);
    },
  };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/app/appBus.test.ts`
Expected: PASS（4 个用例全过）。

- [ ] **Step 5: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无错误。

- [ ] **Step 6: 提交**

```bash
git add src/app/appBus.ts tests/app/appBus.test.ts
git commit -m "feat(app): add typed appBus event bus"
```

---

## Task 2: 抽出 createResumeLibrary 组件并接入 createApp

把 `createApp.ts` 内联的简历库 UI（现约 `createApp.ts:112-162` 的骨架 HTML + `310-584` 的逻辑）整体搬进 `src/components/ResumeLibrary/ResumeLibrary.ts`，删除同文件里未被引用的 `ResumeLibrary` class 死代码，并让 `createApp` 通过挂载点使用它。跨组件的简历计数刷新改由 `appBus` 承载。

**Files:**
- Modify(改写整文件): `src/components/ResumeLibrary/ResumeLibrary.ts`
- Modify: `src/app/createApp.ts`（移除内联简历 UI，改为挂载 `createResumeLibrary`；`.resume-summary-count` 更新改为订阅 `resumes-changed`）
- Test: `tests/resume/library-ui.test.ts`（现有，不改，作为回归护网）、`tests/app.test.ts`（现有，不改）

**Interfaces:**
- Consumes: `createAppBus`/`AppBus`（Task 1）；`ResumeLibraryUiService`（现有于 `createApp.ts`，本任务把它移动/导出到组件文件）；`ResumeIngestionService`、`ResumeIngestionError`（现有）。
- Produces:
  - `ResumeLibraryUiService` 接口（从 createApp 迁至此文件并 `export`；字段与现状一致：`search/getResumeText/getDownloadData/exportConfirmedText/getResume/updateMetadata/previewDelete/deleteResume/confirmText/getDefaultResume/setDefaultResume`）
  - `interface ResumeLibraryOptions { resumeLibrary?: ResumeLibraryUiService; resumeIngestion?: ResumeIngestionService; applicationService?: { listApplications(): Promise<any[]> }; bus?: AppBus; signal?: AbortSignal }`
  - `createResumeLibrary(documentRef: Document, options?: ResumeLibraryOptions): HTMLElement`（返回 `<section class="resume-library">` 元素，内部结构与选择器与现状**逐字一致**）

- [ ] **Step 1: 写失败测试（组件可独立渲染）**

在 `tests/resume/library-ui.test.ts` 顶部 `import` 区新增一行（文件其余不动）：

```typescript
import { createResumeLibrary } from "../../src/components/ResumeLibrary/ResumeLibrary";
```

在该文件的 `describe("resume library UI", () => {` 内追加一个用例：

```typescript
  it("createResumeLibrary renders the library section standalone with core controls", () => {
    const section = createResumeLibrary(document);
    expect(section.matches("section.resume-library")).toBe(true);
    expect(section.querySelector("#resume-library-title")?.textContent).toContain("简历版本库");
    expect(section.querySelector(".resume-file-input")).toBeTruthy();
    expect(section.querySelector("#resume-search")).toBeTruthy();
    expect(section.querySelector(".resume-library-list")).toBeTruthy();
    expect(section.querySelector(".resume-delete-preview")?.hasAttribute("hidden")).toBe(true);
  });
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/resume/library-ui.test.ts`
Expected: FAIL，报 `createResumeLibrary` 不存在（当前该文件仍是 `ResumeLibrary` class）。

- [ ] **Step 3: 改写 ResumeLibrary.ts 为工厂组件**

完整替换 `src/components/ResumeLibrary/ResumeLibrary.ts` 内容为下面结构（把 createApp 内联逻辑搬入，删除旧 class）。关键点：组件自建 `<section class="resume-library">` 根元素并 `innerHTML` 填充**与 createApp 现有骨架逐字相同**的内部标记；把原来散落的 `render / renderUsageOverview / 各 addEventListener` 逻辑整体迁入；凡原本 `root.dispatchEvent(new CustomEvent("app-data-changed", {bubbles:true}))` 处改为 `options.bus?.emit("app-data-changed", undefined)`；`render()` 末尾用 `options.bus?.emit("resumes-changed", { count: resumes.length })` 广播计数（**不再直接写 `.resume-summary-count`**，该元素在概览面板、不属于本组件）。

```typescript
import type { ResumeIngestionService } from "../../features/resumes/ingestion";
import { ResumeIngestionError } from "../../features/resumes/ingestion";
import type { AppBus } from "../../app/appBus";

export interface ResumeLibraryUiService {
  search(query?: string): Promise<any[]>;
  getResumeText(resumeId: string, kind?: "extracted" | "confirmed" | "manual"): Promise<any>;
  getDownloadData(resumeId: string): Promise<{ blob: Blob; fileName: string }>;
  exportConfirmedText(resumeId: string): Promise<Blob>;
  getResume(resumeId: string): Promise<any>;
  updateMetadata(resumeId: string, patch: { name?: string; tags?: string[] }): Promise<any>;
  previewDelete(resumeId: string): Promise<any>;
  deleteResume(resumeId: string, options?: { confirmed?: boolean }): Promise<void>;
  confirmText(resumeId: string, text: string): Promise<any>;
  getDefaultResume(): Promise<any>;
  setDefaultResume(resumeId: string | null): Promise<void>;
}

export interface ResumeLibraryOptions {
  resumeLibrary?: ResumeLibraryUiService;
  resumeIngestion?: ResumeIngestionService;
  applicationService?: { listApplications(): Promise<any[]> };
  bus?: AppBus;
  signal?: AbortSignal;
}

export function createResumeLibrary(
  documentRef: Document,
  options: ResumeLibraryOptions = {},
): HTMLElement {
  const root = documentRef.createElement("section");
  root.className = "resume-library";
  root.setAttribute("aria-labelledby", "resume-library-title");
  root.innerHTML = `
    <div class="section-heading">
      <div>
        <p class="section-label">资料</p>
        <h2 id="resume-library-title">简历版本库</h2>
      </div>
      <label class="resume-upload-button">
        <span>上传简历</span>
        <input class="resume-file-input" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" />
      </label>
    </div>
    <div class="resume-library-toolbar">
      <label for="resume-search">搜索简历</label>
      <input id="resume-search" type="search" placeholder="按名称、文件名或标签搜索" autocomplete="off" />
      <button type="button" class="resume-refresh" aria-label="刷新简历列表">刷新</button>
    </div>
    <div class="resume-library-status" role="status" aria-live="polite" aria-atomic="true">暂无简历版本</div>
    <div class="resume-library-list" aria-live="polite"></div>
    <div class="resume-editor" hidden>
      <label for="resume-text-editor">确认简历文本</label>
      <textarea id="resume-text-editor" rows="12"></textarea>
      <div class="resume-editor__actions">
        <button type="button" data-action="confirm-text">确认文本</button>
        <button type="button" data-action="cancel-text">取消</button>
      </div>
    </div>
    <div class="resume-metadata-editor" hidden>
      <h3>编辑版本信息</h3>
      <label for="resume-name-editor">版本名称</label>
      <input id="resume-name-editor" type="text" />
      <label for="resume-tags-editor">标签（用逗号分隔）</label>
      <input id="resume-tags-editor" type="text" />
      <div class="resume-editor__actions">
        <button type="button" data-action="save-metadata">保存</button>
        <button type="button" data-action="cancel-metadata">取消</button>
      </div>
    </div>
    <div class="resume-delete-preview" role="dialog" aria-modal="true" aria-labelledby="resume-delete-title" hidden>
      <h3 id="resume-delete-title">确认删除简历</h3>
      <p class="resume-delete-summary"></p>
      <div class="resume-editor__actions">
        <button type="button" data-action="confirm-delete">确认删除</button>
        <button type="button" data-action="cancel-delete">取消</button>
      </div>
    </div>
    <section class="resume-usage-overview" aria-labelledby="resume-usage-title">
      <h3 id="resume-usage-title">公司 ↔ 简历对照</h3>
      <div class="resume-usage-table"></div>
    </section>
  `;

  const status = root.querySelector<HTMLElement>(".resume-library-status");
  const list = root.querySelector<HTMLElement>(".resume-library-list");
  const search = root.querySelector<HTMLInputElement>("#resume-search");
  const fileInput = root.querySelector<HTMLInputElement>(".resume-file-input");
  const refresh = root.querySelector<HTMLButtonElement>(".resume-refresh");
  const editor = root.querySelector<HTMLElement>(".resume-editor");
  const editorText = root.querySelector<HTMLTextAreaElement>("#resume-text-editor");
  const metadataEditor = root.querySelector<HTMLElement>(".resume-metadata-editor");
  const nameEditor = root.querySelector<HTMLInputElement>("#resume-name-editor");
  const tagsEditor = root.querySelector<HTMLInputElement>("#resume-tags-editor");
  const deletePreview = root.querySelector<HTMLElement>(".resume-delete-preview");
  const deleteSummary = root.querySelector<HTMLElement>(".resume-delete-summary");
  const usageTable = root.querySelector<HTMLElement>(".resume-usage-table");
  let editingResumeId: string | undefined;
  let metadataResumeId: string | undefined;
  let pendingDeleteId: string | undefined;
  let deleteReturnFocus: HTMLElement | undefined;

  // ↓↓↓ 把 createApp.ts 现有的以下函数体与事件绑定逐字迁入（仅改动见下方“迁移替换规则”）：
  //   - renderUsageOverview(resumes)
  //   - render(query)
  //   - search/refresh/fileInput 的监听
  //   - list 的 click 委托（preview/download/export/edit-metadata/retry/delete/set-default/unset-default）
  //   - metadataEditor / deletePreview（含 keydown 焦点陷阱与 Escape）/ editor 的监听
  //   - 末尾 void render(); 与 app-data-cleared 监听

  return root;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character] ?? character);
}
```

**迁移替换规则（把 createApp 逻辑搬入时逐条套用）：**

1. 所有对 `options.resumeLibrary` / `options.resumeIngestion` / `options.applicationService` 的引用保持不变（它们现在来自 `ResumeLibraryOptions`）。
2. 删除 `render()` 中这一行（`.resume-summary-count` 属概览面板，本组件不再触碰）：
   ```typescript
   if (resumeSummary) resumeSummary.textContent = `${resumes.length} 份简历`;
   ```
   在 `render()` 成功分支的末尾（`await renderUsageOverview(resumes);` 之后）追加：
   ```typescript
   options.bus?.emit("resumes-changed", { count: resumes.length });
   ```
   在 `render()` 的 catch 分支里，把原 `if (resumeSummary) resumeSummary.textContent = "简历列表不可用";` 替换为：
   ```typescript
   options.bus?.emit("resumes-changed", { count: 0 });
   ```
3. 所有 `root.dispatchEvent(new CustomEvent("app-data-changed", { bubbles: true }))` → `options.bus?.emit("app-data-changed", undefined)`。
4. 上传监听里 `const uploadButton = root.querySelector<HTMLElement>(".resume-upload-button");` 的 `root` 现在就是组件根，保持不变。
5. `documentRef.defaultView?.addEventListener("app-data-cleared", () => void render(search?.value ?? ""), { signal: options.signal });` 保持，`signal` 来自 `options.signal`。
6. `triggerDownload` 与 `resumeUploadErrorMessage`：若被本组件使用，则把这两个函数一并从 createApp 迁入本文件（`resumeUploadErrorMessage` 依赖 `ResumeIngestionError`，已在顶部 import）。createApp 侧若不再使用则一并删除（见 Task 5 收尾核对）。
7. `escapeHtml` 已在文件底部提供，删除重复定义。

- [ ] **Step 4: 运行组件级测试确认通过**

Run: `npx vitest run tests/resume/library-ui.test.ts`
Expected: FAIL（此时 `createApp` 还没挂载新组件、且旧内联 UI 仍在 → 现有用例可能重复渲染）。**先只看新用例 `createResumeLibrary renders the library section standalone` 是否 PASS**；其余用例在 Step 5 接入后再整体验证。若新用例 PASS 即可进入 Step 5。

- [ ] **Step 5: 在 createApp 中挂载组件、删除内联简历 UI**

在 `src/app/createApp.ts`：

1. 顶部新增导入：
   ```typescript
   import { createResumeLibrary } from "../components/ResumeLibrary/ResumeLibrary";
   import { createAppBus } from "./appBus";
   ```
   删除 createApp 内对 `ResumeLibraryUiService` 的本地定义（改为从组件文件导入类型，或直接删除——createApp 不再需要它）。
2. 在 `root.innerHTML` 骨架里，把 `#view-resumes` 面板内那段 `<section class="resume-library">…</section>` 整体替换为单个挂载点：
   ```html
   <section id="view-resumes" class="app-view" data-view-panel="resumes" role="tabpanel" aria-labelledby="resume-library-title" hidden>
     <div class="resume-library-mount"></div>
   </section>
   ```
3. 在函数体靠前处创建总线（在 `signal` 之后）：
   ```typescript
   const bus = createAppBus(signal);
   ```
4. 挂载简历组件（放在其它 mount 附近）：
   ```typescript
   const resumeMount = root.querySelector<HTMLElement>(".resume-library-mount");
   if (resumeMount) {
     resumeMount.replaceWith(createResumeLibrary(documentRef, {
       resumeLibrary: options.resumeLibrary,
       resumeIngestion: options.resumeIngestion,
       applicationService: options.applicationService,
       bus,
       signal,
     }));
   }
   ```
5. 删除 createApp 中已迁走的全部简历逻辑：`render`/`renderUsageOverview`/所有 `resume*` DOM 查询与监听（原约 `310-584` 行区块），以及 `void render();` 与该处的 `app-data-cleared` 监听。
6. 概览计数：新增对 `.resume-summary-count` 的总线订阅（放在 `refreshOverview` 附近）：
   ```typescript
   const resumeSummary = root.querySelector<HTMLElement>(".resume-summary-count");
   bus.on("resumes-changed", ({ count }) => {
     if (resumeSummary) resumeSummary.textContent = `${count} 份简历`;
   });
   ```
   概览初始文案 `0 份简历` 已写在骨架 HTML 里（`app.test.ts` 依赖），保持不动；组件首次 `render()` 会通过总线刷新为真实值。
7. 若 `triggerDownload` / `resumeUploadErrorMessage` 已迁至组件且 createApp 不再引用，删除 createApp 内的这两个函数定义，避免 `tsc` 报未使用。

- [ ] **Step 6: 运行简历相关测试确认通过**

Run: `npx vitest run tests/resume/library-ui.test.ts tests/app.test.ts`
Expected: PASS。重点确认 `app.test.ts` 的 "renders a perceptible local-ready state"（`0 份简历`）、两个简历上传错误用例、`re-enables the resume upload input`，以及 `library-ui.test.ts` 全部用例。

- [ ] **Step 7: 全量测试 + 类型检查**

Run: `npm test && npx tsc --noEmit`
Expected: 全绿、无类型错误。

- [ ] **Step 8: 提交**

```bash
git add src/components/ResumeLibrary/ResumeLibrary.ts src/app/createApp.ts tests/resume/library-ui.test.ts
git commit -m "refactor(resumes): extract createResumeLibrary, drop dead class, wire via appBus"
```

---

## Task 3: 抽出 createSettingsPage 组件并接入 createApp

把 `createApp.ts` 里 `#view-settings` 面板的骨架与 `setupSettingsPanel(...)`（偏好表单 + 数据管理 + AI 接口设置，约 `591-761` 行）整体搬进新组件。备份面板挂载（`createBackupPanel`）也移入设置组件内部，使"设置与备份"聚为一个组件。

**Files:**
- Create: `src/components/SettingsPage/SettingsPage.ts`
- Modify: `src/app/createApp.ts`（移除设置骨架与 `setupSettingsPanel`/`notificationStatus`，改为挂载 `createSettingsPage`）
- Test: `tests/app.test.ts`（现有 settings 用例作回归）、`tests/backup/backup-ui.test.ts`（现有，作回归）

**Interfaces:**
- Consumes: `getPreferences/savePreferences/getDefaultReminders/getDefaultTimezone`（`../../settings/preferences`）、`clearAllData/previewDataClear/CLEAR_CONFIRMATION_WORD`（`../../storage/dataManagement`）、`getAiSettings/saveAiSettings/clearAiSettings/validateAiSettings`（`../../settings/secrets`）、`createOpenAiClient`（`../../ai/client`）、`AiAdvisorService`（`../../features/ai/aiAdvisorService`）、`createBackupPanel/BackupPanelService`（`../../features/backup/BackupPanel`）、`AppBus`（Task 1）。
- Produces:
  - `interface SettingsPageOptions { database?: IDBDatabase; backupService?: BackupPanelService; bus?: AppBus; onAiSettingsChanged?: (service: AiAdvisorService | undefined) => void; signal?: AbortSignal }`
  - `createSettingsPage(documentRef: Document, options?: SettingsPageOptions): HTMLElement`（返回含 `.settings-panel`/`.ai-settings-panel`/`.data-management-panel` 与已挂载备份面板的容器元素；所有被测选择器逐字保留）

- [ ] **Step 1: 写失败测试**

创建 `tests/settings/settings-page.test.ts`：

```typescript
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/settings/settings-page.test.ts`
Expected: FAIL，`createSettingsPage` 模块不存在。

- [ ] **Step 3: 创建 SettingsPage.ts**

创建 `src/components/SettingsPage/SettingsPage.ts`：组件根为一个 `<div class="settings-page">` 容器，`innerHTML` 使用 createApp 现有 `#view-settings` 内部的**逐字**标记（`.settings-panel` 偏好表单、`.ai-settings-panel`、`.data-management-panel` 及其对话框），末尾追加 `<div class="backup-panel-mount"></div>`。随后把 `createApp.ts` 现有的 `setupSettingsPanel` 与 `notificationStatus` 两个函数体整体迁入本文件（`setupSettingsPanel` 改为在组件根 `root` 上查询，不再从外部 root 查找），并在组件末尾挂载备份面板：

```typescript
import { getPreferences, savePreferences, getDefaultReminders, getDefaultTimezone } from "../../settings/preferences";
import { clearAllData, previewDataClear, CLEAR_CONFIRMATION_WORD } from "../../storage/dataManagement";
import { getAiSettings, saveAiSettings, clearAiSettings, validateAiSettings } from "../../settings/secrets";
import { createOpenAiClient } from "../../ai/client";
import { AiAdvisorService } from "../../features/ai/aiAdvisorService";
import { createBackupPanel, type BackupPanelService } from "../../features/backup/BackupPanel";
import type { AppBus } from "../../app/appBus";

export interface SettingsPageOptions {
  database?: IDBDatabase;
  backupService?: BackupPanelService;
  bus?: AppBus;
  onAiSettingsChanged?: (service: AiAdvisorService | undefined) => void;
  signal?: AbortSignal;
}

export function createSettingsPage(
  documentRef: Document,
  options: SettingsPageOptions = {},
): HTMLElement {
  const root = documentRef.createElement("div");
  root.className = "settings-page";
  root.innerHTML = `
    <section class="settings-panel" aria-labelledby="backup-page-title">
      <div class="section-heading"><div><p class="section-label">偏好与隐私</p><h2 id="backup-page-title">设置</h2></div></div>
      <form class="settings-preferences" data-form="settings-preferences">
        <label for="settings-default-timezone">默认时区<input id="settings-default-timezone" name="defaultTimezone" required /></label>
        <fieldset><legend>默认提醒</legend><label><input type="checkbox" name="reminderInApp" />应用内</label><label><input type="checkbox" name="reminderBrowser" />浏览器通知</label><label>提前分钟数<input name="reminderOffset" type="number" min="1" value="30" /></label></fieldset>
        <div class="settings-actions"><button type="submit">保存偏好</button><button type="button" data-action="request-notifications" data-variant="secondary">启用浏览器通知</button></div>
      </form>
      <p class="settings-status" role="status" aria-live="polite"></p>
    </section>
    <section class="settings-panel ai-settings-panel" aria-labelledby="ai-settings-title">
      <div class="section-heading"><div><p class="section-label">可选服务</p><h2 id="ai-settings-title">AI 接口</h2></div></div>
      <form class="ai-settings-form" data-form="ai-settings">
        <label for="ai-api-url">API 地址<input id="ai-api-url" name="apiUrl" type="url" placeholder="https://api.openai.com/v1" required /></label>
        <label for="ai-model">模型名<input id="ai-model" name="model" required /></label>
        <label for="ai-api-key">API Key<input id="ai-api-key" name="apiKey" type="password" autocomplete="new-password" placeholder="保存后仅显示已配置" required /></label>
        <label for="ai-organization-id">组织 ID<input id="ai-organization-id" name="organizationId" /></label>
        <label for="ai-custom-headers">自定义请求头<textarea id="ai-custom-headers" name="customHeaders" rows="3" placeholder="X-Header: value"></textarea></label>
        <div class="settings-actions"><button type="button" data-action="test-ai-settings" data-variant="secondary">测试连接</button><button type="submit">保存 AI 设置</button><button type="button" data-action="clear-ai-settings" class="danger-action">清除 AI 设置</button></div>
      </form>
      <p class="ai-settings-status" role="status" aria-live="polite">尚未配置 AI</p>
    </section>
    <section class="data-management-panel" aria-labelledby="data-management-title">
      <div class="section-heading"><div><p class="section-label">本地存储</p><h2 id="data-management-title">数据管理</h2></div></div>
      <p class="data-preview-summary">点击查看当前浏览器中的本地记录数量。</p>
      <div class="settings-actions"><button type="button" data-action="refresh-data-preview" data-variant="secondary">查看数据统计</button><button type="button" data-action="open-clear-data" class="danger-action">清除全部数据</button></div>
      <div class="data-clear-dialog" role="dialog" aria-modal="true" aria-labelledby="clear-data-title" hidden><h3 id="clear-data-title">确认清除本地数据</h3><p class="data-clear-summary"></p><label for="clear-data-confirmation">输入 DELETE 确认<input id="clear-data-confirmation" autocomplete="off" /></label><div class="settings-actions"><button type="button" data-action="confirm-clear-data" class="danger-action">确认清除</button><button type="button" data-action="cancel-clear-data" data-variant="secondary">取消</button></div></div>
    </section>
    <div class="backup-panel-mount"></div>
  `;

  setupSettingsPanel(root, documentRef, options);

  const backupMount = root.querySelector<HTMLElement>(".backup-panel-mount");
  if (backupMount) {
    backupMount.replaceWith(createBackupPanel(documentRef, { backupService: options.backupService }));
  }

  return root;
}

// setupSettingsPanel、notificationStatus 从 createApp.ts 逐字迁入此处。
```

**迁移替换规则：**

1. `setupSettingsPanel` 的签名改为 `function setupSettingsPanel(root: HTMLElement, documentRef: Document, options: SettingsPageOptions): void`；内部 `database` 用 `options.database`，`onAiSettingsChanged` 用 `options.onAiSettingsChanged`。所有原来 `root.ownerDocument.defaultView` 的用法可保留，或改用传入的 `documentRef.defaultView`（等价）。
2. 原 `setupSettingsPanel` 里 `root.dispatchEvent(new CustomEvent("app-data-changed", { bubbles: true }))`（清库成功后）→ `options.bus?.emit("app-data-changed", undefined)`。`root.ownerDocument.defaultView?.dispatchEvent(new Event("app-data-cleared"))` 保持不变（这是 window 级、被简历/仪表盘组件监听）。
3. 现有对 `.settings-panel` 的 `querySelector` 兜底 `?? root` 逻辑保留，`root` 现在即组件容器。
4. `notificationStatus()` 原样迁入（纯函数）。

- [ ] **Step 4: 运行组件测试确认通过**

Run: `npx vitest run tests/settings/settings-page.test.ts`
Expected: PASS。

- [ ] **Step 5: 在 createApp 中挂载设置组件、删除内联设置 UI**

在 `src/app/createApp.ts`：

1. 顶部新增导入 `import { createSettingsPage } from "../components/SettingsPage/SettingsPage";`；删除已迁走符号的导入（`getPreferences` 等 preferences/dataManagement/secrets/ai client/AiAdvisorService/createBackupPanel，**仅当 createApp 其余处不再使用**——注意 `AiAdvisorService` 类型仍用于 `onAiSettingsChanged` 签名，保留其 `import type`）。
2. 把 `#view-settings` 面板内部整段替换为挂载点：
   ```html
   <section id="view-settings" class="app-view" data-view-panel="settings" role="tabpanel" aria-labelledby="backup-page-title" hidden>
     <div class="settings-page-mount"></div>
   </section>
   ```
3. 删除 createApp 中原 `.backup-panel-mount` 的挂载块（已并入设置组件）。
4. 用组件挂载替换原 `setupSettingsPanel(root, options.database, ...)` 调用：
   ```typescript
   const settingsMount = root.querySelector<HTMLElement>(".settings-page-mount");
   if (settingsMount) {
     settingsMount.replaceWith(createSettingsPage(documentRef, {
       database: options.database,
       backupService: options.backupService,
       bus,
       onAiSettingsChanged: (service) => {
         aiPage?.dispatchEvent(new CustomEvent("ai-service-changed", { detail: service }));
         options.onAiSettingsChanged?.(service);
       },
       signal,
     }));
   }
   ```
   （`aiPage` 变量在此之前已定义，保持原有对 AiPage 的通知。）
5. 从 createApp 删除 `setupSettingsPanel` 与 `notificationStatus` 函数定义（已迁出）。

- [ ] **Step 6: 运行设置与备份相关测试确认通过**

Run: `npx vitest run tests/app.test.ts tests/backup/backup-ui.test.ts tests/settings/settings-page.test.ts`
Expected: PASS。重点确认 `app.test.ts` 的 "provides local preference, notification, and data-management controls in settings"。

- [ ] **Step 7: 全量测试 + 类型检查**

Run: `npm test && npx tsc --noEmit`
Expected: 全绿、无类型错误（尤其确认无"未使用导入/变量"报错）。

- [ ] **Step 8: 提交**

```bash
git add src/components/SettingsPage/SettingsPage.ts src/app/createApp.ts tests/settings/settings-page.test.ts
git commit -m "refactor(settings): extract createSettingsPage component from createApp"
```

---

## Task 4: 抽出 router 模块

把 `createApp.ts` 的 `setupViewNavigation` 与 `navigateToView`、常量 `APP_VIEWS`/类型 `AppView` 抽到 `src/app/router.ts`，导航事件经 `appBus` 的 `app-navigate` 传递。DOM 行为（7 tab、hidden 切换、aria-selected、hash push/replace、hashchange/popstate、初始视图回退 overview）**逐字保持**，`tests/app.test.ts` 的三个导航用例是回归护网。

**Files:**
- Create: `src/app/router.ts`
- Modify: `src/app/createApp.ts`（移除导航函数，改为调用 `setupRouter`；`navigateToView` 调用点改为 `bus.emit("app-navigate", ...)`）
- Test: `tests/app/router.test.ts`、`tests/app.test.ts`（现有回归）

**Interfaces:**
- Consumes: `AppBus`（Task 1）。
- Produces:
  - `APP_VIEWS`（`readonly ["overview","resumes","applications","interviews","matching","ai","settings"]`）、`type AppView`
  - `interface RouterOptions { root: HTMLElement; documentRef: Document; bus: AppBus; signal?: AbortSignal }`
  - `setupRouter(options: RouterOptions): void`（内部注册 tab 点击、`bus.on("app-navigate", …)`、hashchange/popstate，并渲染初始视图）
  - `isAppView(name: string): name is AppView`

- [ ] **Step 1: 写失败测试**

创建 `tests/app/router.test.ts`：

```typescript
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/app/router.test.ts`
Expected: FAIL，`setupRouter`/`isAppView` 模块不存在。

- [ ] **Step 3: 创建 router.ts**

创建 `src/app/router.ts`，把现有 `setupViewNavigation` 的实现迁入并参数化。核心保持不变，仅：`showView` 内部触发 `root.dispatchEvent(new CustomEvent("app-view-changed", { detail: name }))` 保留（供组件监听），并把 `app-navigate` 的来源从"监听 root 上的 CustomEvent"改为"订阅 `bus.on('app-navigate', …)`"。

```typescript
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
```

- [ ] **Step 4: 运行 router 测试确认通过**

Run: `npx vitest run tests/app/router.test.ts`
Expected: PASS（3 个用例）。

- [ ] **Step 5: 在 createApp 中改用 router，删除旧导航代码**

在 `src/app/createApp.ts`：

1. 顶部新增 `import { setupRouter, isAppView, type AppView } from "./router";`。
2. 删除 createApp 文件底部的 `APP_VIEWS`、`AppView` 类型、`navigateToView`、`setupViewNavigation` 定义。
3. 把原 `navigateToView(root, documentRef, "interviews")` 等调用改为 `bus.emit("app-navigate", { name: "interviews" })`；`navigateToView(root, documentRef, "ai", applicationId)`（MatchingPage 的 `onOpenAi`）改为 `bus.emit("app-navigate", { name: "ai", applicationId })`；`navigateToView(root, documentRef, "settings")`（AiPage 的 `onOpenSettings`）改为 `bus.emit("app-navigate", { name: "settings" })`。
4. 把文件末尾 `setupViewNavigation(root, documentRef, signal);` 替换为：
   ```typescript
   setupRouter({ root, documentRef, bus, signal });
   ```
   `setupRouter` 必须在所有子组件挂载之后调用（保持它渲染初始视图时组件已就位）。
5. 若 `isAppView`/`AppView` 在 createApp 已无其它用途，去掉未使用导入（只保留实际用到的）。

- [ ] **Step 6: 运行导航回归测试确认通过**

Run: `npx vitest run tests/app.test.ts`
Expected: PASS。重点：`starts on the overview page and keeps other pages hidden`（7 tabs、overview 可见）、`switches pages without hiding the application board and supports hash deep links`（点击 resumes → hash 变 `#resumes`、applications 隐藏）。

- [ ] **Step 7: 全量测试 + 类型检查**

Run: `npm test && npx tsc --noEmit`
Expected: 全绿。特别复核 `tests/interviews/interview-ui.test.ts` 里 "opens the review from the dashboard 待复盘 entry"——它依赖从仪表盘触发后切到 interviews 视图；确认 `interview-selected` 转发链路仍走原 root 冒泡（本期未迁该事件），而视图切换由 `bus.emit("app-navigate", {name:"interviews"})` 完成。

- [ ] **Step 8: 提交**

```bash
git add src/app/router.ts src/app/createApp.ts tests/app/router.test.ts
git commit -m "refactor(app): extract router module, route navigation through appBus"
```

---

## Task 5: createApp 组合根收尾与整期验证

确认 `createApp.ts` 已退化为组合根，跨组件刷新链路完整，全期测试/类型/构建三绿。

**Files:**
- Modify: `src/app/createApp.ts`（仅清理与核对，无新逻辑）
- Test: 全量

**Interfaces:**
- Consumes: 前四个任务的全部产物。
- Produces: 无新导出；`createApp(documentRef, options)` 对外签名与 `main.ts` 调用保持兼容。

- [ ] **Step 1: 核对 createApp 结构**

通读 `src/app/createApp.ts`，确认它现在只包含：外壳 `innerHTML` 骨架（topbar / nav / 各 view 面板 + 挂载点）、`AbortController` + `bus` 创建、各组件挂载（application-board / dashboard / interview-calendar / interview-review / resume-library / settings-page / matching-page / ai-page）、跨组件事件接线（见 Step 2）、`escapeHtml`（若概览仍用）、`setupRouter` 调用。**不应再有**简历 render、设置 setup、导航实现、`navigateToView`、`setupViewNavigation`、`setupSettingsPanel`、`notificationStatus`、死代码 class。目标行数 ≈150–200。

- [ ] **Step 2: 核对跨组件刷新链路改用 bus**

确认以下三处跨视图刷新已从 root 冒泡迁到 `bus`（若前序任务未迁则在此迁移）：

```typescript
// interview-updated / review-saved 仍由 InterviewCalendar/InterviewReview 以 root 冒泡 CustomEvent 发出（本期不改这些组件），
// createApp 侧统一在 root 上接住后转成总线事件，让 dashboard 与概览刷新订阅：
root.addEventListener("interview-updated", () => bus.emit("interview-updated", undefined), { signal });
root.addEventListener("review-saved", () => bus.emit("review-saved", undefined), { signal });

bus.on("interview-updated", () => { dashboard?.dispatchEvent(new Event("interview-updated")); void refreshOverview(); });
bus.on("review-saved", () => dashboard?.dispatchEvent(new Event("review-saved")));
bus.on("app-data-changed", () => void refreshOverview());
```

`refreshOverview` 保留在 createApp（读取 application/interview 计数、更新 `.application-summary-count`/`.interview-summary-count`）。`.resume-summary-count` 由 Task 2 的 `bus.on("resumes-changed", …)` 更新。`documentRef.defaultView` 上的 `app-data-cleared` 由各组件自行监听（简历组件已接、仪表盘已接），createApp 不重复处理。初始 `void refreshOverview();` 保留。

- [ ] **Step 3: 全量测试**

Run: `npm test`
Expected: 全绿，数量不少于重构前（重构前基线 148；本期新增 appBus/router/settings-page 用例后应 ≥ 148 + 新增数）。

- [ ] **Step 4: 类型检查**

Run: `npx tsc --noEmit`
Expected: 0 错误，无未使用导入/变量告警级错误。

- [ ] **Step 5: 生产构建**

Run: `npm run build`
Expected: 构建成功（`tsc --noEmit` 通过后 `vite build` 输出 `✓ built`）。

- [ ] **Step 6: 端到端冒烟（若本机可跑）**

Run: `npm run test:e2e`
Expected: 现有 e2e 全过；若本机无 Playwright 浏览器依赖导致无法运行，记录"e2e 未在本机执行"，不阻断本期（e2e 主流程扩展在后续期完成）。

- [ ] **Step 7: 提交**

```bash
git add src/app/createApp.ts
git commit -m "refactor(app): reduce createApp to a composition root"
```

---

## Self-Review

**1. Spec 覆盖（对照 spec 第 8 节"第 1 期：地基期"）：**
- `appBus` → Task 1 ✅
- `router` 抽出 → Task 4 ✅
- `createApp` 拆分：抽简历组件 → Task 2 ✅；抽设置组件 → Task 3 ✅；删死代码（`ResumeLibrary` class）→ Task 2 Step 3 ✅；统一 `create*` 工厂写法 → Task 2/3（新组件皆为工厂）✅；createApp 退化为组合根 → Task 5 ✅
- 保留数据/服务层不动 → Global Constraints 明确 ✅
- 不收敛 tab（第 2 期才做）→ Global Constraints 明确、Task 4 保持 7 tab ✅

**2. 占位符扫描：** 无 TBD/TODO；迁移类步骤给出了"逐字迁入 + 明确替换规则"，而非"类似上文"。Task 2 Step 3 因简历逻辑体量大，采用"骨架给全 + 迁移替换规则逐条列出"的方式（原逻辑已在 createApp 中存在且经测试固化，规则精确指明每处改动点），非占位。✅

**3. 类型一致性：** `AppBus.emit/on`、`AppEventMap` 键在 Task 1 定义，Task 2/3/4/5 引用的键（`app-navigate`/`app-data-changed`/`resumes-changed`/`interview-updated`/`review-saved`）均在映射内；`resumes-changed` detail 为 `{ count }`，Task 2 emit 与 Task 5 on 一致；`setupRouter` 签名（Task 4 定义）与 createApp 调用（Task 4 Step 5）一致；`createResumeLibrary`/`createSettingsPage` 工厂签名在各自 Produces 与挂载调用处一致。✅

**4. 风险点复核：** Task 2 Step 4 特意说明"新组件用例先绿、整体回归留到接入后"，避免执行者误判中间态失败。Task 4 Step 7 特意点名 dashboard→interviews 复盘链路的验证，防止导航迁移回退已修复的 bug。✅
