# 求职工作台 —— 问题与缺点审查报告

> 审查日期：2026-09-04
> 审查范围：约 8000 行 TypeScript，覆盖数据层、加密备份、文件解析、JD 匹配、AI 顾问、应用主壳/日历六大子系统。
> 说明：以下为**只读代码审查**结论，均带 `文件:行号`，可直接定位。未修改任何代码。

## 🔴 高危（会导致锁死 / 数据损坏 / 注入）

1. **迁移遇单条脏记录会让数据库永久打不开** — `src/db/migrations.ts:105,111-118`
   一条 `status`/`kind` 不在当前枚举内的历史记录（beta 遗留、导入脏数据）会使升级事务 abort，版本停留旧值，下次打开重复 abort。没有跳过/隔离机制，唯一出路是删库。

2. **`createApp` 被调用两次，window/root 监听器重复绑定且永不清理** — `src/main.ts:21,29`
   骨架渲染一次、DB 打开后再渲染一次。`hashchange`/`popstate`/`app-data-changed` 等监听累加，`refreshOverview`、dashboard 派发被双执行。确定发生的内存泄漏 + 事件重复。

3. **匹配页下拉/历史未转义，HTML 注入** — `src/components/MatchingPage/MatchingPage.ts:31,32,38`
   同文件内 `renderAnalysisResult` 有 `esc()`，但职位下拉 `${company}·${position}`、简历名、历史按钮直接插入 `innerHTML`，未转义 → 注入 / DOM 破坏。

4. **DOCX 解压炸弹（zip bomb）内存耗尽** — `src/features/resumes/ingestion.ts:228-234` + `src/parsers/docx.ts:7`
   25MB 上限只限压缩前；一个合法 `.docx` 的 `document.xml` 可 DEFLATE 膨胀到数十 GB，直接打爆标签页。单文件即可触发的 DoS。

5. **PDF 回退提取把二进制乱码当有效简历存储** — `src/parsers/pdf.ts:43-60` + `src/features/resumes/ingestion.ts:329-331`
   加密/损坏 PDF 走 latin1 正则回退，命中随机括号片段返回非空乱码，上层只判 `trim()` 非空即视为成功，静默存为简历原文，污染后续匹配与投递内容。

## 🟠 中危（数据一致性 / 隐私残留 / 加密正确性）

6. **删除无级联，遗留孤儿数据与残留敏感文件** — `src/db/repositories.ts:184`、`src/features/applications/applicationService.ts:518-529`、`src/storage/blobStore.ts:90`
   删职位/简历只删主记录：遗留 interviews、timeline、jobDescriptions、resumeTexts、AI 对话，`currentResumeId` 悬空；原始 PDF/DOCX blob（含个人隐私）永久残留在 IndexedDB。删职位关联面试的通知定时器也不清。

7. **解密硬编码 PBKDF2 迭代次数，忽略信封里的 `kdf.iterations`** — `src/backup/crypto.ts:36,81`
   信封校验允许 `iterations ≥ 100000` 任意值，但解密固定用 210000。任何用其它迭代次数生成的合法备份都会解密失败并误报"密码错误"；也是将来升级迭代次数的定时炸弹（旧备份全废）。

8. **解密把"文件被篡改/损坏"误报为"密码错误"** — `src/backup/crypto.ts:86-89`
   完整性校验错误（`Disallowed store`、`Invalid record`…）不匹配透传正则，被吞成通用文案 → UI 显示"密码错误"，用户反复重试密码，掩盖真正的损坏。

9. **`clearAllData` 会删敏感设置，但预览把它排除** — `src/storage/dataManagement.ts:58,110-116`
   预览计数不含 `sensitiveSettings`，执行却清空它 → 用户在未预期下丢失 API Key。预览与行为不一致。

10. **AI 调用无超时 / 无 AbortController** — `src/ai/client.ts:59,71`
    自定义 API 挂起时请求永久悬挂，UI 卡在"正在发送…"无法恢复；用户取消后含完整简历+JD 的请求仍在后台外发，无法中断。

11. **编辑 deadline 在 UTC/本地间反复漂移** — `src/components/ApplicationBoard/ApplicationBoard.ts:377,264`
    回填取 ISO 的 UTC 墙钟前 16 位，保存按本地时间转 UTC，每次编辑东八区平移 -8h，反复编辑持续漂移。

12. **ICS 缺 `DTSTAMP`/`VTIMEZONE`，无长行折叠** — `src/calendar/ics.ts:11-18`
    带 `TZID` 却无对应 `VTIMEZONE` 定义，严格日历客户端会当作浮动时间或解析失败，跨时区导入错时。

13. **取消/完成/改提醒量时通知定时器不清** — `src/components/InterviewCalendar/InterviewCalendar.ts:123-132,147`
    已取消面试仍会到点弹通知；提醒从 30 分钟改 60 分钟，旧 30 分钟定时器残留照旧触发。

14. **复盘保存问题过滤空行、答案按行号对齐 → 错位** — `src/components/InterviewReview/InterviewReview.ts:20`
    问题文本框中间有空行就使数组变短，答案/备注挂到错误问题上。

15. **匹配打分不可解释** — `src/matching/scoring.ts:180-191,21-128` + `src/components/MatchingPage/MatchingPage.ts:12`
    `needs-review` 项计入分母得 0 分却不进 missing 列表、又从不在 UI 渲染，导致覆盖率数字比可见列表低且无法解释；经验判定只看简历里有无任意 4 位年份，忽略所需年限，几乎必然误报。

16. **预览与发送两次独立读取、无快照绑定（TOCTOU），且可绕过** — `src/features/ai/aiAdvisorService.ts:117-142`、`src/features/ai/aiConversationService.ts:66-97`
    预览显示的长度/版本与真正外发内容无绑定；`AiConversationService.sendMessage` 这条路径根本无确认步骤。"发送前确认"闸门在架构上不牢固。

## 🟡 低危 / 健壮性与可维护性

- **迁移硬编码 `oldVersion >= 6` 提前返回** — `src/db/migrations.ts:128`：升到 v7 时 v6 老库会跳过全部回填。迁移是"全量默认值"粗粒度模式，非按版本分步。
- **迁移回填复用共享对象/数组引用** — `src/db/migrations.ts:12-40,47`：aliasing 陷阱。
- **软删除简历未从库列表过滤** — `src/features/resumes/resumeLibrary.ts:67-79`：已删简历仍展示，点下载失败，且仍可被引用生成使用快照。
- **JD/简历直接拼入提示词，无分隔转义** — `src/ai/prompts.ts:42-53`：JD 来自外部，存在提示词注入面。
- **MIME 严格相等校验误拒合法文件** — `src/features/resumes/ingestion.ts:201-208`：浏览器对 `.docx` 常报空串，合法文件被拒。
- **未配置 pdfjs worker，解析阻塞主线程** — `src/parsers/pdf.ts:10-15`：大 PDF 冻结 UI。
- **`jobUrl` 作 href 未校验协议** — `src/components/ApplicationBoard/ApplicationBoard.ts:253`：`javascript:` 可执行。
- **API Key/组织 ID 在 IndexedDB 明文存储** — `src/settings/secrets.ts:70-86`（备份/日志已正确排除，属浏览器应用固有权衡）。
- **超 ~24.8 天的提醒不重排程会提前触发** — `src/calendar/notifications.ts:43-47`。
- **每次匹配无条件新增历史，无去重/上限** — `src/features/matching/matchingService.ts:63-65`：记录无界增长。
- **重复实现** `createResumeUsageSnapshot` — `src/features/resumes/resumeUsageSnapshots.ts:4-9` 与 `src/features/resumes/resumeLibrary.ts:314-319` 完全相同。

## ✅ 做得好的地方（非问题）

- 敏感设置/API Key 在备份导出与解密两侧都被拒绝，未泄漏进备份、日志或业务记录。
- 自定义请求头在写入前剔除 `authorization`/`content-type`，头名做 token 白名单 + CRLF 校验，`apiUrl` 禁 userinfo/query/hash — 无头注入/CRLF 缺陷。
- salt(16B)/IV(12B) 每次随机、AES-256-GCM 使用正确；导入采用单事务提交 + 备份内 ID 去重 + 版本精确校验。
- 大部分 DOM 渲染都经 `escapeHtml`，覆盖 `&<>'"`。

## 建议优先处理顺序

| 优先级 | 问题 | 理由 |
|---|---|---|
| P0 | #1 迁移锁死、#4 解压炸弹 | 单点触发即不可恢复 / DoS |
| P0 | #3 匹配页注入、#5 PDF 乱码入库 | 数据可信度 / 注入 |
| P1 | #6 删除无级联、#2 双重 createApp | 隐私残留 + 泄漏 |
| P1 | #7/#8 备份解密正确性与错误分类 | 备份是最后的数据保障，误报使用户放弃恢复 |
| P2 | #10~#16 时区、通知、TOCTOU、打分 | 逐项修正 |

---

# 附录：用户体验（易用性 / 交互 / 页面设计）审查

> 说明：以下不是代码 bug，而是"功能设计得不好用、用户用着不顺手"的体验问题，从真实求职用户视角审查。

## 🔴 最影响信任与可用性（优先修）

1. **底层已备好的可操作错误信息，被 UI 通用文案吞掉** — `createApp.ts:346,397` vs `ingestion.ts:120-149`
   ingestion 为超大文件、格式不支持、重复文件都准备了明确原因+建议，但 UI 一律显示"请重试"。用户重试多少次都不会成功且不知原因。

2. **首页"今日待处理事项"是永远为 0 的死 UI** — `createApp.ts:97-100`
   写死显示 `0`/"今天没有待处理事项"，从不更新，还与正下方真实的"今日面试"面板自相矛盾，削弱数据可信度。

3. **上传/解析大 PDF 无进度、无 loading、按钮不禁用** — `createApp.ts:337-350`
   本地解析大简历耗时数秒~数十秒，界面看似卡死，用户会反复点或放弃。

4. **AI 最有价值的产出（逐句改写 rewrites、待补充 missingInfo）界面完全不渲染** — `AiPage.ts:12`
   花了 API 额度，最有行动价值的"把这句改成那句"只藏在导出报告里，页面看不到。

5. **历史 AI 对话显示为一坨原始 JSON** — `AiPage.ts:19`
   刚发送时是格式化结果，回看历史变成 `{"matchOverview":...}` 原始 JSON，历史记录形同废纸。

6. **AI 请求无超时/取消，网络挂起永久卡在"正在发送…"** — `ai/client.ts:57-91`
   用户无法判断是处理中还是已死，只能刷新丢失流程。

7. **备份密码零防护：无强度提示、无二次确认、无"忘记=永久无法恢复"警示** — `BackupPanel.ts:93-101`
   纯本地应用，备份是数据丢失后唯一救命稻草。手滑打错或日后遗忘 → 备份永久报废，当下无任何提醒。

8. **看板不能拖拽，只能"推进下一格"，末列点击无反馈** — `ApplicationBoard.ts:190-213,389`
   看板核心心智就是拖卡片换列，这里拖不动；想回退阶段/跨列必须绕进详情；末列点按钮静默无反应像卡死。

9. **归档后职位仍留在看板里，"归档"形同虚设** — `ApplicationBoard.ts:175`
   看板/列表/列头计数都不排除 `archivedAt`，归档后画面毫无变化，也没有"查看已归档"入口。

10. **"应用内提醒"到点根本不会提醒，只是一张静态时间清单** — `notifications.ts:12-18`、`InterviewCalendar.ts:93`
    in-app 渠道到点无弹窗/声音/红点；浏览器通知只在页面开着时才可能触发，与用户对"提醒"的预期严重错位。

11. **取消/完成面试无二次确认** — `InterviewCalendar.ts:147`
    破坏性操作点一下立即生效，与"删除职位有确认"不一致；六个按钮挤一行，移动端更易误点"取消"。

12. **复盘问题/答案/备注三个文本框靠"行号对齐"，极易错位** — `InterviewReview.ts:13,20`
    中间插一行或答案换行就全部错位且无从察觉，是复盘录入最反直觉之处。

## 🟡 中等（明显影响顺手度）

- **英文枚举/ISO 时间直接展示给中文用户** — `createApp.ts:318`、`Dashboard.ts:15,30`、`ApplicationBoard.ts:90-101,196`、`InterviewCalendar.ts:91`：`needs-review`、`graduate/onsite`、`scheduled`、`2026-09-04T12:00:00.000Z` 等，普通求职者看不懂。
- **首页"填写复盘"点击后无视图跳转** — `Dashboard.ts:47`：事件无人处理，页面毫无变化，功能断裂。
- **上传后"确认文本"路径割裂** — `createApp.ts:321,343`：提示去"确认"却只有叫"预览文本"的入口，用户不会点，简历长期卡在 needs-review。
- **匹配分数无解读基准、缺失项不分必需/加分、无行动建议** — `MatchingPage.ts:12`：一堆百分比得不出"我该改什么"。
- **AI/匹配前置条件不满足只报错、无引导入口** — `aiAdvisorService.ts:96`、`matchingService.ts:48`：不告诉缺哪项、也无跳转去补的入口，原地打转。
- **AI 配置把专业选填项（组织 ID、自定义请求头）与必填项混排、未标可选、无服务商示例** — `createApp.ts:177-185`。
- **"日历"实为按日/周/月过滤的列表，没有真正的月历网格** — `InterviewCalendar.ts:49-56,89`。
- **时区必须手输 IANA 字符串（如 Asia/Shanghai），无下拉，输错整表保存失败** — `InterviewCalendar.ts:69`。
- **恢复冲突逐项处理，冲突多时无"全部保留/全部覆盖"批量策略** — `BackupPanel.ts:186-217`。
- **卡片不显示截止时间/优先级**，看不到"哪个快截止" — `ApplicationBoard.ts:194-206`。
- **创建职位表单常驻页顶、14+ 字段**（实际必填仅公司+职位） — `ApplicationBoard.ts:94-115`。
- **编辑/删除面板在长列表底部就地展开、无 `scrollIntoView`、不显示正在编辑哪份** — `createApp.ts:123-149,362-395`。
- **搜索无结果与空库共用"暂无简历版本"** — `createApp.ts:330`：易被误解为数据丢失。
- **软删除但无撤销入口，且原文件实际已物理删除不可恢复** — `resumeLibrary.ts:231-259`。
- **复盘不显示"正在给哪场面试写"，点入口不滚动定位** — `InterviewReview.ts:12`、`createApp.ts:231`。
- **仪表盘读取失败无重试按钮，却让用户"去改筛选器"** — `Dashboard.ts:40`。

## 🟢 低（打磨项）

- 导航是 ARIA tablist 但无方向键切换 / roving tabindex / 切换后焦点管理 — `createApp.ts:684-739`。
- 简历卡片 6 个按钮等权平铺、窄屏堆叠、危险的"删除"无区分易误点 — `createApp.ts:320-327`。
- "编辑"与"改期"双入口功能重叠、"推进阶段"按钮与详情下拉同名不同义 — `InterviewCalendar.ts:147`、`ApplicationBoard.ts:199,253`。
- 每场面试只能设一个提醒偏移（数据结构本支持多个） — `InterviewCalendar.ts:108`。
- 复盘评分 0–5 无刻度说明；AI 真实性风险(authenticityRisk)界面未突出；匹配页控件/历史缺专属样式。

## ✅ 体验上做得好的地方

- 几乎每个操作都有 `aria-live` 状态反馈，失败时明确说明"资料未改变，可重试"。
- 删除/归档/清库都有预览确认与焦点管理。
- 发送 AI 前有上下文预览（简历版本、文本长度、目标地址）并需显式确认。

## 体验改进优先级建议

| 优先级 | 主题 | 代表项 |
|---|---|---|
| P0 | 接通"已具备但没露出"的能力 | #1 错误信息、#2 死UI、#4/#5 AI产出与历史 |
| P0 | 消除"看似卡死/永久损失" | #3 loading、#6 AI超时、#7 备份密码防护 |
| P1 | 修复核心交互模型 | #8 看板拖拽、#10 提醒、#12 复盘行对齐、#9 归档 |
| P1 | 全面中文本地化 | 枚举/状态/时间格式 |
| P2 | 引导与打磨 | 前置条件引导、时区下拉、日历网格、批量冲突处理 |

---

# 修复记录（2026-09-04，P0 一批）

已修复以下体验问题，全部测试通过（141 passed）、类型检查与生产构建均通过：

| 编号 | 问题 | 修复方式 | 涉及文件 |
|---|---|---|---|
| 1 | 上传错误被通用文案吞掉 | 新增 `resumeUploadErrorMessage`，按 `ResumeIngestionError.code` 映射到具体中文提示（超大/格式/损坏/重复等），普通错误仍不泄漏底层信息 | `src/app/createApp.ts` |
| 2 | 首页"今日待处理"死 UI | 删除写死区块，保留真实的 Dashboard「今日面试」面板 | `src/app/createApp.ts` |
| 3 | 上传大 PDF 无 loading | 上传期间禁用输入、按钮转圈动画、大文件给"可能需要几秒"提示，`finally` 中恢复 | `src/app/createApp.ts`、`src/styles/resumes.css` |
| 4 | AI 改写/待补充产出不渲染 | `renderResult` 补齐 rewrites/missingInfo/authenticityRisk | `src/components/AiPage/AiPage.ts` |
| 5 | 历史 AI 回复显示原始 JSON | 历史 assistant 消息用 `parseAiAdvisorResult` 结构化渲染，失败回退纯文本 | `src/components/AiPage/AiPage.ts` |
| 6 | AI 请求无超时 | `OpenAiClient` 加 `AbortController` + 默认 60s 超时，超时抛可识别错误；SendPreview 展示"发送超时"文案 | `src/ai/client.ts`、`src/components/SendPreview/SendPreview.ts`、`src/components/ApplicationBoard/ApplicationBoard.ts` |
| 7 | 备份密码零防护 | 加确认密码框 + 8 位最小长度校验 + 不可找回风险说明 | `src/features/backup/BackupPanel.ts`、`src/styles/backup.css` |
| 8 | 归档后仍显示在看板 | 默认过滤 `archivedAt`，加"显示已归档"开关与已归档徽标 | `src/components/ApplicationBoard/ApplicationBoard.ts`、`src/styles/applications.css` |
| 9 | 通知定时器不清理 | 取消/完成/编辑面试时调用 `clearInterview`，避免已取消面试仍弹通知或重复通知 | `src/components/InterviewCalendar/InterviewCalendar.ts` |
| 10 | 取消面试无确认 | 取消前 `window.confirm` 二次确认 | `src/components/InterviewCalendar/InterviewCalendar.ts` |
| 11 | 复盘三框按行号对齐易错位 | 重构为"每问一组（问题+回答+备注）"的可增删卡片 | `src/components/InterviewReview/InterviewReview.ts`、`src/styles/interviews.css` |

新增回归测试：AI 请求超时、简历上传错误具体提示、上传后输入框恢复；并更新了受影响的 backup/interview UI 测试。

> 未纳入本批（属重构级，需另行确认）：看板拖拽、真月历网格、时区下拉、恢复冲突批量处理，以及全面中文本地化（英文枚举/ISO 时间）。

---

# 修复记录（2026-09-04，代码 bug 主表批次）

已修复代码审查主表（#1–#16 与低危项）中的以下问题；全部测试通过（143 passed）、类型检查与生产构建均通过。

| 编号 | 问题 | 修复方式 | 涉及文件 |
|---|---|---|---|
| #1 | 迁移遇脏记录锁库 | 非法 status/kind 改为回填安全默认值（needs-review/scheduled/normal），不再 abort 升级事务 | `src/db/migrations.ts` |
| #2 | createApp 重复监听泄漏 | 用 AbortController 管理 root/window 级持久监听，二次调用先 abort 旧监听；5 个子组件的 window 监听接入同一 signal | `src/app/createApp.ts` 及 Dashboard/AiPage/MatchingPage/InterviewCalendar/ApplicationBoard |
| #3 | 匹配页 XSS | 下拉/历史里的 company/position/简历名统一 `esc()` 转义 | `src/components/MatchingPage/MatchingPage.ts` |
| #4 | DOCX 解压炸弹 | unzip filter 用 `originalSize` 拦截超 100MB 的条目，避免解压到内存 | `src/features/resumes/ingestion.ts` |
| #5 | PDF 乱码入库 | 加密 PDF（PasswordException）不走回退；回退文本做可打印字符比例校验（≥85%），乱码则丢弃 | `src/parsers/pdf.ts` |
| #6 | 删除职位无级联 | 级联删除面试/复盘/JD+文本+原文件/匹配/AI 对话；按“可追溯”原则**保留**简历使用史与时间线审计快照 | `src/features/applications/applicationService.ts` |
| #7 | 解密硬编码迭代次数 | `deriveKey` 接受 iterations，解密用信封里的 `kdf.iterations` | `src/backup/crypto.ts` |
| #8 | 解密错误误报密码错误 | 完整性/校验错误如实抛出，只有 KDF/GCM 认证失败才报“无法解密”；UI 错误分类同步更新 | `src/backup/crypto.ts`、`src/features/backup/BackupPanel.ts` |
| #11 | deadline 时区漂移 | 编辑回填改用本地墙钟格式 `isoToLocalDatetimeInput`，与保存对称，不再每次编辑漂移 | `src/components/ApplicationBoard/ApplicationBoard.ts` |
| #12 | ICS 缺字段 | 补 `DTSTAMP`、最小 `VTIMEZONE`（按事件时刻算偏移）、RFC 5545 75 字节长行折叠 | `src/calendar/ics.ts` |
| 低危 | 迁移共享引用 | 回填默认值深拷贝，消除 aliasing | `src/db/migrations.ts` |
| 低危 | 软删除简历仍展示 | `listResumes` 过滤 `status==="deleted"` | `src/features/resumes/resumeLibrary.ts` |
| 低危 | jobUrl 危险协议 | 详情链接用 `safeHref` 仅允许 http/https，`javascript:` 降级为纯文本 | `src/components/ApplicationBoard/ApplicationBoard.ts` |
| 低危 | 重复 snapshot 实现 | resumeLibrary 改为 re-export 规范模块，删除重复实现 | `src/features/resumes/resumeLibrary.ts` |
| 低危 | 超 24.8 天提醒提前触发 | 超 setTimeout 上限时先睡到上限再重排程，不再提前误触发 | `src/calendar/notifications.ts` |

新增/更新回归测试：迁移脏记录改为断言“coerce 到安全默认值且能打开”、解密使用信封迭代次数、ICS 含 DTSTAMP/VTIMEZONE、删除职位级联清理、备份错误分类文案。

## 本批未处理（需另行确认或属可解释增强）

- **#9 clearAllData 快照与清除非原子**、**#10 已在上一批修复（AI 超时）**。
- **#13/#14 已在上一批 UX 修复**（通知定时器/复盘行对齐）。
- **#15 匹配打分不可解释**、**#16 AI 预览 TOCTOU**：属算法与架构增强，改动面大、需产品决策，未纳入本次 bug 批。
- **MIME 严格校验**：`type-mismatch` 是被测试固化的**防伪造安全策略**（missing MIME 也拒绝），放宽会削弱防线并破坏现有安全测试，故**刻意保留**现状。
- **pdfjs worker 主线程阻塞**：需构建层 worker 配置，属性能优化，未纳入。
