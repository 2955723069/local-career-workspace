# 第 4c 期 · 时区下拉选择器 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把面试创建表单与改期表单里"手输 IANA 时区字符串"的 `<input name="timezone">` 换成由 `Intl.supportedValuesOf('timeZone')` 生成的 `<select>`（不可用时回退内置常用时区列表），默认高亮本地时区，消除"输错时区导致整表保存失败"的坑。

**Architecture:** 纯前端表单控件替换，全部落在 `InterviewCalendar`。加模块级纯函数 `listTimezones()`（`Intl.supportedValuesOf` 优先、回退内置列表）、`localTimezone()`（`Intl.DateTimeFormat().resolvedOptions().timeZone`，回退 `UTC`）、`timezoneOptionsHtml(selected)`（生成 `<option>` 且保证 `selected` 值存在——缺失则前置补一项）。把两处 `<input name="timezone">` 换成 `<select name="timezone">`（默认选中本地时区）。edit/reschedule 回填时用 `setTimezoneSelect(select, value)`（选项缺失则补），避免存量/异常时区回填后落空。提交/改期逻辑（读 `data.get("timezone")` → `zonedLocalToIso`）不变——`select` 依旧给出 IANA 字符串。

**Tech Stack:** TypeScript、Vite、Vitest（jsdom/fake-indexeddb，通过 `createApp` 装配）、原生 DOM、`Intl.supportedValuesOf`/`Intl.DateTimeFormat`（Node ≥18 与浏览器均支持）、Playwright e2e。

**Spec:** `docs/superpowers/specs/2026-09-04-job-search-app-restructure-design.md`（§7 第 3 项「时区下拉选择器」；§8 第 4 期 4c）

## Global Constraints

- **不改底层**：不修改 `src/db/*`、`src/features/*`、`src/calendar/*` 与任何服务接口语义。仅改 `InterviewCalendar.ts`、测试；样式如无必要不动。
- **提交契约不变**：`<select name="timezone">` 依旧通过 `FormData.get("timezone")` 给出 IANA 字符串；提交（`zonedLocalToIso(local, timezone)`）与改期逻辑、`name`/`data-*` 不变。**只把控件从 input 换成 select**。
- **默认本地时区**：创建表单时区默认选中 `Intl.DateTimeFormat().resolvedOptions().timeZone`（不可用回退 `UTC`），取代原硬编码 `Asia/Shanghai`。
- **回退列表**：`Intl.supportedValuesOf` 不存在/抛错/空时，用内置常用时区列表（含 `UTC`、`Asia/Shanghai` 等），保证下拉永不为空。
- **回填补缺**：编辑/改期回填某面试时区时，若该值不在选项中（存量或异常值），前置补一个该值的 `<option>` 并选中——绝不让回填落空成空值。
- **向后兼容**：既有测试 `tests/interviews/interview-ui.test.ts` 会对 `name="timezone"` 控件 `.value = "Asia/Shanghai"` 赋值后提交，并断言创建/改期得到 `...T01:00:00.000Z`/`...T02:00:00.000Z`。`select` 上 `.value="Asia/Shanghai"` 命中既有选项即可工作（`supportedValuesOf` 与回退列表都含该项）；**不得修改这些既有断言**。
- 组件为工厂函数、无 class；安全中文错误文案，不回显 `error.message`；仅用既有 `tokens.css` 变量。
- **命令**：单文件 `npx vitest run <path>`；全量 `npm test`；类型 `npx tsc --noEmit`；构建 `npm run build`；e2e `npm run test:e2e`（现基线 16/16，本期新增后按实际记录）。
- **提交**：git 可用；identity 缺失用 `git -c user.name='qh' -c user.email='qh@local' commit ...`。

---

## 文件结构

**改写：**
- `src/components/InterviewCalendar/InterviewCalendar.ts` — 加时区 helper（模块级纯函数 + 组件内 `setTimezoneSelect`）；两处 `input[name=timezone]` → `select[name=timezone]`（默认本地时区）；edit/reschedule 回填改用 `setTimezoneSelect`。

**测试：**
- `tests/interviews/interview-ui.test.ts` — 追加时区下拉用例（是 select、含常用项、默认本地时区、回填补缺失项、改期表单同样是 select 并预选）。
- `tests/e2e/interviews.spec.ts` — 追加 1 条 e2e：面试表单时区控件为 select 且含 `Asia/Shanghai`。

---

## Task 1: 时区下拉（helper + 两处控件替换 + 回填补缺）

**Files:**
- Modify: `src/components/InterviewCalendar/InterviewCalendar.ts`
- Test: `tests/interviews/interview-ui.test.ts`

**Interfaces:**
- Consumes: `Intl.supportedValuesOf`、`Intl.DateTimeFormat().resolvedOptions().timeZone`；既有 `escapeHtml`、form/rescheduleForm、edit/reschedule 处理器。
- Produces（模块级 + 组件内）：
  - `listTimezones(): string[]`（模块级纯函数）。
  - `localTimezone(): string`（模块级纯函数）。
  - `timezoneOptionsHtml(selected: string): string`（模块级纯函数，返回 `<option>` 串，保证 `selected` 在内且被选中）。
  - `setTimezoneSelect(select: HTMLSelectElement, value: string): void`（组件内 helper：选项缺失则前置补一项，再选中）。
  - 两处 `select[name="timezone"]`（`#interview-timezone`、`#reschedule-timezone`）。

- [ ] **Step 1: 写失败测试**

在 `tests/interviews/interview-ui.test.ts` 末尾（`describe` 内）追加。用固定 `now` 保证本地时区解析稳定（jsdom/Node 环境本地时区 = 运行环境，故断言"是 select + 含常用项 + 默认值非空且是有效选项"，不硬编码具体本地时区名）：

```typescript
  it("renders the interview timezone control as a select with many zones", async () => {
    document.body.innerHTML = '<div id="app"></div>';
    const root = createApp(document, {
      applicationService: { listApplications: async () => [{ id: "a-1", company: "Acme", position: "Eng", jobType: "tech", stageId: "s" }] as any } as any,
      interviewService: { listInterviews: async () => [] } as any,
    });
    await new Promise((r) => setTimeout(r, 0));
    const tz = root.querySelector<HTMLSelectElement>('[data-form="interview"] [name="timezone"]')!;
    expect(tz.tagName).toBe("SELECT");
    expect(tz.querySelectorAll("option").length).toBeGreaterThan(20);
    expect(Array.from(tz.options).some((option) => option.value === "Asia/Shanghai")).toBe(true);
    expect(Array.from(tz.options).some((option) => option.value === "UTC")).toBe(true);
    expect(tz.value).not.toBe(""); // 默认选中一个有效时区（本地时区）
    expect(Array.from(tz.options).some((option) => option.value === tz.value)).toBe(true);
  });

  it("keeps an unknown stored timezone selectable when editing", async () => {
    document.body.innerHTML = '<div id="app"></div>';
    const root = createApp(document, {
      applicationService: { listApplications: async () => [{ id: "a-1", company: "Acme", position: "Eng", jobType: "tech", stageId: "s" }] as any } as any,
      interviewService: { listInterviews: async () => [{ id: "i-1", applicationId: "a-1", round: 1, title: "Tech", startsAt: "2026-09-02T01:00:00.000Z", timezone: "Mars/Base", status: "scheduled", reminders: [], type: "video", locationOrLink: "", interviewer: "", note: "" }] } as any,
    });
    await new Promise((r) => setTimeout(r, 0));
    (root.querySelector('[data-action="edit"][data-interview-id="i-1"]') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 0));
    const tz = root.querySelector<HTMLSelectElement>('[data-form="interview"] [name="timezone"]')!;
    expect(tz.value).toBe("Mars/Base"); // 未知时区被补进选项并选中，回填不落空
  });

  it("renders the reschedule timezone control as a select and preselects the interview timezone", async () => {
    document.body.innerHTML = '<div id="app"></div>';
    const root = createApp(document, {
      applicationService: { listApplications: async () => [{ id: "a-1", company: "Acme", position: "Eng", jobType: "tech", stageId: "s" }] as any } as any,
      interviewService: { listInterviews: async () => [{ id: "i-1", applicationId: "a-1", round: 1, title: "Tech", startsAt: "2026-09-02T01:00:00.000Z", timezone: "Asia/Shanghai", status: "scheduled", reminders: [], type: "video", locationOrLink: "", interviewer: "", note: "" }] } as any,
    });
    await new Promise((r) => setTimeout(r, 0));
    (root.querySelector('[data-action="reschedule"][data-interview-id="i-1"]') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 0));
    const tz = root.querySelector<HTMLSelectElement>('[data-form="reschedule"] [name="timezone"]')!;
    expect(tz.tagName).toBe("SELECT");
    expect(tz.value).toBe("Asia/Shanghai");
  });
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/interviews/interview-ui.test.ts`
Expected: 新 3 条 FAIL（timezone 仍是 `input`，无 options；未知时区回填落空）；既有用例仍 PASS。

- [ ] **Step 3: 加模块级时区 helper**

在 `InterviewCalendar.ts` 顶部（`createInterviewCalendar` 之外，靠近其它模块级工具函数）新增：

```typescript
const TIMEZONE_FALLBACK = ["UTC", "Asia/Shanghai", "Asia/Hong_Kong", "Asia/Tokyo", "Asia/Singapore", "Asia/Seoul", "Asia/Kolkata", "Asia/Dubai", "Europe/London", "Europe/Paris", "Europe/Berlin", "Europe/Moscow", "America/New_York", "America/Chicago", "America/Los_Angeles", "America/Sao_Paulo", "Australia/Sydney", "Pacific/Auckland"];

/** 全量 IANA 时区；Intl.supportedValuesOf 不可用/抛错/空时回退内置常用列表。 */
function listTimezones(): string[] {
  try {
    const supported = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.("timeZone");
    if (supported && supported.length) return supported;
  } catch { /* 回退 */ }
  return TIMEZONE_FALLBACK;
}

/** 运行环境本地时区；解析失败回退 UTC。 */
function localTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** 生成 <option> 串；保证 selected 值存在（缺失则前置补一项）并被选中。 */
function timezoneOptionsHtml(selected: string): string {
  const zones = listTimezones();
  const list = zones.includes(selected) ? zones : [selected, ...zones];
  return list.map((zone) => `<option value="${escapeHtml(zone)}"${zone === selected ? " selected" : ""}>${escapeHtml(zone)}</option>`).join("");
}
```

（注：`escapeHtml` 为既有模块级/组件内函数。若 `escapeHtml` 是组件内闭包函数而非模块级，则把 `timezoneOptionsHtml` 也放进组件内闭包，或在模块级复制一个等价的最小转义；实现者按现有 `escapeHtml` 的作用域就近选择，保持单一转义实现，勿新增重复逻辑。）

- [ ] **Step 4: 两处 timezone 控件换成 select**

`InterviewCalendar.ts` 的 `root.innerHTML` 模板：
1. 面试表单（当前 `#interview-timezone` 那段）：把
   ```
   <label for="interview-timezone">时区<input id="interview-timezone" name="timezone" value="Asia/Shanghai" required aria-describedby="timezone-help" /><span id="timezone-help">例如 Asia/Shanghai</span></label>
   ```
   换成
   ```
   <label for="interview-timezone">时区<select id="interview-timezone" name="timezone" required>${timezoneOptionsHtml(localTimezone())}</select></label>
   ```
   （移除 `timezone-help` 提示 span 与 `aria-describedby`——下拉不再需要"例如"提示。）
2. 改期表单（当前 `#reschedule-timezone` 那段）：把
   ```
   <label for="reschedule-timezone">时区<input id="reschedule-timezone" name="timezone" required /></label>
   ```
   换成
   ```
   <label for="reschedule-timezone">时区<select id="reschedule-timezone" name="timezone" required>${timezoneOptionsHtml(localTimezone())}</select></label>
   ```

- [ ] **Step 5: 加 `setTimezoneSelect` + 用于 edit/reschedule 回填**

1. 在组件内（`render`/处理器附近）新增 helper：

```typescript
  const setTimezoneSelect = (select: HTMLSelectElement, value: string): void => {
    if (!Array.from(select.options).some((option) => option.value === value)) {
      const option = documentRef.createElement("option");
      option.value = value;
      option.textContent = value;
      select.prepend(option);
    }
    select.value = value;
  };
```

2. **编辑回填**：edit 分支里那段 `for (const [name, value] of Object.entries({... timezone: interview.timezone ...})) { const control = ...; if (control) control.value = String(value); }` 之后，追加一行以修正时区（泛型循环对 select 缺失项会落空，这里补正）：

```typescript
      setTimezoneSelect(form.elements.namedItem("timezone") as HTMLSelectElement, interview.timezone);
```

3. **改期回填**：把 reschedule 打开时的
   ```typescript
   (rescheduleForm.elements.namedItem("timezone") as HTMLInputElement).value = interview.timezone;
   ```
   换成
   ```typescript
   setTimezoneSelect(rescheduleForm.elements.namedItem("timezone") as HTMLSelectElement, interview.timezone);
   ```

- [ ] **Step 6: 运行确认通过（新用例 + 既有回归）**

Run: `npx vitest run tests/interviews/interview-ui.test.ts`
Expected: 全 PASS——含新 3 条与既有「mounts calendar…」（该用例对 select `.value="Asia/Shanghai"` 赋值命中既有选项，创建/改期 ISO 断言不受影响）。若既有用例失败，**先排查 select 选项是否含 `Asia/Shanghai`、reschedule 预选是否经 `setTimezoneSelect`**，不要改既有断言。

- [ ] **Step 7: 类型检查 + 全量**

Run: `npx tsc --noEmit && npm test`
Expected: 0 类型错误、全量全绿。

- [ ] **Step 8: 提交**

```bash
git add src/components/InterviewCalendar/InterviewCalendar.ts tests/interviews/interview-ui.test.ts
git commit -m "feat(interviews): timezone dropdown from Intl.supportedValuesOf with local default"
```

---

## Task 2: e2e + 整期回归

**Files:**
- Test: `tests/e2e/interviews.spec.ts`

**Interfaces:** 无新导出；仅 e2e 与全量回归。

- [ ] **Step 1: e2e 时区下拉**

在 `tests/e2e/interviews.spec.ts` 末尾追加（时区下拉不依赖数据，确定性）：

```typescript
test("interview timezone is a select populated with IANA zones", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "面试日历" }).click();
  await expect(page.locator("#interview-calendar-title")).toHaveText("面试日历");
  const tz = page.locator('form[data-form="interview"] select[name="timezone"]');
  await expect(tz).toBeVisible();
  await expect(tz.locator("option", { hasText: "Asia/Shanghai" })).toHaveCount(1);
  await expect(await tz.locator("option").count()).toBeGreaterThan(20);
});
```

（注：若 `expect(await ...count())` 的写法在本仓库 Playwright 版本下不便，用 `expect(tz.locator("option")).not.toHaveCount(0)` 或先取 `const n = await tz.locator("option").count(); expect(n).toBeGreaterThan(20);`——断言语义不变：选项远多于回退列表且含 Asia/Shanghai。）

- [ ] **Step 2: 全量 + 类型 + 构建 + e2e**

Run: `npm test && npx tsc --noEmit && npm run build && npm run test:e2e`
Expected: 单测全绿、0 错误、构建 `✓ built`、e2e 全绿（既有 16 条 + 新增 1 条）。注：`ai-career-advisor` 移动端 e2e 有既有 flake（与本期无关），若仅它偶发失败，隔离重跑确认非本期回归。

- [ ] **Step 3: 提交**

```bash
git add -A
git commit -m "test(e2e): interview timezone select is populated with IANA zones"
```

---

## Self-Review

**1. Spec 覆盖（§7 第 3 项 / §8 第 4 期 4c）：**
- 「用 `Intl.supportedValuesOf('timeZone')` 生成下拉」→ `listTimezones` + `timezoneOptionsHtml`，Task 1 ✅。
- 「不可用时回退到内置常用时区列表」→ `TIMEZONE_FALLBACK` + try/catch，Task 1 ✅。
- 「默认高亮本地时区」→ `timezoneOptionsHtml(localTimezone())`，Task 1 Step 4 ✅。
- 「消除手输 IANA 输错整表保存失败」→ 控件改 select，只能选合法 IANA；回填补缺保证存量值不落空，Task 1 ✅。

**2. 占位符扫描：** 无 TODO/TBD；每步给出精确替换代码；`escapeHtml` 作用域就近选择的说明为实现细节指引（非占位符）。

**3. 类型一致性：**
- `listTimezones(): string[]`、`localTimezone(): string`、`timezoneOptionsHtml(selected: string): string`、`setTimezoneSelect(select: HTMLSelectElement, value: string): void` 在 Task 1 定义并同任务内使用，签名一致 ✅。
- 提交读 `data.get("timezone")` 得字符串不变；select 的 `value`/`name` 契约与 input 相同 ✅。
- edit 泛型回填循环仍存在，仅在其后用 `setTimezoneSelect` 修正 timezone（避免 select 缺失项落空）✅。

**4. 风险点：**
- **向后兼容**：既有 ISO 断言依赖对 timezone 控件赋 `Asia/Shanghai` 后提交；select 含该项即可，reschedule 预选经 `setTimezoneSelect`。Task 1 Step 6 明确要求既有用例通过且不改断言。reviewer 重点核对。
- **本地时区不确定**：测试不硬编码本地时区名，只断言"是 select、含常用项、默认值是有效选项且非空"，跨环境稳定。
- **`Intl.supportedValuesOf` 缺失**：try/catch 回退内置列表，下拉永不空；helper 有回退分支。
- **未知/存量时区**：`timezoneOptionsHtml` 与 `setTimezoneSelect` 双重补缺，回填不落空（Task 1 用例二覆盖）。
- **提交契约**：仅换控件类型，`name`/`FormData`/`zonedLocalToIso` 不变，创建/改期路径与服务层无感。
