---
title: 独立简历与求职管理工具
status: confirmed
version: 1.0
---

# 独立简历与求职管理工具

## 1. 产品概述

这是一个本地优先的独立 Web 求职管理工具，面向应届生、实习生、技术岗位求职者和通用职场求职者。用户无需注册、登录或云端账户，即可在当前浏览器中管理多份简历、职位申请、面试、复盘、JD 匹配和可选的 AI 优化建议。

结构化数据、提取文本、分析结果、AI 对话和原始 PDF/DOCX 文件默认保存在浏览器 IndexedDB。用户可通过加密的轻量备份或完整备份迁移设备或恢复数据。

## 2. 目标与非目标

### 2.1 目标

- 在无网络和无账户的情况下完成从资料准备、申请跟踪、面试提醒到复盘和备份的闭环。
- 支持 PDF/DOCX 简历和职位 JD 的本地管理，并明确每个职位当前使用的简历版本。
- 提供完全在浏览器执行、带证据片段且可解释的本地关键词匹配。
- 提供可选的 OpenAI 兼容 AI 求职顾问；任何外发内容都必须经用户预览和确认。
- 通过应用内提醒、浏览器通知和标准 `.ics` 导出降低漏面风险。
- 通过 PBKDF2、AES-256-GCM 加密和逐项冲突处理保护隐私与数据完整性。

### 2.2 非目标

首版不包含用户注册、登录、云同步、服务端数据库、HTTP API、在线修改原始简历排版、模板套用、生成排版好的 PDF/DOCX、OCR、自动抓取招聘网站 JD 或自动代替用户投递职位。

## 3. 用户原则与约束

产品服务三类共享同一套流程的用户：应届生、技术岗位求职者、通用职场求职者。`jobType` 仅用于筛选、统计和后续规则扩展，不拆分为三套产品。

- 本地优先：资料管理、职位管理和本地匹配离线可用。
- 用户确认：AI 请求发送前展示预览并等待明确确认；取消、配置错误或请求失败时不得外发。
- 原件不覆盖：原始文件、确认后的提取文本、手动校正文本和 AI 建议分开保存。
- 可追溯：阶段变化、简历切换、面试改期和备注保留时间线。
- 可恢复：备份导入在校验、解密、冲突选择或提交失败时整体回滚。
- 诚实建议：AI 不得虚构经历、技能、学历、成果或量化数据；不确定内容先询问用户。
- 日志安全：日志和错误信息不得包含简历、JD、API Key 或面试私密笔记。

## 4. 信息架构

首页仪表盘、简历库、职位申请、面试日历、JD 匹配、AI 求职顾问、设置与备份。

首页展示今日和未来 7 天面试、待跟进职位、申请阶段数量、最近使用简历、最近匹配结果、待填写复盘、提醒和失败通知；支持全部、应届生、技术岗位、通用岗位筛选。

简历库支持列表或卡片浏览、上传、预览、下载、重命名、标签、搜索、提取文本编辑、导出和删除。职位申请支持看板和列表；看板按阶段分列，卡片显示公司、职位、地点、当前简历、最近阶段变化、下一个面试、跟进状态和匹配摘要。职位详情聚合 JD、当前简历、简历历史、时间线、面试、匹配、AI 对话、复盘和备注。

面试日历提供日、周、月视图。JD 匹配页选择职位和简历版本后展示本地结果并可进入该职位的 AI 对话。设置页管理默认时区、默认提醒、通知权限、AI 接口、本地数据统计、备份/导入、清除数据、隐私说明和 AI 发送记录。

## 5. 数据模型

所有记录具有稳定 `id`、`createdAt`、`updatedAt`；时间以绝对 ISO 时间保存，展示时使用记录自身时区或用户默认时区。

- `Resume`: `id`, `name`, `type` (`pdf|docx`), `fileName`, `fileSize`, `fileHash`, `uploadedAt`, `tags`, `note`, `extractedText`, `textSource` (`extracted|manual`), `textConfirmedAt`, `status` (`ready|extraction-failed|needs-review|deleted`)。原始二进制仅存 IndexedDB，单文件上限 25 MB。
- `JobDescription`: `id`, `applicationId`, `fileName`, `fileType`, `fileSize`, `fileHash`, `rawText`, `textSource` (`pasted|extracted|manual`), `textConfirmedAt`, `createdAt`, `updatedAt`。允许只有粘贴文本而没有原文件；招聘网址仅保存为参考字段。
- `Application`: `id`, `company`, `position`, `jobType` (`graduate|internship|tech|general|other`), `location`, `workMode` (`onsite|remote|hybrid|unknown`), `salaryText`, `source`, `jobUrl`, `jdText`, `jdFileId`, `currentResumeId`, `stageId`, `priority`, `deadline`, `contact`, `note`, `createdAt`, `updatedAt`, `archivedAt`。
- `ResumeUsageHistory`: `id`, `applicationId`, `resumeId`, `resumeNameSnapshot`, `textSnapshot`, `usedAt`。删除原文件后仍保留快照。
- `Stage`: `id`, `name`, `color`, `order`, `kind`, `createdAt`。默认阶段为收藏、已申请、笔试/测评、面试中、已获 Offer、已拒绝、已放弃；`kind` 稳定区分普通、offer、rejected、withdrawn 结果语义。
- `ApplicationTimelineEvent`: `id`, `applicationId`, `type` (`stage-changed|resume-changed|note-added|archived`), `fromValue`, `toValue`, `note`, `createdAt`。
- `Interview`: `id`, `applicationId`, `round`, `type` (`phone|video|onsite|assessment|other`), `title`, `startsAt`, optional `endsAt`, `timezone`, `locationOrLink`, `interviewer`, `status` (`scheduled|completed|cancelled|rescheduled`), `reminders`, `calendarExportedAt`, `note`, `createdAt`, `updatedAt`。`startsAt` 和 `timezone` 必须有效。
- `InterviewReview`: `id`, `interviewId`, `overallRating`, `questions`, `goodAnswers`, `weakAnswers`, `observedSignals`, `salaryDiscussion`, `nextStep`, `privateNote`, `createdAt`, `updatedAt`。
- `AnalysisResult`: `id`, `applicationId`, `resumeId`, `mode` (`local|ai`), `coverage`, `matchedKeywords`, `weakMatches`, `missingKeywords`, `evidence`, `uncertainItems`, `recommendations`, `createdAt`。
- `AiConversation`: `id`, `applicationId`, `messages`, `createdAt`, `updatedAt`。API 地址、模型名、API Key、组织 ID、自定义请求头属于本地设置，不进入备份。

## 6. 功能需求

### 6.1 本地基础设施

建立可离线运行的浏览器应用、IndexedDB schema、迁移机制和本地设置存储。`localStorage` 仅保存少量界面设置和迁移标记，不保存原始文件。记录写入必须保留稳定 ID 和时间戳，并提供数据统计及清除数据前的数量确认。

### 6.2 简历流程

上传 PDF/DOCX 后在浏览器提取文本。成功时用户确认或修改文本后保存版本；失败时保留原文件并进入手动粘贴/校正状态，不阻断其他功能。拒绝不支持格式或超过 25 MB 的文件，并在控件附近说明修复动作。支持多版本、标签、搜索、预览、下载、导出和二次确认删除；原文件删除后历史使用记录仍显示名称和文本快照。文件 hash 用于去重且不得写入文件内容日志。

### 6.3 职位申请与阶段

用户输入职位基本信息，粘贴 JD 或上传 PDF/DOCX 并确认文本，选择唯一当前简历后创建申请。职位网址只保存不抓取。支持编辑、归档、看板/列表切换、阶段推进、备注和时间线。默认阶段可重命名、改色、排序和删除普通阶段；结果阶段改名后仍按 `kind` 统计 Offer、拒绝和放弃。切换当前简历时追加使用历史和时间线事件，不覆盖旧记录。

### 6.4 面试、提醒与复盘

支持一个职位多轮面试，每场独立设置时区、开始/结束时间、地点或会议链接、面试官和提醒。支持日/周/月视图、应用内提醒、浏览器通知授权、10 分钟/30 分钟/1 小时/1 天预设及自定义提醒。浏览器通知被拒绝或关闭浏览器时，应用内提醒和 `.ics` 仍可用并提示同步系统日历。改期必须产生新的时间线记录，不得静默覆盖；支持取消、完成、结构化复盘和导出 `.ics`。`.ics` 包含标题、时间、时区、地点或链接、公司和职位。

### 6.5 本地 JD 匹配

匹配完全在浏览器执行且不发出网络请求。处理时统一大小写、空格、标点和常见中英文变体，按技能/工具/框架/平台、通用能力、学历、证书、语言、年限和职责词分组并保留原始词形。输出总体、必需和加分关键词覆盖率，已匹配、弱匹配、缺失项、证据片段和待人工确认项，并持久化 `AnalysisResult`。结果只代表文本证据，不断言真实能力。

### 6.6 AI 求职顾问

设置支持 OpenAI 兼容 API 地址、模型名、API Key、可选组织 ID、自定义请求头和连通性测试；Key 仅保存在当前浏览器，并提示第三方服务可能有独立的数据保存/训练策略。每个职位拥有隔离对话，支持追问、单段/全部复制和报告导出。输出包含匹配概览、问题、建议、原文/改写对照、待补充信息和风险提示。每次发送前显示当前简历版本、简历文本长度、JD 长度、消息数和目标 API 地址；用户取消不发请求。缺 Key、地址非法、连通性失败或请求失败时保留本地资料和已保存对话并支持重试。系统提示强制真实性约束，AI 建议不得覆盖原始文件或自动生成 PDF/DOCX。

### 6.7 备份与恢复

轻量备份包含结构化数据、确认后的简历/JD 文本、匹配结果、AI 对话、申请时间线、面试和复盘，不含原始文件；完整备份在此基础上包含 PDF/DOCX 二进制。两者均支持 Web Crypto API、PBKDF2 派生密钥、AES-256-GCM 加密，每次导出使用新的随机 salt 和 IV；密码不保存。

导入流程为选择文件、输入密码、解密校验、展示版本和数据概览、检测相同 ID、逐项选择保留本地/使用备份/导入新副本、预览并一次性提交。默认不覆盖本地数据；错误密码、损坏文件、取消冲突或任何提交失败必须整体回滚。API Key、通知授权、临时 AI 上下文和发送预览永不进入备份。

### 6.8 响应式、可访问性与状态

桌面端支持看板、列表和日历并排工作流；移动端支持单列、横向阶段切换和底部操作区。主要操作支持键盘、可见焦点、语义化标签和屏幕阅读器状态。长文本、文件名、公司名和职位名在窄屏换行或截断且不遮挡控件。错误、保存状态、通知授权和 AI 外发状态必须以可感知的状态提示呈现。

## 7. 错误与安全

格式不支持、大小超限、提取失败、重复文件、通知拒绝、AI 配置/网络错误、备份解密错误和冲突取消均提供明确可恢复反馈。删除职位、简历或全部本地数据需要二次确认；清除全部数据前展示数量并要求确认词或再次确认。无网络时仍可完成简历、职位、面试记录和本地匹配。

## 8. 验收与工程质量

- 简历和 JD 的核心流程、数据模型、解析、匹配、时区、提醒、加密和冲突导入均有自动化测试。
- 桌面和移动端主要流程有端到端覆盖。
- 生产构建不包含测试文件、原始依赖目录或 API Key。
- README 说明安装、启动、离线使用、备份、恢复、通知、AI 配置和清除数据。
- 本地匹配测试必须证明未发出网络请求；AI 测试必须证明取消预览不发送请求、对话按职位隔离且原始简历不被覆盖。
