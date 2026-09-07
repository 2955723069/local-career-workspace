# 求职工作台多页面与功能缺口补全设计

日期：2026-09-03

## 1. 背景与目标

当前应用已经有简历、职位、面试、匹配、AI、备份等领域服务，但页面协调层只暴露了 5 个标签页，部分设置接口没有 UI，提醒服务会在保存时立即创建通知，多个跨组件动作只派发事件而没有消费者。

本次工作补全产品要求定义的 7 个功能页面，并修复已识别的功能一致性问题，同时保留现有 IndexedDB schema、领域服务和备份格式，不引入后端或远程状态。

目标：

- 提供首页、简历库、职位申请、面试日历、JD 匹配、AI 顾问、设置与备份 7 个可直达页面。
- 让页面切换支持 hash 深链接、浏览器前进/后退和刷新恢复。
- 首页摘要和仪表盘数据保持一致，并在业务变更后刷新。
- 提供完整的本地设置入口，包括默认时区、默认提醒、通知权限、AI 配置、连接测试、数据统计、清除数据、隐私说明和 AI 发送记录。
- 保证提醒只在到达提醒时间时触发；无法后台运行时给出明确降级提示。
- 保证 JD 文件导入失败不会留下已创建但未完成的职位，或在失败时提供可恢复的一致状态。
- 清除数据后刷新所有页面状态，只删除应用自己的 localStorage 键。

非目标：不改变 IndexedDB 版本和备份协议，不增加服务端同步，不生成排版后的简历文件，不实现浏览器关闭后的后台通知服务。

## 2. 页面与路由架构

### 2.1 页面集合

应用导航使用以下稳定标识：

| 页面 | hash | 内容 |
| --- | --- | --- |
| 首页 | `overview` | 摘要、今日事项、仪表盘 |
| 简历库 | `resumes` | 上传、提取确认、版本管理、搜索、下载、删除 |
| 职位申请 | `applications` | 看板/列表、职位编辑、职位详情快捷入口 |
| 面试日历 | `interviews` | 日/周/月、面试 CRUD、通知授权、ICS、复盘入口 |
| JD 匹配 | `matching` | 选择职位和简历、运行本地匹配、历史与证据 |
| AI 顾问 | `ai` | 按职位隔离的对话、发送预览、追问、复制、报告导出 |
| 设置与备份 | `settings` | 偏好、AI 配置、通知、数据管理、备份恢复、隐私与发送记录 |

职位详情仍保留匹配和 AI 快捷入口；点击快捷入口切换到对应页面并携带 applicationId，避免重复实现业务逻辑。

### 2.2 路由协调器

在 `createApp` 外层增加单一页面状态协调器，页面组件通过事件或回调请求切换，不直接修改 hash。协调器负责：

- 监听导航点击和 `hashchange`，使用 `history.pushState` 创建可回退历史。
- 初始化时校验 hash，未知值回到 `overview`。
- 只操作顶层 `.app-view`，不得影响职位组件内部的 board/list 状态。
- 为每个 tab 设置 `aria-selected`、`aria-controls`，为 panel 设置对应 `id` 和 `aria-labelledby`。
- 页面切换时发送 `app-view-changed`，供需要刷新或聚焦的组件使用。

业务数据仍由各领域 service 读取；不建立第二份持久化全局 store。

## 3. 首页与跨组件刷新

`DashboardService.getSnapshot()` 作为首页唯一数据源。摘要的简历数、活动职位数和近期面试数从快照或同一批查询结果计算，不再保留硬编码文本。今日事项显示真实的今日面试、7 日行动、待复盘和提醒失败项目。

应用根节点维护一个 `data-refresh-token` 或等价的刷新事件。创建、更新、归档、删除、面试改期、复盘保存、匹配完成、导入备份和清除数据后统一派发 `app-data-changed`，首页和相关页面重新读取数据。页面隐藏时可以延迟刷新，但切入页面必须显示最新状态。

仪表盘的“填写复盘”切换到 `interviews` 页面并选中对应面试；“重试通知”调用统一的 reminder scheduler，成功或失败均更新失败记录和状态。

## 4. JD 匹配页面

新增 `src/components/MatchingPage/MatchingPage.ts`，复用 `MatchingService`。页面加载职位列表和可用简历，支持通过 URL hash 参数或页面内选择器确定当前职位和简历。

- 运行前检查职位存在、JD 已确认、简历文本已确认。
- 运行完全在浏览器内完成，不调用 fetch。
- 展示总体、必需、加分覆盖率，明确匹配、弱匹配、缺失项、证据片段和待人工确认项。
- 展示并打开历史 AnalysisResult。
- 保留“进入 AI 顾问”按钮，带当前 applicationId 切换页面。
- 无职位、无简历和缺少确认文本时提供可恢复提示，并指向对应页面。

职位详情中的匹配面板改为调用同一组渲染/事件逻辑，避免两个页面出现不同计算或展示规则。

## 5. AI 顾问与本地敏感设置

新增设置表单并复用 `getAiSettings`、`saveAiSettings`、`clearAiSettings` 和 `validateAiSettings`：

- API 地址、模型名、API Key、组织 ID、自定义请求头。
- 保存前校验；页面只显示脱敏后的 Key 状态，不把 Key 写入业务记录或日志。
- “测试连接”只调用 models endpoint，失败时不保存修改。
- 保存成功后通过运行时依赖管理器重建 `OpenAiClient`/`AiAdvisorService`，后续页面无需刷新即可使用新配置。
- 清除 AI 配置需要显式确认，并让 AI 页面进入“未配置”状态。

AI 页面按 applicationId 加载对话，复用现有发送预览和结果解析；取消预览绝不发送请求。发送失败保留既有对话，不覆盖原始简历/JD。设置页的“AI 发送记录”从现有 `aiConversations` 派生最近的用户/助手消息时间，并关联职位标识；只展示时间、职位标识和结果状态，不显示 Key、简历正文、JD 正文或私密笔记。由于本次不升级 IndexedDB schema，不新增独立发送记录 store，也不伪造历史模型/API 配置。

## 6. 面试提醒与时区

将提醒分成“计算提醒时间”和“调度触发”两层：

- `calculateReminderTime` 继续返回绝对 ISO 时间。
- `NotificationService` 新增按 interviewId/reminderId 管理的调度方法，使用 `setTimeout` 在未来时间触发；已过期提醒不立即弹出，而是记录应用内到期状态。
- 页面重新打开时扫描未来提醒并重新注册定时器；页面关闭时明确提示浏览器 Notification 不保证后台触发，ICS 和应用内提醒仍可用。
- 保存、修改、改期、取消、完成面试时取消旧定时器并重建当前提醒，避免重复通知。
- 浏览器权限不可用或构造 Notification 失败时只写入 `reminderFailures`，不把失败当作已发送。
- 应用内提醒列表显示“待触发/已到期/已处理”状态，并支持跳转对应面试。

面试表单默认读取 `getPreferences().defaultTimezone` 和 `getDefaultReminders()`，用户仍可在单场面试中覆盖。日期锚点按默认时区生成，不使用 UTC 日期直接截取。

## 7. JD 导入一致性

职位创建流程改为两阶段：

1. 校验并准备职位字段和 JD 输入；粘贴文本可以在同一事务中创建 Application、JobDescription 和 confirmed text。
2. 文件 JD 先完成格式校验、哈希、解析和原文件准备，再在一个 IndexedDB readwrite 事务中写入 Application、JobDescription、文本和 Blob。

如果解析或写入失败，事务整体回滚，不留下职位或半个 JD。若产品需要允许“先创建职位、后补 JD”，必须显式提供“无 JD 创建”路径，不能把文件失败伪装成“资料未改变”。

编辑已有职位时，JD 文本更新也必须通过 JobDescriptionService 的统一接口；确认按钮状态与 pending job description id 在成功、失败、取消时清理一致。

## 8. 设置、清除和存储边界

设置页包含：

- 默认时区和默认提醒编辑。
- 通知权限状态与授权按钮，按钮查询必须限定在设置面板内部。
- AI 配置、连接测试和清除配置。
- 本地数据统计，按结构化记录、文本、原始文件和敏感设置分别显示。
- 加密备份/恢复。
- 清除全部数据的数量确认和 `DELETE` 确认词。
- 隐私说明：本地存储、AI 第三方服务、备份密码不可恢复、删除不可撤销。

`clearAllData` 只删除应用前缀下的 localStorage 键；IndexedDB 清除继续保持事务和快照回滚。清除成功后派发 `app-data-changed`，所有服务重新读取，当前页面回到空状态。

## 9. 错误处理

- 所有异步操作使用领域级错误到用户可理解状态的映射，不显示原始异常、正文或密钥。
- 网络错误只影响 AI 请求；本地简历、职位、面试、匹配和备份流程继续可用。
- 页面跳转携带的 ID 无效时回到对应列表页并显示可恢复提示。
- 定时器数量、超时范围和组件卸载时的清理需要受控，避免重复调度和内存泄漏。

## 10. 测试计划与验收

新增或扩展测试：

- `tests/app.test.ts`：7 个 tab、hashchange、push/back、嵌套 board/list 不互相隐藏、摘要刷新。
- `tests/settings/settings-ui.test.ts`：偏好、默认提醒、AI 配置脱敏、连接测试、通知按钮作用域、清除确认和只清理应用键。
- `tests/calendar/notifications.test.ts`：未来时间不立即通知、到点触发、改期取消旧 timer、权限失败记录、重启重建调度。
- `tests/applications/application-board.test.ts` / `tests/applications/job-description.test.ts`：文件 JD 失败事务回滚、编辑 JD 一致性。
- `tests/matching/matching-ui.test.ts`：职位/简历选择、结果展示、无确认文本提示、进入 AI 页面。
- `tests/ai/ai-settings-ui.test.ts`：保存、测试、清除配置和运行时服务重建。
- 端到端测试覆盖 7 页导航、浏览器后退、从首页进入复盘/通知重试、设置配置 AI、完整备份恢复和移动端布局。

验收命令：

```bash
npm test
npm run build
npm run check:production
npm run test:e2e
```

完成标准是所有测试通过，页面导航和数据状态在刷新、回退、清除和导入后保持一致，生产产物不包含测试源码或敏感配置。
