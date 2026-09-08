# 第 4a 期 · 看板拖拽换列 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在职位看板上支持把职位卡从一列拖到另一列即改阶段（写 `stage-changed` 时间线），并新增键盘可达的「移动到…」下拉作为无障碍兜底。

**Architecture:** 纯前端交互层改动，全部落在 `ApplicationBoard`。用**闭包变量 `draggingId`** 记住 `dragstart` 拖起的职位（不依赖 `DataTransfer` 载荷——jsdom 不填充它，闭包法可单元测试），`drop` 时读取目标列的 `data-stage-id`，复用**已有** `applicationService.changeStage(id, stageId)`（该服务已写 `stage-changed` 时间线，见 `applicationService.ts:425-435`）→ 重新 `listApplications()` → `renderApplications()`。拖拽监听委托在**常驻的 `board` 元素**上（不在每次重渲染就销毁的卡片上），命中用 `closest()`。「移动到…」`<select>` 挂在每张卡的操作区，`change` 走同一条换阶段路径。不改服务层、不改数据 schema。

**Tech Stack:** TypeScript、Vite、Vitest（jsdom/fake-indexeddb，通过 `createApp` 装配）、原生 DOM、HTML5 drag-and-drop、既有 `tokens.css` 设计令牌、Playwright e2e。

**Spec:** `docs/superpowers/specs/2026-09-04-job-search-app-restructure-design.md`（§7 第 1 项「看板拖拽换列」；§8 第 4 期）

## Global Constraints

- **不改底层**：不修改 `src/db/*`、`src/features/*`（含 `applicationService.changeStage` 及其时间线写入）与任何服务接口语义。换阶段一律复用 `changeStage`——时间线由服务写，本期不新增时间线逻辑。
- **不改选择器契约**：既有 `data-action`/`data-view`/`data-application-id`/`.application-card`/`.application-stage-column[data-stage-id]`/`.application-list-row` 一律保留；只**新增** `draggable` 属性、拖拽用 CSS class、`select[data-move-to]`。既有「查看详情/编辑/推进阶段」按钮不动。
- **同列不触发**：卡片拖回原列、或「移动到…」选回当前阶段，均**不**调用 `changeStage`（避免刷出无意义的 `stage-changed` 事件）。
- **拖拽监听委托在常驻 `board` 元素**（`renderApplications()` 每次重写 `board.innerHTML`，卡片是临时的，监听器不能挂在卡片上）。
- 组件为工厂函数、无 class；持久监听沿用现有模式；安全中文错误文案，**不回显 `error.message`**。
- **令牌校验**：仅用既有 `tokens.css` 变量。已确认存在：`--accent`、`--accent-weak`、`--text-2`、`--fs-xs`。不新增色值。
- **命令**：单文件 `npx vitest run <path>`；全量 `npm test`；类型 `npx tsc --noEmit`；构建 `npm run build`；e2e `npm run test:e2e`（现基线 12/12，本期新增 1 条后应 13/13，或按实际数记录）。
- **提交**：git 可用；identity 缺失用 `git -c user.name='qh' -c user.email='qh@local' commit ...`。

---

## 文件结构

**改写：**
- `src/components/ApplicationBoard/ApplicationBoard.ts` — 卡片加 `draggable="true"` + 「移动到…」`<select>`；`board` 上加 `dragstart`/`dragover`/`dragleave`/`drop`/`dragend` 与 `change` 委托监听；闭包 `draggingId`；换阶段复用 `changeStage`。
- `src/styles/applications.css` — 拖拽视觉：抓手光标、拖起半透明、目标列高亮、「移动到…」小控件样式。

**测试：**
- `tests/applications/application-board.test.ts` — 追加拖拽换列、同列 no-op、「移动到…」下拉换阶段三条用例。
- `tests/e2e/applications.spec.ts` — 追加 1 条 e2e：`dispatchEvent` 触发 HTML5 拖放，断言换阶段落到目标列。

---

## Task 1: 拖拽换列（闭包 draggingId + 复用 changeStage）

**Files:**
- Modify: `src/components/ApplicationBoard/ApplicationBoard.ts`
- Test: `tests/applications/application-board.test.ts`

**Interfaces:**
- Consumes: 既有 `applicationService.changeStage(id: string, stageId: string): Promise<Application>`（服务已写 `stage-changed` 时间线）；既有 `applicationService.listApplications()`；闭包内既有的 `applications: Application[]`、`renderApplications()`、`setStatus()`、`board`（`[data-view-panel="board"]` 元素）。
- Produces: 无新导出；`board` 上新增拖拽委托监听 + 闭包 `let draggingId: string | undefined`。卡片 `<article class="application-card">` 新增属性 `draggable="true"`。

- [ ] **Step 1: 写失败测试**

在 `tests/applications/application-board.test.ts` 的 `describe("application board UI", ...)` 内追加两条用例（`services`/`flush`/`stage`/`application` 复用文件顶部既有定义；注意 `stageService` 默认返回 `stage-a`「待申请」与 `stage-offer`「Offer」两列，`application.stageId === "stage-a"`）：

```typescript
  it("drag-and-drops a card onto another column and changes its stage", async () => {
    document.body.innerHTML = '<div id="app"></div>';
    const deps = services();
    const root = createApp(document, deps);
    await flush();
    const card = root.querySelector<HTMLElement>('.application-card[data-application-id="application-1"]')!;
    expect(card.getAttribute("draggable")).toBe("true");
    card.dispatchEvent(new Event("dragstart", { bubbles: true }));
    const target = root.querySelector<HTMLElement>('.application-stage-column[data-stage-id="stage-offer"]')!;
    target.dispatchEvent(new Event("dragover", { bubbles: true, cancelable: true }));
    target.dispatchEvent(new Event("drop", { bubbles: true }));
    await flush();
    expect(deps.applicationService.changeStage).toHaveBeenCalledWith("application-1", "stage-offer");
  });

  it("dropping a card back on its own column does not call changeStage", async () => {
    document.body.innerHTML = '<div id="app"></div>';
    const deps = services();
    const root = createApp(document, deps);
    await flush();
    const card = root.querySelector<HTMLElement>('.application-card[data-application-id="application-1"]')!;
    card.dispatchEvent(new Event("dragstart", { bubbles: true }));
    const same = root.querySelector<HTMLElement>('.application-stage-column[data-stage-id="stage-a"]')!;
    same.dispatchEvent(new Event("drop", { bubbles: true }));
    await flush();
    expect(deps.applicationService.changeStage).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/applications/application-board.test.ts`
Expected: FAIL — 卡片无 `draggable` 属性、`board` 无 drop 处理、`changeStage` 未被调用。

- [ ] **Step 3: 卡片加 draggable 属性**

`renderApplications()` 里卡片 `<article>` 开标签（当前 `:183`）加 `draggable="true"`：

```typescript
        <article class="application-card${item.archivedAt ? " application-card--archived" : ""}" draggable="true" data-application-id="${esc(item.id)}">
```

- [ ] **Step 4: board 上加拖拽委托监听 + 闭包 draggingId**

在拿到 `board` 元素之后、组件返回之前（建议紧挨 `root.addEventListener("click", ...)` 之后），新增：

```typescript
  let draggingId: string | undefined;
  board.addEventListener("dragstart", (event) => {
    const card = (event.target as HTMLElement).closest<HTMLElement>(".application-card");
    if (!card) return;
    draggingId = card.dataset.applicationId;
    (event as DragEvent).dataTransfer?.setData("text/plain", draggingId ?? "");
    card.classList.add("application-card--dragging");
  });
  board.addEventListener("dragend", (event) => {
    (event.target as HTMLElement).closest(".application-card")?.classList.remove("application-card--dragging");
    board.querySelectorAll(".application-stage-column--drop-target").forEach((column) => column.classList.remove("application-stage-column--drop-target"));
    draggingId = undefined;
  });
  board.addEventListener("dragover", (event) => {
    if (!draggingId) return;
    const column = (event.target as HTMLElement).closest(".application-stage-column");
    if (!column) return;
    event.preventDefault(); // 允许 drop
    column.classList.add("application-stage-column--drop-target");
  });
  board.addEventListener("dragleave", (event) => {
    const column = (event.target as HTMLElement).closest<HTMLElement>(".application-stage-column");
    if (column && !column.contains((event as DragEvent).relatedTarget as Node | null)) column.classList.remove("application-stage-column--drop-target");
  });
  board.addEventListener("drop", async (event) => {
    const column = (event.target as HTMLElement).closest<HTMLElement>(".application-stage-column");
    if (!column || !draggingId) return;
    event.preventDefault();
    const targetStageId = column.dataset.stageId;
    const id = draggingId;
    draggingId = undefined;
    column.classList.remove("application-stage-column--drop-target");
    const item = applications.find((entry) => entry.id === id);
    if (!item || !targetStageId || item.stageId === targetStageId) return;
    try {
      await applicationService.changeStage(id, targetStageId);
      applications = await applicationService.listApplications();
      renderApplications();
      setStatus("已拖动到新阶段");
    } catch { setStatus("阶段更新失败，请重试"); }
  });
```

（说明：换阶段路径与既有 `advance` 分支一致——`changeStage` → `listApplications` → `renderApplications`；时间线由 `changeStage` 服务写，本期不新增。`dragleave` 的 `relatedTarget` 守卫在真实浏览器防抖动；jsdom 测试不派发 `dragleave`，不受影响。）

- [ ] **Step 5: 运行确认通过**

Run: `npx vitest run tests/applications/application-board.test.ts`
Expected: PASS（含既有用例与两条新用例）。

- [ ] **Step 6: 类型检查 + 提交**

Run: `npx tsc --noEmit`（0 错误）
```bash
git add src/components/ApplicationBoard/ApplicationBoard.ts tests/applications/application-board.test.ts
git commit -m "feat(applications): drag-and-drop cards across kanban columns to change stage"
```

---

## Task 2: 「移动到…」键盘可达下拉（无障碍兜底）

**Files:**
- Modify: `src/components/ApplicationBoard/ApplicationBoard.ts`
- Test: `tests/applications/application-board.test.ts`

**Interfaces:**
- Consumes: Task 1 未涉及的既有闭包 `stages: Stage[]`、`applications`、`applicationService.changeStage`、`renderApplications()`、`setStatus()`、`board`。
- Produces: 每张卡操作区新增 `<select data-move-to data-application-id="...">`；`board` 上新增 `change` 委托监听。

- [ ] **Step 1: 写失败测试**

追加：

```typescript
  it("moves a card's stage via the keyboard-accessible move-to select", async () => {
    document.body.innerHTML = '<div id="app"></div>';
    const deps = services();
    const root = createApp(document, deps);
    await flush();
    const select = root.querySelector<HTMLSelectElement>('.application-card[data-application-id="application-1"] select[data-move-to]')!;
    expect(select).toBeTruthy();
    expect(select.value).toBe("stage-a"); // 默认选中当前阶段
    select.value = "stage-offer";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await flush();
    expect(deps.applicationService.changeStage).toHaveBeenCalledWith("application-1", "stage-offer");
  });
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/applications/application-board.test.ts`
Expected: FAIL — 卡片无 `select[data-move-to]`。

- [ ] **Step 3: 卡片操作区加「移动到…」下拉**

`renderApplications()` 里卡片的 `.application-card__actions`（当前 `:188`）追加一个带可见标签的下拉（放在既有三个按钮之后）：

```typescript
          <div class="application-card__actions"><button type="button" data-action="details" data-application-id="${esc(item.id)}">查看详情</button><button type="button" data-action="edit" data-application-id="${esc(item.id)}">编辑</button><button type="button" data-action="advance" data-application-id="${esc(item.id)}">推进阶段</button><label class="application-card__move">移动到<select data-move-to data-application-id="${esc(item.id)}">${stages.map((s) => `<option value="${esc(s.id)}"${s.id === item.stageId ? " selected" : ""}>${esc(s.name)}</option>`).join("")}</select></label></div>
```

- [ ] **Step 4: board 上加 change 委托监听**

紧接 Task 1 的 drop 监听之后新增：

```typescript
  board.addEventListener("change", async (event) => {
    const select = (event.target as HTMLElement).closest<HTMLSelectElement>("select[data-move-to]");
    if (!select) return;
    const id = select.dataset.applicationId;
    const targetStageId = select.value;
    const item = applications.find((entry) => entry.id === id);
    if (!id || !item || item.stageId === targetStageId) return;
    try {
      await applicationService.changeStage(id, targetStageId);
      applications = await applicationService.listApplications();
      renderApplications();
      setStatus("已移动到新阶段");
    } catch { setStatus("阶段更新失败，请重试"); }
  });
```

- [ ] **Step 5: 运行确认通过 + 类型 + 全量**

Run: `npx vitest run tests/applications/application-board.test.ts && npx tsc --noEmit && npm test`
Expected: 全绿、0 类型错误。

- [ ] **Step 6: 提交**

```bash
git add src/components/ApplicationBoard/ApplicationBoard.ts tests/applications/application-board.test.ts
git commit -m "feat(applications): add keyboard-accessible move-to select as drag fallback"
```

---

## Task 3: 拖拽样式 + e2e + 整期回归

**Files:**
- Modify: `src/styles/applications.css`
- Test: `tests/e2e/applications.spec.ts`

**Interfaces:** 无新导出；仅样式类与 e2e。

- [ ] **Step 1: 拖拽视觉样式**

`src/styles/applications.css` 追加（仅用既有令牌）：

```css
.application-card[draggable="true"] { cursor: grab; }
.application-card--dragging { opacity: 0.5; cursor: grabbing; }
.application-stage-column--drop-target {
  outline: 2px dashed var(--accent);
  outline-offset: -4px;
  background: var(--accent-weak);
}
.application-card__move {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--fs-xs);
  color: var(--text-2);
}
.application-card__move select { font-size: var(--fs-xs); }
```

- [ ] **Step 2: e2e 拖放换列（确定性 dispatchEvent）**

在 `tests/e2e/applications.spec.ts` 末尾追加。HTML5 原生拖放用 Playwright 的 `locator.dispatchEvent` 确定性触发（`page.dragTo` 走鼠标事件，不可靠触发 HTML5 drag 事件，故用 dispatch）。先建职位、确认默认阶段「待申请」，拖到「Offer」列后断言卡片出现在 Offer 列内：

```typescript
test("drags a card to another column to change its stage", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "职位申请" }).click();
  await expect(page.locator("#application-board-title")).toHaveText("职位申请");
  await page.getByRole("textbox", { name: "公司", exact: true }).fill("拖拽公司");
  await page.getByRole("textbox", { name: "职位", exact: true }).fill("测试工程师");
  await page.getByRole("textbox", { name: "确认 JD 文本", exact: true }).fill("拖拽测试");
  await page.locator('form[data-form="application"] button[data-submit-application]').click({ force: true });
  const card = page.locator('.application-card', { hasText: "拖拽公司" });
  await expect(card).toBeVisible();
  await card.dispatchEvent("dragstart");
  const offerColumn = page.locator('.application-stage-column', { has: page.getByText("Offer", { exact: true }) });
  await offerColumn.dispatchEvent("dragover");
  await offerColumn.dispatchEvent("drop");
  await expect(offerColumn.locator('.application-card', { hasText: "拖拽公司" })).toBeVisible();
});
```

（注：默认阶段名依赖内置 `ensureDefaultStages` 的种子。若真实种子里无「Offer」结果列名，执行时先 `page.locator('.application-stage-column h3')` 打印实际列名，改用存在的目标列名——断言逻辑不变：拖到另一列后卡片出现在该列。）

- [ ] **Step 3: 全量 + 类型 + 构建 + e2e**

Run: `npm test && npx tsc --noEmit && npm run build && npm run test:e2e`
Expected: 单测全绿、0 错误、构建 `✓ built`、e2e 全绿（既有 12 条 + 新增 1 条）。若 e2e 目标列名不符，按 Step 2 注释调整列名后重跑。

- [ ] **Step 4: 提交**

```bash
git add -A
git commit -m "style(applications): drag visual affordances; e2e for drag stage change"
```

---

## Self-Review

**1. Spec 覆盖（§7 第 1 项 / §8 第 4 期首项）：**
- 「HTML5 drag-and-drop，跨阶段拖动即改 `stageId`」→ Task 1 ✅。
- 「并写时间线事件（`stage-changed`）」→ 复用 `applicationService.changeStage`（`applicationService.ts:435` 已写 `stage-changed`），Task 1 不重写 ✅。
- 「保留键盘可达的『移动到…』下拉作为无障碍兜底」→ Task 2 新增 `select[data-move-to]` ✅。
- 「末列不再静默无反馈」→ 拖到任一列（含末列）都有 `setStatus("已拖动到新阶段")`；同列 no-op 保持静默合理 ✅。

**2. 占位符扫描：** 无 TODO/TBD；每步给出精确替换代码。e2e 目标列名的不确定性已给出运行时探测与回退说明（非占位符，是环境适配）。

**3. 类型一致性：**
- `draggingId: string | undefined`；`drop`/`change` 内经 `if (!item || ... )` 与 `if (!id ...)` 收窄后再调 `changeStage(id, targetStageId)`，两参均 `string` ✅。
- `changeStage(id, stageId)` 签名与既有 `advance` 调用点一致 ✅。
- 卡片新增 `draggable="true"`、`select[data-move-to]` 不改任何既有 `data-*`/`value`/`name`，不破坏既有选择器与提交契约 ✅。
- 监听委托在常驻 `board`，`renderApplications()` 重写 `board.innerHTML` 不丢监听 ✅。

**4. 风险点：**
- **jsdom 不填充 `DataTransfer`**：闭包 `draggingId` 法绕开，测试用普通 `Event` 即可（Task 1 Step 1 已据此写）。真实浏览器仍 `setData` 以兼容原生行为。
- **同列拖拽/选回当前**：两处均 `item.stageId === targetStageId` 短路，不触发 `changeStage`，避免脏时间线（Task 1/2 均含）。
- **e2e HTML5 拖放**：用 `dispatchEvent` 而非 `dragTo`，确定性触发；列名以运行时实际种子为准（Step 2 注释）。
- **advance 按钮共存**：新增下拉与既有「推进阶段」按钮并存，纯增量，不动既有 e2e 断言路径。
