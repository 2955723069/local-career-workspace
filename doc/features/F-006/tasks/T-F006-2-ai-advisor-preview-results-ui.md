---
id: "T-F006-2"
feature_id: "F-006"
slug: "ai-advisor-preview-results-ui"
title: "集成发送确认、顾问结果展示、追问与报告导出"
status: "done"
depends_on: ["T-F006-1"]
test_command: "npm test -- tests/ai tests/applications/application-board.test.ts && npm run build && npm run test:e2e -- tests/e2e/ai-career-advisor.spec.ts"
acceptance_criteria: ["未确认发送预览时，预览中的简历版本、简历文本长度、JD 长度、消息数和目标 API 地址与当前 IndexedDB 数据一致，fetch 未被调用。","取消预览、缺少 Key、非法地址或连通性失败时请求计数为零、请求体不含简历/JD、已有 AiConversation 和资料保持不变；用户可重新打开预览并重试。","成功发送后仅为当前 applicationId 保存用户和助手消息；发送失败或解析失败不会覆盖已有对话、AnalysisResult、原始文件或确认/手动文本，并提供可感知的错误和重试状态。","职位详情中的结果包含匹配概览、问题、标记为建议的建议、原文/改写对照、待补充信息和风险提示；虚构内容模拟返回时显示真实性风险声明。","同一职位支持追问、单段复制、全部复制和报告导出；复制/导出内容不包含 API Key、临时上下文或发送预览元数据。","新增 AI 单元/UI 测试覆盖 AI-TC-1 至 AI-TC-4，并覆盖原始简历文本未改变；桌面和移动端 E2E 测试验证预览确认、取消和结果展示流程。"]
files_hint: ["src/features/ai/aiAdvisorService.ts","src/components/SendPreview/SendPreview.ts","src/components/ApplicationBoard/ApplicationBoard.ts","src/app/createApp.ts","src/main.ts","src/styles.css","tests/ai/","tests/applications/application-board.test.ts","tests/e2e/ai-career-advisor.spec.ts"]
---

# T-F006-2 — 集成发送确认、顾问结果展示、追问与报告导出

创建职位级 AI 顾问编排服务和 SendPreview UI，并接入 ApplicationBoard、createApp 与 main 启动依赖。编排服务在发送前读取当前简历版本、确认后的简历文本和 JD 文本、最新本地匹配概览及该职位消息数，生成包含 resume version、resume text length、JD length、message count 和目标 API URL 的预览；只有用户明确确认且配置/预检成功后才调用客户端并在成功后原子保存用户消息和 AI 回复。取消、缺少配置、非法地址、连通性失败或发送前错误必须零外发且保持资料和对话不变；发送后的响应/传输错误必须保留已有资料和对话，展示可重试状态并要求重新确认。将 AI 输出解析为匹配概览、问题、建议、原文/改写对照、待补充信息和风险提示，所有建议显式标记为“建议”，检测虚构经历或无法核验内容时显示真实性风险；支持职位内追问、单段复制、全部复制和 Markdown/文本优化报告下载，且绝不覆盖原始文件或任何已保存文本。补充桌面和移动端主要流程的端到端覆盖。

## Acceptance criteria

- [ ] 未确认发送预览时，预览中的简历版本、简历文本长度、JD 长度、消息数和目标 API 地址与当前 IndexedDB 数据一致，fetch 未被调用。
- [ ] 取消预览、缺少 Key、非法地址或连通性失败时请求计数为零、请求体不含简历/JD、已有 AiConversation 和资料保持不变；用户可重新打开预览并重试。
- [ ] 成功发送后仅为当前 applicationId 保存用户和助手消息；发送失败或解析失败不会覆盖已有对话、AnalysisResult、原始文件或确认/手动文本，并提供可感知的错误和重试状态。
- [ ] 职位详情中的结果包含匹配概览、问题、标记为建议的建议、原文/改写对照、待补充信息和风险提示；虚构内容模拟返回时显示真实性风险声明。
- [ ] 同一职位支持追问、单段复制、全部复制和报告导出；复制/导出内容不包含 API Key、临时上下文或发送预览元数据。
- [ ] 新增 AI 单元/UI 测试覆盖 AI-TC-1 至 AI-TC-4，并覆盖原始简历文本未改变；桌面和移动端 E2E 测试验证预览确认、取消和结果展示流程。
