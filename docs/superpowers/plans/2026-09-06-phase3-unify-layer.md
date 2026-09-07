# 第 3 期 · 统一层（本地化 + 按钮层级 + 表单渐进披露 + components.css） 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 消除满屏生英文枚举（`needs-review`/`onsite`/`scheduled`/`graduate`…）与生 ISO 时间戳（`2026-09-04T12:00:00.000Z`）；把按钮统一成主/次/危险三档语义（破坏性操作视觉区分）；创建职位表单默认只露必填的「公司+职位」，其余折叠；沉淀共享 `components.css` 收敛重复徽标样式。全程不改数据/服务层——只改**展示**。

**Architecture:** 新增纯函数模块 `src/ui/format.ts`（枚举→中文映射 + ISO→本地友好时间，未知值回退原值）。各组件在渲染处调用它替换生 enum / 生 ISO。按钮层级用既有 `[data-variant]`/`.danger-action` 体系补齐 `danger` 档并给破坏性按钮打标。表单用 `<details>` 渐进披露。共享徽标类进 `components.css`。

**Tech Stack:** TypeScript、Vite、Vitest（jsdom/fake-indexeddb）、原生 DOM、既有 `tokens.css` 设计令牌。

**Spec:** `docs/superpowers/specs/2026-09-04-job-search-app-restructure-design.md`（§6；§8 第 3 期）

## Global Constraints

- **只改展示，不改存储**：`format.ts` 只用于渲染；写入服务的值仍是原始枚举/ISO。不修改 `src/db/*`、`src/features/*` 等服务层与其接口语义。
- **未知值回退**：所有 format 函数遇到未知 key 返回原值（不抛错、不显示空）——防止将来新增枚举时白屏。
- **保留既有交互与选择器**：`data-*` 属性、`name`、`value`（表单提交值）、`data-review-field`、`data-action` 等一律不变；只改**可见文本**与**按钮 variant 样式**。表单 `<select>` 的 `option value` 保持原枚举值，只改 `option` 的可见文本。
- **无测试固化生枚举文本**：已确认 tests/ 无 `toContain("scheduled"/"graduate"/...)` 之类断言，本地化不会破坏现有断言；仍以全量测试为准。
- **组件为工厂函数、无 class**；安全中文错误文案，不回显 `error.message`。
- **命令**：单文件 `npx vitest run <path>`；全量 `npm test`；类型 `npx tsc --noEmit`；构建 `npm run build`；e2e `npm run test:e2e`（期望保持 12/12）。
- **提交**：git 可用；identity 缺失用 `git -c user.name='qh' -c user.email='qh@local' commit ...`。

---

## 文件结构

**新增：**
- `src/ui/format.ts` — 枚举/时间本地化纯函数。
- `src/styles/components.css` — 共享徽标 `.badge` + 变体（收敛 4 处重复 pill 样式）。
- `tests/ui/format.test.ts` — format 单元测试。

**改写（本地化调用点）：**
- `src/components/Dashboard/Dashboard.ts`、`src/components/ApplicationBoard/ApplicationBoard.ts`、`src/components/ApplicationDetail/ApplicationDetail.ts`、`src/components/ResumeLibrary/ResumeLibrary.ts`、`src/components/InterviewCalendar/InterviewCalendar.ts`。
- `src/styles/base.css`（补 `[data-variant="danger"]`）、`src/styles/index.css`（引入 components.css，若未引入）、`src/styles/applications.css`（徽标改用共享类，可选）。

---

## Task 1: 新增 src/ui/format.ts（本地化纯函数）

**Files:**
- Create: `src/ui/format.ts`
- Test: `tests/ui/format.test.ts`

**Interfaces:**
- Consumes: 无（纯函数）。
- Produces（全部具名导出）：
  - `formatJobType(v: string): string`（graduate→应届, internship→实习, tech→技术, general→通用, other→其他）
  - `formatWorkMode(v: string): string`（onsite→现场, remote→远程, hybrid→混合, unknown→未知）
  - `formatInterviewType(v: string): string`（phone→电话, video→视频, onsite→现场, assessment→测评, other→其他）
  - `formatInterviewStatus(v: string): string`（scheduled→已安排, completed→已完成, cancelled→已取消, rescheduled→已改期）
  - `formatResumeStatus(v: string): string`（ready→就绪, needs-review→待确认, extraction-failed→提取失败, deleted→已删除）
  - `formatTimelineEventType(v: string): string`（stage-changed→阶段变更, resume-changed→简历切换, note-added→新增备注, archived→已归档, interview-rescheduled→面试改期；未知回退原值）
  - `formatDateTime(iso: string, timezone?: string): string`（有效 ISO → 用 `Intl.DateTimeFormat("zh-CN", { year/month/day/hour/minute, hour12:false, timeZone? })`；无效/空 → 返回原值）
  - 每个 format\* 未知 key 返回原值。

- [ ] **Step 1: 写失败测试**

创建 `tests/ui/format.test.ts`：
```typescript
import { describe, expect, it } from "vitest";
import { formatJobType, formatWorkMode, formatInterviewType, formatInterviewStatus, formatResumeStatus, formatTimelineEventType, formatDateTime } from "../../src/ui/format";

describe("format", () => {
  it("maps known enums to Chinese and falls back to raw for unknown", () => {
    expect(formatJobType("graduate")).toBe("应届");
    expect(formatJobType("weird")).toBe("weird");
    expect(formatWorkMode("onsite")).toBe("现场");
    expect(formatInterviewType("video")).toBe("视频");
    expect(formatInterviewStatus("scheduled")).toBe("已安排");
    expect(formatResumeStatus("needs-review")).toBe("待确认");
    expect(formatTimelineEventType("stage-changed")).toBe("阶段变更");
    expect(formatTimelineEventType("mystery")).toBe("mystery");
  });
  it("formats ISO into a friendly local string and passes through invalid input", () => {
    const out = formatDateTime("2026-09-04T12:00:00.000Z", "UTC");
    expect(out).toContain("2026");
    expect(out).not.toContain("T12:00:00.000Z");
    expect(formatDateTime("")).toBe("");
    expect(formatDateTime("not-a-date")).toBe("not-a-date");
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/ui/format.test.ts`
Expected: FAIL — 模块不存在。

- [ ] **Step 3: 实现 format.ts**

创建 `src/ui/format.ts`：
```typescript
/** 展示层本地化：枚举→中文、ISO→本地友好时间。仅用于渲染，绝不改动存储值；未知值原样返回。 */
const map = (table: Record<string, string>) => (value: string): string => table[value] ?? value;

export const formatJobType = map({ graduate: "应届", internship: "实习", tech: "技术", general: "通用", other: "其他" });
export const formatWorkMode = map({ onsite: "现场", remote: "远程", hybrid: "混合", unknown: "未知" });
export const formatInterviewType = map({ phone: "电话", video: "视频", onsite: "现场", assessment: "测评", other: "其他" });
export const formatInterviewStatus = map({ scheduled: "已安排", completed: "已完成", cancelled: "已取消", rescheduled: "已改期" });
export const formatResumeStatus = map({ ready: "就绪", "needs-review": "待确认", "extraction-failed": "提取失败", deleted: "已删除" });
export const formatTimelineEventType = map({ "stage-changed": "阶段变更", "resume-changed": "简历切换", "note-added": "新增备注", archived: "已归档", "interview-rescheduled": "面试改期" });

export function formatDateTime(iso: string, timezone?: string): string {
  if (!iso) return iso;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, ...(timezone ? { timeZone: timezone } : {}) }).format(date);
  } catch {
    return date.toLocaleString();
  }
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/ui/format.test.ts`
Expected: PASS。

- [ ] **Step 5: 类型检查 + 提交**

Run: `npx tsc --noEmit`（0 错误）
```bash
git add src/ui/format.ts tests/ui/format.test.ts
git commit -m "feat(ui): add format helpers for enum + datetime localization"
```

---

## Task 2: 全组件本地化调用（替换生枚举 / 生 ISO）

把各组件渲染处的生枚举/生 ISO 替换为 `format.ts` 调用。纯展示改动，不动 `value`/`name`/`data-*`。

**Files:**
- Modify: `src/components/Dashboard/Dashboard.ts`、`src/components/ApplicationBoard/ApplicationBoard.ts`、`src/components/ApplicationDetail/ApplicationDetail.ts`、`src/components/ResumeLibrary/ResumeLibrary.ts`、`src/components/InterviewCalendar/InterviewCalendar.ts`
- Test: `tests/applications/application-detail.test.ts`（补 1 条断言）；其余以现有测试回归为主。

**Interfaces:**
- Consumes: Task 1 的 format 函数。
- Produces: 无新导出。

- [ ] **Step 1: 写/改断言（先失败）**

在 `tests/applications/application-detail.test.ts` 的 interview 用例里，把断言 `toContain("已完成")`（若已有）保留；并新增对 timeline 本地化的断言：在 `baseServices` 的 `listTimeline` 返回含 `type: "stage-changed"` 的事件，断言时间线面板文本包含 `"阶段变更"` 而非 `"stage-changed"`：
```typescript
  it("localizes timeline event type in the timeline tab", async () => {
    const el = createApplicationDetail(document, baseServices()) as ApplicationDetailElement;
    document.body.append(el);
    await el.show("app-1", "timeline");
    expect(el.querySelector('[data-detail-panel="timeline"]')?.textContent).toContain("阶段变更");
    expect(el.querySelector('[data-detail-panel="timeline"]')?.textContent).not.toContain("stage-changed");
  });
```
（`baseServices().applicationService.listTimeline` 已返回 `{ type: "stage-changed", note: "→ 已申请" }`——与现有 fixture 一致。）

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/applications/application-detail.test.ts`
Expected: FAIL — timeline 仍显示 `stage-changed`。

- [ ] **Step 3: ApplicationDetail 本地化**

`src/components/ApplicationDetail/ApplicationDetail.ts`：
1. 顶部 `import { formatInterviewType, formatInterviewStatus, formatTimelineEventType, formatDateTime } from "../../ui/format";`
2. 删除组件内本地常量 `INTERVIEW_TYPE_LABEL`、`INTERVIEW_STATUS_LABEL`（2b 期加的），改用 `formatInterviewType(iv.type)`、`formatInterviewStatus(iv.status)`。
3. 面试行时间 `new Date(iv.startsAt).toLocaleString()` → `formatDateTime(iv.startsAt, iv.timezone)`。
4. 时间线 `${esc(entry.type)}：${esc(entry.note)}` → `${esc(formatTimelineEventType(entry.type))}：${esc(entry.note)}`。
5. 匹配结果 `renderResult` 与匹配历史里的 `${esc(result.createdAt)}` → `${esc(formatDateTime(result.createdAt))}`（两处：`renderResult` 的 `.matching-result__meta` 与 `.matching-history__item`）。

- [ ] **Step 4: ApplicationBoard 本地化**

`src/components/ApplicationBoard/ApplicationBoard.ts`：
1. `import { formatJobType, formatWorkMode } from "../../ui/format";`
2. 卡片 meta（`:180` 附近）`${esc(item.jobType)} · ${esc(item.workMode)}` → `${esc(formatJobType(item.jobType))} · ${esc(formatWorkMode(item.workMode))}`。
3. 筛选下拉与表单下拉的 option **可见文本**改中文，`value` 保持原值：
   - `${JOB_TYPES.map((value) => \`<option value="${value}">${value}</option>\`)` → `<option value="${value}">${formatJobType(value)}</option>`（筛选下拉 `:100`、表单职位类型 `:110` 两处）。
   - `${WORK_MODES.map((value) => \`<option value="${value}">${value}</option>\`)` → `<option value="${value}">${formatWorkMode(value)}</option>`（`:112`）。

- [ ] **Step 5: Dashboard 本地化**

`src/components/Dashboard/Dashboard.ts`：
1. `import { formatJobType, formatDateTime } from "../../ui/format";`
2. jobType 下拉 option 文本：`<option value="${type}">${type}</option>` → `<option value="${type}">${formatJobType(type)}</option>`。
3. `已更新 · ${value.generatedAt}` → `已更新 · ${formatDateTime(value.generatedAt)}`。
4. （可选，若时间为 `new Date(...).toLocaleString()`——保持不动，非生 ISO，不在本期强制。）

- [ ] **Step 6: ResumeLibrary 本地化**

`src/components/ResumeLibrary/ResumeLibrary.ts`：
1. `import { formatResumeStatus } from "../../ui/format";`
2. `:166` `${escapeHtml(resume.status)}` → `${escapeHtml(formatResumeStatus(resume.status))}`。
   （注意：`resume.status === "extraction-failed"`/`"deleted"` 的**逻辑判断**仍用原始值，不受影响——只改显示那一处。）

- [ ] **Step 7: InterviewCalendar 本地化**

`src/components/InterviewCalendar/InterviewCalendar.ts`：
1. `import { formatInterviewStatus } from "../../ui/format";`（type 下拉已是中文，无需改；时间已有 `formatInterviewLocalTime`，保留）
2. `:92` `状态：${escapeHtml(item.status)}` → `状态：${escapeHtml(formatInterviewStatus(item.status))}`。

- [ ] **Step 8: 运行相关 + 全量 + 类型**

Run: `npx vitest run tests/applications/application-detail.test.ts && npm test && npx tsc --noEmit`
Expected: 全绿、0 错误。若个别现有 UI 测试断言了某处生枚举文本（已预扫无），按新中文文案更新该断言。

- [ ] **Step 9: 提交**

```bash
git add -A
git commit -m "refactor(ui): localize enums and ISO timestamps across components via format.ts"
```

---

## Task 3: 创建职位表单渐进式披露

把创建/编辑职位表单的非核心字段折叠进 `<details>`，默认只露必填的「公司 / 职位」（以及阶段、当前简历、JD 文本这几个高频项按需保留在外）。表单提交与编辑回填逻辑不变。

**Files:**
- Modify: `src/components/ApplicationBoard/ApplicationBoard.ts`
- Modify(如需): `src/styles/applications.css`（`<details>` 展开样式）
- Test: `tests/applications/application-board.test.ts`（回归；必要时补 1 条）

**Interfaces:** 无新导出；表单 `name`/`value`/提交逻辑不变。

- [ ] **Step 1: 确认现有测试仍可提交**

阅读 `tests/applications/application-board.test.ts` 的"creates an application…"用例：它 `fill` 公司/职位/网址/JD 后 `requestSubmit()`。由于 `<details>` 内的表单控件即使 `<details>` 收起也仍在 DOM 且可被 `FormData`/程序化赋值读取，提交不受影响——本任务不应破坏该用例。先跑一遍确认基线：
Run: `npx vitest run tests/applications/application-board.test.ts` → 记录当前通过数。

- [ ] **Step 2: 表单结构改造**

`src/components/ApplicationBoard/ApplicationBoard.ts` 的 `<form class="application-form">`（`:107-133` 附近）：
- 保留在外（默认可见）：公司、职位（必填）、阶段（stageId）、当前简历（currentResumeId）、确认 JD 文本（jdText）、上传 JD 文件。
- 其余字段（职位类型 jobType、地点 location、工作模式 workMode、薪资 salaryText、来源 source、招聘网址 jobUrl、截止时间 deadline、联系人 contact、优先级 priority、职位备注 note）包进：
  ```html
  <details class="application-form__more"><summary>更多信息（选填）</summary>
    <div class="application-form__grid">…这些字段…</div>
  </details>
  ```
- **不改**任何 `name`/`id`/`value`/`option`，只移动 DOM 位置到 `<details>` 内、并保留原 `<label>` 结构。编辑职位时（`edit` 分支）为了让用户看到已填的选填值，可在进入编辑时把 `<details>` 设为 `open`（在 `edit` handler 里 `form.querySelector(".application-form__more")?.setAttribute("open","")`）。

- [ ] **Step 3: 样式（如需）**

`src/styles/applications.css` 补 `.application-form__more`（summary 可点、间距）与 `<details>` 内 grid 间距，用既有 token。

- [ ] **Step 4: 回归 + 全量 + 类型 + 构建**

Run: `npx vitest run tests/applications/application-board.test.ts && npm test && npx tsc --noEmit && npm run build`
Expected: 全绿、构建成功。创建/编辑职位用例不受折叠影响。

- [ ] **Step 5: 提交**

```bash
git add -A
git commit -m "feat(applications): progressive-disclosure create form (essentials + 更多信息 details)"
```

---

## Task 4: 按钮层级（危险档）+ components.css 徽标收敛

补齐 `danger` 按钮档并给破坏性操作打标；把 4 处重复 pill 徽标收敛到 `components.css` 的共享 `.badge`。

**Files:**
- Modify: `src/styles/base.css`（`[data-variant="danger"]`）
- Create: `src/styles/components.css`；Modify `src/styles/index.css`（引入）
- Modify: 破坏性按钮所在组件（加 `data-variant="danger"`）：`src/components/ResumeLibrary/ResumeLibrary.ts`（删除）、`src/components/ApplicationDetail/ApplicationDetail.ts`（删除职位）。设置页已有 `.danger-action`（清除数据/清除AI），统一对齐。
- Modify(可选): `src/styles/resumes.css`、`applications.css`（徽标改用共享类）
- Test: 全量 + e2e

**Interfaces:** 无新导出；仅样式类与 `data-variant` 属性。

- [ ] **Step 1: base.css 补 danger 档**

`src/styles/base.css` 在 secondary 变体附近增加：
```css
button[data-variant="danger"] {
  background: var(--danger);
  border-color: var(--danger);
  color: #fff;
}
button[data-variant="danger"]:hover {
  background: var(--danger-strong);
  border-color: var(--danger-strong);
}
```
（复用既有 `--danger`/`--danger-strong` token；与 `.danger-action` 视觉一致——可让 `.danger-action` 与 `[data-variant="danger"]` 合并为同一组规则以去重。）

- [ ] **Step 2: 给破坏性按钮打标**

- `ResumeLibrary.ts`：删除按钮 `<button ... data-action="delete" ...>删除</button>` 加 `data-variant="danger"`。
- `ApplicationDetail.ts`：概览面板 `data-action="delete"`（删除职位）加 `data-variant="danger"`；确认对话框的"确认"（`confirm-application-action`）保持默认或次级（不强制）。
- （设置页清除数据/清除 AI 已用 `.danger-action`，无需改；若要统一可加 `data-variant="danger"`——非必须。）

- [ ] **Step 3: components.css 徽标收敛**

创建 `src/styles/components.css`：
```css
/* 共享徽标（pill）：收敛 usage-badge / resume-default-badge / application-card__archived-badge / detail-interview-status */
.badge {
  display: inline-block;
  padding: 2px 8px;
  font-size: var(--fs-xs);
  font-weight: var(--fw-medium);
  border-radius: var(--r-pill);
  background: var(--accent-weak);
  color: var(--accent-text);
}
.badge--muted { background: var(--surface-2); color: var(--text-2); }
.badge--success { background: var(--accent-weak); color: var(--accent-text); }
```
在 `src/styles/index.css` 引入 `@import "./components.css";`（确认未重复）。**本任务对徽标的收敛保持保守**：仅新增 `.badge` 供后续复用，并把 `detail-interview-status`（2b 新增、最年轻、无历史包袱）改挂 `.badge`（组件里 class 从 `detail-interview-status` 改/加 `badge`）。既有 `usage-badge` 等**暂不动**（避免大范围视觉回归），留注释说明后续可迁移。（YAGNI：不为收敛而收敛。）

- [ ] **Step 4: 全量 + 类型 + 构建 + e2e**

Run: `npm test && npx tsc --noEmit && npm run build && npm run test:e2e`
Expected: 单测全绿、0 错误、构建成功、e2e 12/12（按钮 variant 与徽标为纯样式，不改选择器/文本，e2e 不受影响）。

- [ ] **Step 5: 提交**

```bash
git add -A
git commit -m "style(ui): add danger button variant + shared .badge; tag destructive actions"
```

---

## Self-Review

**1. Spec 覆盖（§6 / §8 第 3 期）：** `format.ts` 枚举+时间本地化 → Task 1/2 ✅；按钮主/次/危险三档 → Task 4（primary 默认 + secondary 既有 + danger 新增）✅；表单渐进披露 → Task 3 ✅；`components.css` → Task 4（保守收敛）✅。

**2. 占位符扫描：** 无 TODO/TBD；各调用点给出精确替换。Task 4 的徽标收敛刻意保守（只迁最年轻的一个 + 新增 `.badge`），避免为收敛制造回归——已在步骤中说明理由（YAGNI）。

**3. 类型一致性：** format 函数签名 `(string)=>string` / `(iso, tz?)=>string` 在 Task 1 定义、Task 2 各处调用一致；未知值回退保证遇到 `Interview["status"]` 等联合类型的任意成员都安全。表单 `value`/`name` 不变，保证提交/回填与服务层契约不变。

**4. 风险点：**
- **只改显示不改逻辑**：ResumeLibrary/InterviewCalendar 里 `status === "extraction-failed"` 等**判断**必须用原始值，本地化只包在显示串上（Task 2 Step 6/7 已强调）。reviewer 重点核对：没有把 `formatX(...)` 的结果又拿去做等值判断。
- **表单折叠不破坏提交**：`<details>` 内控件仍在 DOM，FormData 可读；现有创建用例不受影响（Task 3 Step 1 先验基线）。
- **option value 不变**：只改 option 可见文本，`value` 保持原枚举——筛选/提交逻辑不变。
