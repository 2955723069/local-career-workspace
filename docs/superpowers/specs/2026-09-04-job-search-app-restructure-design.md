# 本地求职工作台 · 架构与体验重整设计

- 状态：待评审
- 日期：2026-09-04
- 范围：前端信息架构、代码组织、UI 一致性、四项重交互重建
- 明确不动：IndexedDB schema、服务层、加密/迁移、已修复的安全逻辑（均有测试护航）

## 1. 背景与问题诊断

项目功能基本齐全（已核对设计规格，功能需求均实现），但用户反馈"使用逻辑、功能、页面、UI 排版都很混乱"。经通读前端代码（`createApp.ts`、7 个视图、组件、样式令牌、PRD），混乱的根源不在视觉，而在三层：

1. **使用逻辑乱（最致命）**：7 个平级顶层标签一字排开，没有主次。求职核心闭环「简历 → 投某职位 → 面这个职位 → 复盘这个职位」被拆散在互不相通的标签里。PRD 里的核心概念「职位详情聚合页」根本没实现——「JD 匹配 / AI 顾问 / 面试 / 复盘」本应挂在某个具体职位下，现在却各自是独立全局标签，用户得在每个标签反复重选同一职位。这是"不顺手"的真正来源。

2. **代码结构乱**：`createApp.ts` 是 877 行的上帝文件，混合了「应用外壳 + 整个简历库 UI + 整个设置 UI + 导航」。简历库和设置没有独立组件（其他功能都有），结构不一致。`src/components/ResumeLibrary/ResumeLibrary.ts`（52 行 class）是**从未被引用的死代码**，而 `createApp` 又内联手写了另一套 270 行的简历 UI。组件写法也不统一：多数是 `create*()` 工厂函数，`ResumeLibrary` 却是 class。

3. **UI 应用不一致**：设计令牌（`tokens.css`）本身规范完整，但用得乱——生的英文枚举（`needs-review`/`onsite`）与 ISO 时间（`2026-09-04T12:00:00.000Z`）直接展示给中文用户、按钮一律扁平等权平铺、创建职位表单 14+ 字段常驻页顶（实际必填仅公司+职位）。

**结论**：这不是缺功能，是功能摆得乱。本方案保留全部已通过测试的底层与安全修复，只重整前端的组织方式与体验。

## 2. 已确认的决策

| 决策点 | 选择 |
|---|---|
| 改动深度 | 重组架构 + 统一 UI，**保留稳固的数据/服务层** |
| 导航结构 | **5 主区 + 职位详情枢纽页** |
| 重交互范围 | 四项**全部纳入**：看板拖拽、真月历网格、时区下拉、恢复冲突批量 |
| 本地化 + 表单精简 | 默认包含 |

## 3. 目标信息架构

顶层收敛到 **5 个主区**：

```
首页 | 职位 | 简历库 | 面试日历 | 设置
```

新增**职位详情枢纽页**（点击任一职位卡进入），内部用二级子标签聚合该职位的一切：

```
概览 · JD · 简历(当前+历史) · 面试 · 匹配 · AI顾问 · 复盘 · 时间线 · 备注
```

「JD 匹配」「AI 顾问」从顶层标签下沉为详情页子标签——它们本就是"针对某职位"的动作。这一步直接消灭"在每个标签里反复重选同一职位"的核心痛点，并使实现对齐 PRD 第 4 节"职位详情聚合 JD、当前简历、简历历史、时间线、面试、匹配、AI 对话、复盘和备注"。

**面试日历**保留为顶层（它是跨职位的时间视图），但每张面试卡可反向跳转到对应职位详情。

## 4. 代码架构重构

治理"上帝文件"，统一组件形态。

- `createApp.ts`（877 行）瘦身为**纯组合根**（目标 ≈150 行）：只建外壳、挂路由、注册视图、连事件总线。
- 内联简历 UI（270 行）抽成 **`createResumeLibrary(documentRef, options): HTMLElement`** 组件；**删除**未被引用的 `ResumeLibrary` class 死代码。
- 内联设置 UI（偏好 / AI 接口 / 数据管理，170 行）抽成 **`createSettingsPage(documentRef, options): HTMLElement`** 组件。
- **统一组件写法**：全部收敛为 `create*(documentRef, options): HTMLElement` 工厂函数，消除 class 异类。
- **事件通信规范化**：现状是一堆在 root 上冒泡的 CustomEvent（脆弱、易漏转发——上次"面试复盘断裂"正是漏了一个转发器所致）。引入极薄的 **`appBus`（`emit(type, detail)` / `on(type, handler): unsubscribe`）**：组件间通信、导航切换、跨视图刷新一律走它。appBus 生命周期挂在 `createApp` 的 `AbortController` signal 上，二次渲染自动清理。

### 目标文件结构（新增/变更）

```
src/app/createApp.ts          组合根（大幅瘦身）
src/app/appBus.ts             轻量事件总线（新增）
src/app/router.ts             hash 路由 + 视图切换（从 createApp 抽出）
src/components/ResumeLibrary/ 改为 create* 工厂，承接原内联简历 UI
src/components/SettingsPage/  新增，承接原内联设置 UI
src/components/ApplicationDetail/  新增，职位详情枢纽页
src/ui/format.ts              枚举/时间本地化（新增）
src/styles/components.css     通用组件类（新增）
```

## 5. 职位详情枢纽页

> **实现修正（2026-09-06，实施第 2 期前的代码勘察结论）**：勘察发现现实与本节初稿假设相反，据此修正方案（决策已确认）。
>
> - `ApplicationBoard` 中**已存在**一个内联"职位详情"面板（`showDetail`），已聚合 JD、阶段切换、简历切换、备注、归档/删除、**本地匹配（内联实现）**、**AI 顾问（内联实现）**、简历使用历史、时间线，且**有测试覆盖**（`application-board.test.ts` 覆盖查看详情、run-matching、匹配结果、AI 对话）。
> - 顶层独立页 `MatchingPage`、`AiPage` 是**功能重复且零 UI 测试**的实现（tests / e2e 均无引用其顶层 tab 或组件选择器）。
> - 因此初稿"复用 MatchingPage/AiPage 作嵌入式子标签"方向错误：那两个独立页是**未测试的劣化重复品**。修正为——**抽取已测试的内联详情**为枢纽页，**退役**未测试的独立 MatchingPage/AiPage。

- 新增 `createApplicationDetail(documentRef, { ...services }): HTMLElement`——由 `ApplicationBoard` 现有内联 `showDetail` 逻辑**抽取而来**（复用已测试实现，不重写匹配/AI）。
- 路由分层：`#applications`（看板）→ `#applications/:id`（详情）→ `#applications/:id/:tab` 子标签。浏览器前进/后退可用。
- 子标签**懒加载**：进入某子标签才拉取对应数据，避免一次性全量加载。
- **退役**顶层 `matching`、`ai` 视图与其独立组件文件（`MatchingPage.ts`/`AiPage.ts`）；其功能由详情页的匹配/AI 子标签承担。顶层从 7 区收敛到 5 区。
- 详情页顶部固定显示「公司 · 职位 · 当前简历 · 阶段」上下文条，各子标签共享，无需重选。原独立页的"选择职位"下拉不再需要。
- 面试日历保留顶层（跨职位时间视图）；详情页的「面试」子标签只展示**本职位**的面试与复盘。

## 6. UI / 本地化统一层

- **`src/ui/format.ts`**：集中映射
  - 英文枚举 → 中文：`needs-review→待确认`、`extraction-failed→提取失败`、`ready→就绪`、`scheduled→已安排`、`rescheduled→已改期`、`completed→已完成`、`cancelled→已取消`、`onsite→现场`、`remote→远程`、`hybrid→混合`、`graduate→应届`、`internship→实习`、`tech→技术`、`general→通用` 等。
  - ISO 时间 → 本地友好格式（按记录时区或用户默认时区，`Intl.DateTimeFormat`）。
  - 所有组件统一调用，消灭生 enum / 生 ISO 直显。
- **按钮层级**：主 / 次 / 危险三档语义样式（现状全等权扁平）。危险操作（删除）视觉区分。以 `data-variant` + `components.css` 类实现。
- **表单渐进式披露**：创建职位默认只露"公司 + 职位"两必填，其余 12 字段折叠进「更多信息」`<details>`。
- **`src/styles/components.css`**：沉淀按钮 / 表单 / 卡片 / 标签 / 子标签的通用类，减少 12 个 CSS 文件各写各的重复。既有 `tokens.css` 变量体系保留。

## 7. 四项重交互重建

- **看板拖拽换列**：HTML5 drag-and-drop，跨阶段拖动即改 `stageId` 并写时间线事件（`stage-changed`）。保留键盘可达的"移动到…"下拉作为无障碍兜底。末列不再静默无反馈。
- **真·月历网格**：月视图渲染 6×7 网格，格内以点状标记面试数量，点击某格展开当天面试列表。日 / 周视图保留。
- **时区下拉选择器**：用 `Intl.supportedValuesOf('timeZone')`（不可用时回退到内置常用时区列表）生成下拉，默认高亮本地时区。消除"手输 IANA 输错整表保存失败"的坑。
- **恢复冲突批量策略**：在逐项选择之上增加"全部保留本地 / 全部使用备份 / 全部导入副本"一键批量，逐项仍可微调覆盖。默认不覆盖本地（沿用 PRD 约束）。

## 8. 分期交付

一次性全推风险过大。分期交付，每期独立可交付，测试全绿再进下一期：

1. **地基期**（✅ 已完成，已合并 master）：`appBus` + `router` 抽出 + `createApp` 拆分（抽简历/设置组件、删死代码、统一工厂写法）。用户可见变化最小，纯结构治理。
2. **枢纽期**（拆为 2a/2b，降低单次改动风险）：
   - **2a**（✅ 已完成，已合并 master）：抽取内联详情为 `createApplicationDetail` 路由枢纽页 + 子标签（概览 / JD / 简历 / 匹配 / AI / 时间线 / 备注——均为详情现已具备的内容）；顶层从 7 区收敛到 5 区（退役 matching/ai 顶层 tab 与独立组件）。← 体验质变在此发生。
   - **2b**（✅ 已完成，已合并 master）：把「本职位面试 + 复盘」作为新子标签接入详情页（按 applicationId 过滤 interviewService/reviewService）。
3. **统一层期**（✅ 已完成，已合并 master）：`format.ts` 本地化 + 按钮层级 + 表单渐进披露 + `components.css`。
4. **重交互期**（拆项交付，逐项独立 plan→执行→合并）：
   - **4a**（✅ 已完成，已合并 master）：看板拖拽换列（拖卡跨列改 `stageId`，复用 `changeStage` 写 `stage-changed` 时间线）+ 键盘可达「移动到…」下拉无障碍兜底。
   - **4b**：真·月历网格（6×7）。
   - **4c**：时区下拉选择器（`Intl.supportedValuesOf`）。
   - **4d**：恢复冲突批量策略。

## 9. 测试策略

- **服务层 / 数据层测试原样保留**——底层不动，继续护航。
- 每期为新组件补 UI 测试（沿用现有 vitest + fake-indexeddb 模式）。`appBus`、`router`、详情页子标签切换均需回归测试。
- 补 Playwright e2e 覆盖新主流程：`建简历 → 建职位(绑简历) → 进详情 → 匹配 → 面试 → 复盘`。
- 每期结束跑全量 `npm test` + `npx tsc --noEmit` + `npm run build`，全绿才推进下一期。

## 10. 风险与回滚

- **最大风险**：路由与详情页的事件流改动面较大。缓解——分期、每期全绿、appBus 有独立回归测试。
- **兼容性**：hash 路由从单段（`#applications`）扩展为多段（`#applications/:id/tab`），需保证旧 hash 与无 hash 时回退到 `首页`（`overview`）。
- **回滚粒度**：每期是独立提交，若某期出问题可单独回退，不影响已交付的前序期。

## 11. 非目标

- 不改 IndexedDB schema、服务层接口语义、加密/迁移/备份格式。
- 不引入前端框架（保持原生 DOM + 工厂函数风格）。
- 不改 PRD 已界定的非目标（无账户、无云同步、无在线排版等）。
