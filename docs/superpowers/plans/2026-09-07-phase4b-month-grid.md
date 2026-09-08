# 第 4b 期 · 真·月历网格 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 面试日历的「月」视图从"扁平列表"升级为真正的 6×7 日历网格：格内以点+数量标记当天面试数，点击某格在网格下方展开当天面试列表（含既有操作按钮）。日/周视图保持不变。

**Architecture:** 纯前端交互层改动，全部落在 `InterviewCalendar`。把现有 interview-item 文章模板抽成 `renderInterviewItem(item)` helper（供日/周扁平列表与月视图"当天详情"共用，保证操作按钮完全一致）。`render()` 按 `view` 分支：day/week 走原扁平列表；month 渲染 6×7 网格（UTC 日期算格，周一起始，与既有周视图算法一致）+ 当天详情。新增 `selectedDay` 闭包状态（默认 = `anchor.value`），切到月视图或改 anchor 时同步为 `anchor.value`；点击格子更新 `selectedDay` 并重渲染。格子点击用委托在常驻 `list` 元素上的独立监听（与既有 `[data-action]` 委托互不干扰）。不改服务层、不改数据 schema、不改日/周行为。

**Tech Stack:** TypeScript、Vite、Vitest（jsdom/fake-indexeddb，通过 `createApp` 装配）、原生 DOM、既有时区工具（`isoToLocalInput`/`inRange`）、`tokens.css` 设计令牌、Playwright e2e。

**Spec:** `docs/superpowers/specs/2026-09-04-job-search-app-restructure-design.md`（§7 第 2 项「真·月历网格」；§8 第 4 期 4b）

## Global Constraints

- **不改底层**：不修改 `src/db/*`、`src/features/*`、`src/calendar/*` 与任何服务接口语义。仅改 `InterviewCalendar.ts`、`interviews.css`、测试。
- **不破坏日/周视图**：day/week 分支渲染逻辑与选择器（`.interview-item`、`[data-action]`）完全不变。
- **⚠️ 向后兼容硬约束**：既有测试 `tests/interviews/interview-ui.test.ts` 的用例「mounts calendar, creates multiple rounds, switches views and supports review editing」在**切到月视图后仍会点击 `[data-action="cancel"]`/`complete`/`reschedule`/`edit`**。因此**月视图必须仍然渲染"当天详情"里的 interview-item 操作按钮**，且 `selectedDay` 默认等于 `anchor.value`（该用例创建两场面试后 anchor 被设为 `2026-09-01`，两场都在这一天，故当天详情须含这两条及其按钮）。**这是不可回退的约束——月视图不得只剩网格而丢掉操作按钮。**
- **格子点击监听委托在常驻 `list` 元素**（`render()` 每次重写 `list.innerHTML`，格子是临时的）。
- **时区一致**：格内当天面试数与"当天详情"按面试各自时区归日（`isoToLocalInput(startsAt, timezone).slice(0,10)`），与既有 `inRange` 的 day 语义一致。网格排布用 UTC 日期推进，周一起始（`(getUTCDay()+6)%7`），与既有 week 视图算法一致。
- 组件为工厂函数、无 class；安全中文错误文案，不回显 `error.message`。
- **令牌校验**：仅用既有 `tokens.css` 变量。已确认存在：`--accent`、`--accent-weak`、`--accent-text`、`--surface`、`--surface-2`、`--surface-3`、`--text`、`--text-2`、`--line`、`--line-strong`、`--r-xs/sm/md`、`--fs-xs`、`--fw-medium/semibold`。不新增色值。
- **命令**：单文件 `npx vitest run <path>`；全量 `npm test`；类型 `npx tsc --noEmit`；构建 `npm run build`；e2e `npm run test:e2e`（现基线 14/14，本期新增后按实际记录）。
- **提交**：git 可用；identity 缺失用 `git -c user.name='qh' -c user.email='qh@local' commit ...`。

---

## 文件结构

**改写：**
- `src/components/InterviewCalendar/InterviewCalendar.ts` — 抽 `renderInterviewItem` helper；加 `monthGridCells` helper；`render()` 加 month 分支（网格 + 当天详情）；`selectedDay` 状态；格子点击委托监听；view 切换 / anchor change 处理器同步 `selectedDay`。
- `src/styles/interviews.css` — 月历网格样式（网格布局、格子、当天/选中/非本月态、数量点、当天详情区）。

**新增：**
- `tests/e2e/interviews.spec.ts` — e2e：进入面试日历、切月视图、断言 6×7 网格渲染。

**测试改写：**
- `tests/interviews/interview-ui.test.ts` — 追加 3 条月视图用例（网格 42 格、数量标记、点击格子展开当天详情）。

---

## Task 1: 月历网格渲染 + 当天详情（组件层）

**Files:**
- Modify: `src/components/InterviewCalendar/InterviewCalendar.ts`
- Test: `tests/interviews/interview-ui.test.ts`

**Interfaces:**
- Consumes: 既有闭包 `records: Interview[]`、`anchor`（`#calendar-anchor` input）、`view`、`today`、`list`（`.interview-calendar__list`）、`applicationFor`、`escapeHtml`、`isoToLocalInput`、`inRange`、`formatInterviewLocalTime`、`formatInterviewStatus`、`formatReminderLocalTime`。
- Produces:
  - `renderInterviewItem(item: Interview): string`（组件内 helper，返回既有 `.interview-item` 文章 HTML，逐字沿用当前模板与全部操作按钮）。
  - `monthGridCells(month: string): string[]`（模块级纯函数，`month` 为 `"YYYY-MM"`，返回 42 个 `"YYYY-MM-DD"`，周一起始）。
  - 新闭包状态 `let selectedDay: string`（默认 `anchor.value`）。
  - `list` 上新增 `[data-calendar-day]` 点击委托监听。
  - 月视图 DOM：`.calendar-grid`（`role="grid"`）含 `.calendar-grid__weekdays` 7 个 `columnheader` 与 `.calendar-grid__cells` 42 个 `button.calendar-cell[data-calendar-day][role="gridcell"]`；`.calendar-day-detail` 含当天 `renderInterviewItem` 列表。

- [ ] **Step 1: 写失败测试**

在 `tests/interviews/interview-ui.test.ts` 末尾（`describe` 内）追加。用 `now` 固定今天、interviews 用 `timezone:"UTC"` 便于按日断言（`flush = () => new Promise((r)=>setTimeout(r,0))`——文件已有等价 `setTimeout` 模式，可复用或内联）：

```typescript
  const ivFixture = (id: string, startsAt: string) => ({ id, applicationId: "a-1", round: 1, title: `面试${id}`, startsAt, timezone: "UTC", status: "scheduled", reminders: [], type: "video", locationOrLink: "", interviewer: "", note: "" });

  it("renders a 6x7 month grid with weekday headers in month view", async () => {
    document.body.innerHTML = '<div id="app"></div>';
    const root = createApp(document, {
      applicationService: { listApplications: async () => [{ id: "a-1", company: "Acme", position: "Eng", jobType: "tech", stageId: "s" }] as any } as any,
      interviewService: { listInterviews: async () => [ivFixture("i-1", "2026-09-15T02:00:00.000Z")] } as any,
      now: () => new Date("2026-09-15T00:00:00.000Z"),
    });
    await new Promise((r) => setTimeout(r, 0));
    (root.querySelector('[data-calendar-view="month"]') as HTMLButtonElement).click();
    expect(root.querySelectorAll(".calendar-grid__weekdays [role=columnheader]")).toHaveLength(7);
    expect(root.querySelectorAll(".calendar-cell")).toHaveLength(42);
  });

  it("marks days that have interviews with a count in month view", async () => {
    document.body.innerHTML = '<div id="app"></div>';
    const root = createApp(document, {
      applicationService: { listApplications: async () => [{ id: "a-1", company: "Acme", position: "Eng", jobType: "tech", stageId: "s" }] as any } as any,
      interviewService: { listInterviews: async () => [ivFixture("i-1", "2026-09-15T02:00:00.000Z")] } as any,
      now: () => new Date("2026-09-15T00:00:00.000Z"),
    });
    await new Promise((r) => setTimeout(r, 0));
    (root.querySelector('[data-calendar-view="month"]') as HTMLButtonElement).click();
    expect(root.querySelector('[data-calendar-day="2026-09-15"] .calendar-cell__count')).toBeTruthy();
    expect(root.querySelector('[data-calendar-day="2026-09-16"] .calendar-cell__count')).toBeFalsy();
  });

  it("clicking a day cell shows that day's interviews in the day detail", async () => {
    document.body.innerHTML = '<div id="app"></div>';
    const root = createApp(document, {
      applicationService: { listApplications: async () => [{ id: "a-1", company: "Acme", position: "Eng", jobType: "tech", stageId: "s" }] as any } as any,
      interviewService: { listInterviews: async () => [ivFixture("i-1", "2026-09-15T02:00:00.000Z"), ivFixture("i-2", "2026-09-20T02:00:00.000Z")] } as any,
      now: () => new Date("2026-09-15T00:00:00.000Z"),
    });
    await new Promise((r) => setTimeout(r, 0));
    (root.querySelector('[data-calendar-view="month"]') as HTMLButtonElement).click();
    (root.querySelector('[data-calendar-day="2026-09-20"]') as HTMLButtonElement).click();
    const detail = root.querySelector(".calendar-day-detail")!;
    expect(detail.textContent).toContain("面试i-2");
    expect(detail.querySelectorAll(".interview-item")).toHaveLength(1);
    expect(root.querySelector('[data-calendar-day="2026-09-20"]')?.getAttribute("aria-pressed")).toBe("true");
  });
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/interviews/interview-ui.test.ts`
Expected: 新 3 条 FAIL（`.calendar-grid`/`.calendar-cell`/`[data-calendar-day]` 尚不存在）；既有用例仍 PASS。

- [ ] **Step 3: 加模块级 `monthGridCells` 纯函数**

在 `InterviewCalendar.ts` 顶部（`inRange` 附近，`createInterviewCalendar` 之外）新增：

```typescript
const WEEKDAY_LABELS = ["一", "二", "三", "四", "五", "六", "日"];

/** 返回覆盖某月的 6×7=42 个日期（"YYYY-MM-DD"），周一起始；用 UTC 推进避免时区漂移。 */
function monthGridCells(month: string): string[] {
  const first = new Date(`${month}-01T00:00:00Z`);
  const weekday = (first.getUTCDay() + 6) % 7; // 周一=0
  const start = new Date(first);
  start.setUTCDate(start.getUTCDate() - weekday);
  const cells: string[] = [];
  for (let index = 0; index < 42; index += 1) {
    const day = new Date(start);
    day.setUTCDate(start.getUTCDate() + index);
    cells.push(day.toISOString().slice(0, 10));
  }
  return cells;
}
```

- [ ] **Step 4: 抽 `renderInterviewItem` helper + 加 `selectedDay` 状态**

在 `createInterviewCalendar` 内、`render` 定义之前：
1. 在 `let ... failures` 那一行附近加 `let selectedDay = anchor.value;`（`anchor.value` 初始为 `today`）。
2. 新增 helper（**把当前 `render` 里 `visible.map((item) => { ... })` 的箭头函数体逐字搬进来**，不改任何按钮/字段）：

```typescript
  const renderInterviewItem = (item: Interview): string => {
    const application = applicationFor(item.applicationId);
    const reminders = item.reminders.map((reminder) => `${reminder.offsetMinutes} 分钟前 / ${reminder.channel === "browser" ? "浏览器" : "应用内"}`).join("；");
    return `<article class="interview-item" data-interview-id="${escapeHtml(item.id)}"><div class="interview-item__body"><h3>${escapeHtml(item.title || `第 ${item.round} 轮面试`)}</h3><p>${escapeHtml(application?.company ?? "未知公司")} · ${escapeHtml(application?.position ?? "未知职位")} · 第 ${item.round} 轮</p><p>${escapeHtml(formatInterviewLocalTime(item.startsAt, item.timezone))} · ${escapeHtml(item.timezone)}</p><p>状态：${escapeHtml(formatInterviewStatus(item.status))} · 提醒：${escapeHtml(reminders || "无")}</p><p>${escapeHtml(item.locationOrLink)}${item.interviewer ? ` · 面试官：${escapeHtml(item.interviewer)}` : ""}</p></div><div class="interview-item__actions"><button type="button" data-action="edit" data-interview-id="${escapeHtml(item.id)}">编辑</button><button type="button" data-action="reschedule" data-interview-id="${escapeHtml(item.id)}">改期</button><button type="button" data-action="cancel" data-interview-id="${escapeHtml(item.id)}">取消</button><button type="button" data-action="complete" data-interview-id="${escapeHtml(item.id)}">完成</button><button type="button" data-action="review" data-interview-id="${escapeHtml(item.id)}">填写或编辑复盘</button><button type="button" data-action="export-ics" data-interview-id="${escapeHtml(item.id)}">导出 ICS</button></div></article>`;
  };
```

- [ ] **Step 5: 重写 `render()` 分支（day/week 原样 + month 网格）**

把现有 `render` 函数体改为（保留末尾的 aria-pressed、in-app-reminders、status 逻辑；仅把"列表构建"部分按 view 分支）：

```typescript
  const render = () => {
    let visibleCount: number;
    if (view === "month") {
      const month = anchor.value.slice(0, 7);
      const countByDay = new Map<string, number>();
      for (const item of records) {
        const day = isoToLocalInput(item.startsAt, item.timezone).slice(0, 10);
        countByDay.set(day, (countByDay.get(day) ?? 0) + 1);
      }
      const cellsHtml = monthGridCells(month).map((dateStr) => {
        const dayNum = Number(dateStr.slice(8, 10));
        const count = countByDay.get(dateStr) ?? 0;
        const classes = ["calendar-cell"];
        if (dateStr.slice(0, 7) !== month) classes.push("calendar-cell--outside");
        if (dateStr === today) classes.push("calendar-cell--today");
        if (dateStr === selectedDay) classes.push("calendar-cell--selected");
        const label = count ? `${dayNum} 日，${count} 场面试` : `${dayNum} 日`;
        return `<button type="button" role="gridcell" class="${classes.join(" ")}" data-calendar-day="${dateStr}" aria-pressed="${dateStr === selectedDay}" aria-label="${label}"><span class="calendar-cell__date">${dayNum}</span>${count ? `<span class="calendar-cell__count" aria-hidden="true">●${count}</span>` : ""}</button>`;
      }).join("");
      const dayInterviews = records.filter((item) => isoToLocalInput(item.startsAt, item.timezone).slice(0, 10) === selectedDay);
      list.innerHTML = `<div class="calendar-grid" role="grid" aria-label="${escapeHtml(month)} 月历"><div class="calendar-grid__weekdays" role="row">${WEEKDAY_LABELS.map((weekday) => `<span role="columnheader">${weekday}</span>`).join("")}</div><div class="calendar-grid__cells">${cellsHtml}</div></div><div class="calendar-day-detail"><h3>${escapeHtml(selectedDay)} 的面试</h3>${dayInterviews.map(renderInterviewItem).join("") || `<p class="interview-empty">当天没有面试安排</p>`}</div>`;
      visibleCount = records.filter((item) => inRange(item, anchor.value, "month")).length;
    } else {
      const visible = records.filter((item) => inRange(item, anchor.value, view));
      list.innerHTML = visible.map(renderInterviewItem).join("") || `<p class="interview-empty">当前范围没有面试安排</p>`;
      visibleCount = visible.length;
    }
    root.querySelectorAll<HTMLButtonElement>("[data-calendar-view]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.calendarView === view)));
    const reminders = records.flatMap((interview) => interview.reminders.filter((item) => item.channel === "in-app").map((item) => ({ interview, item })));
    root.querySelector(".in-app-reminders ul")!.innerHTML = reminders.map(({ interview, item }) => `<li>${escapeHtml(interview.title)}：${escapeHtml(formatReminderLocalTime(interview.startsAt, interview.timezone, item))}（${escapeHtml(interview.timezone)}）</li>`).join("") || "<li>暂无应用内提醒</li>";
    status.textContent = `${visibleCount} 场面试 · ${view === "day" ? "日" : view === "week" ? "周" : "月"}视图${failures.length ? ` · ${failures.length} 个通知失败，已保留应用内提醒` : ""}`;
  };
```

（注意：`inRange`/`isoToLocalInput`/`formatReminderLocalTime` 均为既有；不要改动它们。day/week 分支行为与选择器与改前完全一致。）

- [ ] **Step 6: view 切换 / anchor change 同步 `selectedDay` + 格子点击监听**

1. 修改 view 切换处理器（当前 `root.querySelectorAll("[data-calendar-view]").forEach((button)=>button.addEventListener("click", ()=>{ view=...; render(); }))`）为：

```typescript
  root.querySelectorAll<HTMLButtonElement>("[data-calendar-view]").forEach((button) => button.addEventListener("click", () => { view = button.dataset.calendarView as typeof view; if (view === "month") selectedDay = anchor.value; render(); }));
```

2. 修改 anchor change 处理器（当前 `anchor.addEventListener("change", render)`）为：

```typescript
  anchor.addEventListener("change", () => { if (view === "month") selectedDay = anchor.value; render(); });
```

3. 在 `list` 上新增格子点击委托监听（放在既有 `list.addEventListener("click", ...)` 之后即可；两者独立）：

```typescript
  list.addEventListener("click", (event) => {
    const cell = (event.target as HTMLElement).closest<HTMLElement>("[data-calendar-day]");
    if (!cell) return;
    selectedDay = cell.dataset.calendarDay!;
    render();
  });
```

- [ ] **Step 7: 运行确认通过（新用例 + 既有回归）**

Run: `npx vitest run tests/interviews/interview-ui.test.ts`
Expected: 全 PASS——含新 3 条与既有「mounts calendar…」（该用例在月视图仍能点到 `[data-action]` 按钮，因 `selectedDay` 默认 = `anchor.value = 2026-09-01`，两场面试都在当天详情里）。若既有用例失败，**先排查是否 `selectedDay` 未默认到 `anchor.value` 或当天详情漏渲染按钮**，不要改既有用例断言。

- [ ] **Step 8: 类型检查 + 全量**

Run: `npx tsc --noEmit && npm test`
Expected: 0 类型错误、全量全绿。

- [ ] **Step 9: 提交**

```bash
git add src/components/InterviewCalendar/InterviewCalendar.ts tests/interviews/interview-ui.test.ts
git commit -m "feat(interviews): real 6x7 month grid with per-day counts and day detail"
```

---

## Task 2: 月历网格样式 + e2e + 整期回归

**Files:**
- Modify: `src/styles/interviews.css`
- Create: `tests/e2e/interviews.spec.ts`

**Interfaces:** 无新导出；仅样式类与 e2e。

- [ ] **Step 1: 月历网格样式**

`src/styles/interviews.css` 追加（仅用既有令牌）：

```css
.calendar-grid { display: flex; flex-direction: column; gap: 6px; margin-bottom: var(--r-md); }
.calendar-grid__weekdays,
.calendar-grid__cells { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
.calendar-grid__weekdays { font-size: var(--fs-xs); color: var(--text-2); font-weight: var(--fw-medium); }
.calendar-grid__weekdays span { text-align: center; padding: 4px 0; }
.calendar-cell {
  display: flex; flex-direction: column; align-items: flex-start; gap: 2px;
  min-height: 56px; padding: 6px; border: 1px solid var(--line);
  border-radius: var(--r-sm); background: var(--surface); color: var(--text);
  cursor: pointer; font-size: var(--fs-xs);
}
.calendar-cell:hover { border-color: var(--line-strong); background: var(--surface-2); }
.calendar-cell--outside { color: var(--text-2); background: var(--surface-3); }
.calendar-cell--today { border-color: var(--accent); }
.calendar-cell--selected { background: var(--accent-weak); border-color: var(--accent); color: var(--accent-text); }
.calendar-cell__date { font-weight: var(--fw-semibold); }
.calendar-cell__count { color: var(--accent-text); font-weight: var(--fw-medium); }
.calendar-day-detail { display: flex; flex-direction: column; gap: 8px; }
.calendar-day-detail > h3 { font-size: var(--fs-xs); color: var(--text-2); margin: 0; }
```

- [ ] **Step 2: e2e 月视图网格**

创建 `tests/e2e/interviews.spec.ts`（月视图网格不依赖数据，空日历也渲染 42 格，确定性）：

```typescript
import { expect, test } from "@playwright/test";

test("month view renders a 6x7 calendar grid", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "面试日历" }).click();
  await expect(page.locator("#interview-calendar-title")).toHaveText("面试日历");
  await page.getByRole("button", { name: "月", exact: true }).click({ force: true });
  await expect(page.locator(".calendar-grid")).toBeVisible();
  await expect(page.locator(".calendar-cell")).toHaveCount(42);
  await expect(page.locator(".calendar-grid__weekdays [role=columnheader]")).toHaveCount(7);
});
```

- [ ] **Step 3: 全量 + 类型 + 构建 + e2e**

Run: `npm test && npx tsc --noEmit && npm run build && npm run test:e2e`
Expected: 单测全绿、0 错误、构建 `✓ built`、e2e 全绿（既有 14 条 + 新增 1 条）。注：`ai-career-advisor` 移动端 e2e 有既有 flake（与本期无关），若偶发失败，隔离重跑确认非本期回归。

- [ ] **Step 4: 提交**

```bash
git add -A
git commit -m "style(interviews): month calendar grid styles; e2e for month grid"
```

---

## Self-Review

**1. Spec 覆盖（§7 第 2 项 / §8 第 4 期 4b）：**
- 「月视图渲染 6×7 网格」→ Task 1 `monthGridCells` + render month 分支（42 格）✅。
- 「格内以点状标记面试数量」→ `.calendar-cell__count`（`●N`）+ `countByDay` ✅。
- 「点击某格展开当天面试列表」→ `selectedDay` + 格子点击监听 + `.calendar-day-detail` 复用 `renderInterviewItem` ✅。
- 「日/周视图保留」→ render else 分支逐字沿用，选择器不变 ✅。

**2. 占位符扫描：** 无 TODO/TBD；每步给出精确替换代码；`renderInterviewItem` 明确要求逐字搬运既有模板。

**3. 类型一致性：**
- `monthGridCells(month: string): string[]`、`renderInterviewItem(item: Interview): string`、`selectedDay: string` 在 Task 1 定义并在同任务内使用，签名一致 ✅。
- `view` 联合类型 `"day"|"week"|"month"` 不变；`selectedDay` 仅月视图使用 ✅。
- day/week 分支与既有 `.interview-item`/`[data-action]` 契约不变，`list` 点击委托（既有 action + 新 calendar-day）互不干扰 ✅。

**4. 风险点：**
- **向后兼容（最高风险）**：既有「mounts calendar…」用例在月视图点击 `[data-action]` 按钮。缓解——`selectedDay` 默认 = `anchor.value`，当天详情用同一 `renderInterviewItem`（含全部按钮）；Task 1 Step 7 明确要求该用例通过且不得改其断言。reviewer 重点核对当天详情按钮齐全、`selectedDay` 默认正确。
- **时区归日**：格计数与当天详情都用 `isoToLocalInput(startsAt, timezone).slice(0,10)`，与既有 `inRange` day 语义一致；网格排布用 UTC 推进（与既有 week 算法同源）✅。
- **`list` 双监听**：既有 `[data-action]` 监听对格子（无 data-action）`closest` 返回 null 即早退；新 `[data-calendar-day]` 监听独立处理，无冲突。
- **e2e 确定性**：月视图网格不依赖数据，空日历也 42 格；无需创建面试即可断言。
