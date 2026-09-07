# 第 2b 期 · 详情页「面试 + 复盘」子标签 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在职位详情枢纽页新增「面试」「复盘」两个子标签：面试标签展示**本职位**各轮面试（只读列表 + 每场"填写复盘" + "去面试日历安排"跳转）；复盘标签复用现有 `InterviewReview` 组件，点某场面试的"填写复盘"即选中该场并切到复盘标签。不在详情内重做排期 UI（排期/提醒/ICS 仍由顶层面试日历负责）。

**Architecture:** 轻量方案。`ApplicationDetail` 的 `DetailTab`/`TABS` 增加 `interview`、`review` 两项；`ApplicationDetailOptions` 增加 `interviewService`（`listInterviews(applicationId)`）与 `reviewService`（`getReview`/`saveReview`）。`show()` 用 `interviewService.listInterviews(applicationId)` 载入本职位面试并渲染 interview 面板。review 面板挂载一个 `createInterviewReview(...)` 实例（复用，不重写）；面试面板的"填写复盘"按钮向该复盘实例派发 `interview-selected` 并切到 review 标签。"去面试日历安排"按钮经 `bus.emit("app-navigate", { name: "interviews" })` 跳顶层日历。createApp 把 `interviewService`/`reviewService` 透传给详情组件。

**Tech Stack:** TypeScript、Vite、Vitest（fake-indexeddb/jsdom）、原生 DOM、appBus/router（第 1–2a 期）、复用 `InterviewReview`。

**Spec:** `docs/superpowers/specs/2026-09-04-job-search-app-restructure-design.md`（§3 hub 子标签含 面试/复盘；§8 第 2b 期）

## Global Constraints

- **不改底层**：不修改 `src/db/*`、`src/features/*` 服务层接口语义、其它 service。仅 `src/components/ApplicationDetail/ApplicationDetail.ts`、`src/app/createApp.ts`、样式与测试。
- **不重做排期 UI**：详情内不提供面试创建/改期/取消/完成/提醒；这些仍在顶层面试日历。详情的面试面板是只读列表 + 复盘入口 + 跳转按钮。
- **复用 InterviewReview**，不重写复盘表单逻辑。
- **不动顶层面试视图**：createApp 现有的 `.interview-calendar-mount` / `.interview-review-mount` 与其 `interview-selected` 接线保持不变。
- **枚举中文化最小化**：面试 type/status 在本组件内用一个小的本地映射表转中文（Phase 3 的 `format.ts` 会统一收口；此处不引入 format.ts，避免抢 Phase 3 范围）。时间用 `new Date(startsAt).toLocaleString()`。
- **导航 5 区不变**；`DetailTab` 由 7 增至 9（新增 interview/review），顶层 tab 数不变。
- 组件为工厂函数、无 class；持久监听接入 `signal`。安全中文错误文案，不回显 `error.message`。
- **命令**：单文件 `npx vitest run <path>`；全量 `npm test`；类型 `npx tsc --noEmit`；构建 `npm run build`。
- **提交**：git 可用；identity 缺失用 `git -c user.name='qh' -c user.email='qh@local' commit ...`。

---

## 文件结构

**改写：**
- `src/components/ApplicationDetail/ApplicationDetail.ts` — 加 interview/review 到 DetailTab+TABS；options 加 interviewService/reviewService；show() 载入并渲染面试面板；review 面板挂载 InterviewReview；面试列表"填写复盘"选中并切标签；"去面试日历"跳转。
- `src/app/createApp.ts` — 给 `createApplicationDetail(...)` 传 `interviewService`、`reviewService`。
- `src/styles/applications.css` — 面试列表最小样式（可选，复用现有类）。

**测试：**
- `tests/applications/application-detail.test.ts` — 追加 interview/review 用例。

---

## Task 1: ApplicationDetail 增加面试/复盘子标签（组件层）

**Files:**
- Modify: `src/components/ApplicationDetail/ApplicationDetail.ts`
- Test: `tests/applications/application-detail.test.ts`

**Interfaces:**
- Consumes: `createInterviewReview`（`../InterviewReview/InterviewReview`）；`Interview`（`../../db/types`）；`interviewService.listInterviews(applicationId): Promise<Interview[]>`；`reviewService.getReview(id)/saveReview(id, input)`。
- Produces:
  - `DetailTab` 增加 `"interview" | "review"`（最终 9 值：overview/jd/resume/matching/ai/timeline/note/interview/review）。
  - `ApplicationDetailOptions` 增加：
    ```typescript
    interviewService?: { listInterviews(applicationId?: string): Promise<import("../../db/types").Interview[]> };
    reviewService?: { getReview(interviewId: string): Promise<any>; saveReview(interviewId: string, input: any): Promise<any> };
    ```

- [ ] **Step 1: 写失败测试**

在 `tests/applications/application-detail.test.ts`：顶部按需 `import`；`baseServices` 增加 `interviewService`、`reviewService`：
```typescript
// 在 baseServices overrides 默认里加：
interviewService: { listInterviews: async (appId?: string) => appId === "app-1" ? [
  { id: "iv-1", applicationId: "app-1", round: 1, type: "video", title: "技术一面", startsAt: "2026-09-10T02:00:00.000Z", timezone: "UTC", status: "completed", reminders: [], locationOrLink: "", interviewer: "王工", note: "" },
] : [] },
reviewService: { getReview: async () => undefined, saveReview: vi.fn(async (id: string, input: any) => ({ ...input, interviewId: id, id: "rv-1", createdAt: "2026-09-10T00:00:00.000Z", updatedAt: "2026-09-10T00:00:00.000Z" })) },
```
追加用例：
```typescript
  it("renders the interview tab listing this application's interviews", async () => {
    const el = createApplicationDetail(document, baseServices()) as ApplicationDetailElement;
    document.body.append(el);
    await el.show("app-1", "interview");
    expect(el.querySelector('[data-detail-tab="interview"]')).toBeTruthy();
    expect(el.querySelector('[data-detail-panel="interview"]')?.hasAttribute("hidden")).toBe(false);
    expect(el.querySelector('[data-detail-panel="interview"]')?.textContent).toContain("技术一面");
    expect(el.querySelector('[data-detail-panel="interview"]')?.textContent).toContain("已完成"); // status 中文
    expect(el.querySelector('[data-action="fill-review"][data-interview-id="iv-1"]')).toBeTruthy();
  });

  it("selecting fill-review switches to the review tab and targets that interview", async () => {
    const el = createApplicationDetail(document, baseServices()) as ApplicationDetailElement;
    document.body.append(el);
    await el.show("app-1", "interview");
    (el.querySelector('[data-action="fill-review"][data-interview-id="iv-1"]') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 0));
    expect(el.querySelector('[data-detail-tab="review"]')?.getAttribute("aria-selected")).toBe("true");
    expect(el.querySelector('[data-detail-panel="review"]')?.hasAttribute("hidden")).toBe(false);
    // InterviewReview 已选中该面试（状态不再是“请选择面试”）
    expect(el.querySelector('[data-detail-panel="review"] [data-review-status]')?.textContent).not.toBe("请选择面试");
  });

  it("interview tab offers a jump to the top-level calendar", async () => {
    const el = createApplicationDetail(document, baseServices()) as ApplicationDetailElement;
    document.body.append(el);
    const navs: any[] = [];
    (el as any); // bus via options
    await el.show("app-1", "interview");
    expect(el.querySelector('[data-action="open-interview-calendar"]')).toBeTruthy();
  });
```
（第三个用例只验证按钮存在；bus 导航行为在 Task 2 全链路验证。）

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/applications/application-detail.test.ts`
Expected: FAIL — interview/review 标签与面板、`fill-review`/`open-interview-calendar` 尚不存在。

- [ ] **Step 3: 扩展 DetailTab / TABS / options**

`src/components/ApplicationDetail/ApplicationDetail.ts`：
1. `DetailTab` 增加 `"interview" | "review"`；`TABS` 追加 `{ key: "interview", label: "面试" }`、`{ key: "review", label: "复盘" }`（放在 timeline/note 之后或语义顺序：建议顺序 overview, jd, resume, interview, matching, ai, review, timeline, note——但为降低测试脆弱性，**只需追加到数组末尾**即可，顺序不影响功能）。追加到末尾：`note` 之后加 interview、review。
2. `ApplicationDetailOptions` 增加 `interviewService?`、`reviewService?`（见 Produces）。
3. 顶部 `import { createInterviewReview } from "../InterviewReview/InterviewReview";` 和 `import type { Interview } from "../../db/types";`（若类型未引入）。
4. 加本地枚举中文映射（组件内常量）：
   ```typescript
   const INTERVIEW_TYPE_LABEL: Record<string, string> = { phone: "电话", video: "视频", onsite: "现场", assessment: "测评", other: "其他" };
   const INTERVIEW_STATUS_LABEL: Record<string, string> = { scheduled: "已安排", completed: "已完成", cancelled: "已取消", rescheduled: "已改期" };
   ```

- [ ] **Step 4: review 面板挂载 InterviewReview（一次）**

在组件初始化（`root.innerHTML` 之后、`show` 定义附近）挂载复盘组件到 review 面板，仅一次：
```typescript
const reviewComponent = createInterviewReview(documentRef, { reviewService: options.reviewService });
panelFor("review").appendChild(reviewComponent);
```
（`panelFor("review")` 在 innerHTML 里已作为空 `[data-detail-panel="review"]` 存在。）保存 `reviewComponent` 引用供 fill-review 使用。

- [ ] **Step 5: show() 渲染面试面板**

在 `show()` 内，与其它面板并列，用已载入的本职位面试渲染 interview 面板（在 `Promise.all` 里加 `interviewService?.listInterviews(applicationId)`；若无服务则 `[]`）：
```typescript
const interviews = options.interviewService ? await options.interviewService.listInterviews(applicationId) : [];
panelFor("interview").innerHTML = `
  <div class="application-detail__actions"><button type="button" data-action="open-interview-calendar">去面试日历安排</button></div>
  <ul class="detail-interview-list">${interviews.length ? interviews.map((iv) => `
    <li data-interview-id="${esc(iv.id)}">
      <strong>第${esc(iv.round)}轮 · ${esc(INTERVIEW_TYPE_LABEL[iv.type] ?? iv.type)}</strong>
      <span>${esc(iv.title)}</span>
      <time datetime="${esc(iv.startsAt)}">${esc(new Date(iv.startsAt).toLocaleString())}</time>
      <span class="detail-interview-status">${esc(INTERVIEW_STATUS_LABEL[iv.status] ?? iv.status)}</span>
      ${iv.interviewer ? `<span>面试官：${esc(iv.interviewer)}</span>` : ""}
      <button type="button" data-action="fill-review" data-interview-id="${esc(iv.id)}">填写复盘</button>
    </li>`).join("") : "<li>本职位暂无面试；点上方按钮去面试日历安排。</li>"}</ul>`;
```
`review` 面板不在 `show()` 里重写 innerHTML（已挂 InterviewReview 组件，重写会销毁它）——**review 面板由 InterviewReview 组件自管理，show() 跳过它**。

- [ ] **Step 6: click 委托——fill-review 与 open-interview-calendar**

在 `root` 的 click 委托里（`[data-action]` 分支）新增：
```typescript
if (action === "fill-review" && target.dataset.interviewId) {
  reviewComponent.dispatchEvent(new CustomEvent("interview-selected", { detail: target.dataset.interviewId }));
  activateTab("review");
  if (currentId) options.bus?.emit("app-navigate", { name: "applications", applicationId: currentId, tab: "review" });
  return;
}
if (action === "open-interview-calendar") { options.bus?.emit("app-navigate", { name: "interviews" }); return; }
```
（`activateTab` 已存在；tab 切换的 aria/hidden 逻辑复用。）

- [ ] **Step 7: 运行组件测试确认通过**

Run: `npx vitest run tests/applications/application-detail.test.ts`
Expected: PASS（原有用例 + 3 个新用例）。

- [ ] **Step 8: 类型检查 + 全量**

Run: `npm test && npx tsc --noEmit`
Expected: 全绿、0 类型错误（详情组件此时尚未从 createApp 收到 interviewService/reviewService，但组件对缺省 service 有降级，`npm test` 应仍全绿）。

- [ ] **Step 9: 提交**

```bash
git add src/components/ApplicationDetail/ApplicationDetail.ts tests/applications/application-detail.test.ts
git commit -m "feat(applications): add interview + review sub-tabs to detail hub"
```

---

## Task 2: createApp 透传 interviewService/reviewService + 整期验证

**Files:**
- Modify: `src/app/createApp.ts`
- Modify(如需): `src/styles/applications.css`（面试列表样式）
- Test: 全量 + e2e

**Interfaces:**
- Consumes: Task 1 的 `ApplicationDetailOptions.interviewService/reviewService`。
- Produces: 无新导出。

- [ ] **Step 1: createApp 传服务**

`src/app/createApp.ts`：在 `createApplicationDetail(documentRef, { ... })` 的 options 里增加：
```typescript
interviewService: options.interviewService,
reviewService: options.reviewService,
```
（`options.interviewService`/`options.reviewService` 已存在于 `CreateAppOptions` 并已用于顶层面试视图——此处复用同一实例，不新建。）

- [ ] **Step 2: 面试列表最小样式**

在 `src/styles/applications.css` 追加 `.detail-interview-list`（去掉 list-style、纵向间距）、`.detail-interview-list li`（flex 换行、间距）、`.detail-interview-status`（小徽标，用既有 token 与 `.usage-badge` 类似风格）。仅用 `tokens.css` 变量，不引入新色值。

- [ ] **Step 3: 全量测试 + 类型 + 构建**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: 全绿、0 错误、构建 `✓ built`。

- [ ] **Step 4: e2e（best-effort）**

Run: `npm run test:e2e`
Expected: 保持 12/12（本期只在详情页新增标签，不改顶层流程与既有 e2e 断言路径）。若新增失败，排查是否因 DetailTab 增加影响既有子标签断言（不应——既有断言按 `[data-detail-tab="..."]` 精确定位）。环境无浏览器则记录"未执行"，不阻断。

- [ ] **Step 5: 提交**

```bash
git add -A
git commit -m "feat(app): pass interview/review services to detail hub; interview list styles"
```

---

## Self-Review

**1. Spec 覆盖（§8 第 2b 期）：** 本职位面试列表 → Task 1 Step 5 ✅；复盘接入（复用 InterviewReview）→ Task 1 Step 4/6 ✅；按 applicationId 过滤 → `listInterviews(applicationId)` ✅；服务透传 → Task 2 Step 1 ✅。不重做排期 UI（轻量方案，用户已选）✅。

**2. 占位符扫描：** 无 TODO/TBD；新增渲染/handler 给出完整代码；复用 InterviewReview 不重写。

**3. 类型一致性：** `DetailTab` 增 interview/review，TABS 同步；`interview-selected` detail 为 interviewId 字符串，与 InterviewReview 监听一致（`(event as CustomEvent<string>).detail`）；`open-interview-calendar` 用 `app-navigate {name:"interviews"}`，router 已识别 `interviews` 单段视图（第 2a 期未改单段行为）✅。

**4. 风险点：**
- review 面板由 InterviewReview 组件自管理——`show()` 必须**跳过**重写 review 面板 innerHTML，否则销毁组件（Task 1 Step 5 已明确）。回归风险点，reviewer 重点看。
- 切到 review 标签前需先派发 interview-selected 再 activateTab（顺序不影响，因为组件已挂载并常驻）。
- 顶层面试视图与详情内的复盘是两个独立 InterviewReview 实例，互不干扰（各自 root 监听 interview-selected）。
