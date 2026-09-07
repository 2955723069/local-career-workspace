---
id: "T-F006-1"
feature_id: "F-006"
slug: "ai-core-settings-client-conversations"
title: "实现 AI 设置、OpenAI 客户端与职位级对话服务"
status: "done"
depends_on: []
test_command: "npm test -- tests/ai tests/settings/secrets.test.ts"
acceptance_criteria: ["可保存、读取、编辑和清除 AI 配置；非法地址、缺少必要配置或无效自定义请求头会在本地拒绝，Key 只存在 sensitiveSettings。","连通性测试使用 OpenAI 兼容客户端的无内容探测请求；配置缺失或地址非法时 fetch/XMLHttpRequest 调用次数为零，任何日志和可导出的业务对象都不包含 API Key。","上下文组装仅使用确认后的简历/JD 文本和 AnalysisResult，不读取或修改原始 PDF/DOCX、提取文本或手动校正文本，并生成包含真实性约束的系统消息。","两个 applicationId 的 AiConversation 互不串线；追加、读取和刷新后读取均保留稳定 id、createdAt、updatedAt，客户端错误不会改变已有对话。","单元测试覆盖配置校验、连通性请求头、缺少 Key/非法地址零外发、对话隔离、请求失败不写入对话以及真实性系统提示。"]
files_hint: ["src/ai/client.ts","src/ai/prompts.ts","src/features/ai/aiConversationService.ts","src/settings/secrets.ts","src/settings/types.ts","src/db/types.ts","tests/ai/","tests/settings/secrets.test.ts"]
---

# T-F006-1 — 实现 AI 设置、OpenAI 客户端与职位级对话服务

在现有 sensitiveSettings IndexedDB 存储和 AiConversation/AnalysisResult 类型基础上，创建 src/ai/client.ts、src/ai/prompts.ts 及 src/features/ai/aiConversationService.ts。提供 AI 配置的读取、保存、编辑和清除，校验 http/https API 地址、模型、Key、组织 ID 和自定义请求头；实现不携带简历/JD 的 OpenAI 兼容连通性测试，以及带认证、组织信息和自定义请求头的 chat-completions 请求。提供上下文组装函数，只读取已确认的简历文本、已确认的 JD 文本和可选本地匹配结果，并加入禁止虚构经历、技能、学历、成果或量化数据且不确定内容必须询问用户的系统提示。对话服务必须按 applicationId 单独读取和持久化一条 AiConversation，保持稳定 id/时间戳，支持追加消息和刷新后读取；发送失败前不得写入新消息，API 配置和 Key 不得进入业务记录、日志或可序列化的备份数据。

## Acceptance criteria

- [ ] 可保存、读取、编辑和清除 AI 配置；非法地址、缺少必要配置或无效自定义请求头会在本地拒绝，Key 只存在 sensitiveSettings。
- [ ] 连通性测试使用 OpenAI 兼容客户端的无内容探测请求；配置缺失或地址非法时 fetch/XMLHttpRequest 调用次数为零，任何日志和可导出的业务对象都不包含 API Key。
- [ ] 上下文组装仅使用确认后的简历/JD 文本和 AnalysisResult，不读取或修改原始 PDF/DOCX、提取文本或手动校正文本，并生成包含真实性约束的系统消息。
- [ ] 两个 applicationId 的 AiConversation 互不串线；追加、读取和刷新后读取均保留稳定 id、createdAt、updatedAt，客户端错误不会改变已有对话。
- [ ] 单元测试覆盖配置校验、连通性请求头、缺少 Key/非法地址零外发、对话隔离、请求失败不写入对话以及真实性系统提示。
