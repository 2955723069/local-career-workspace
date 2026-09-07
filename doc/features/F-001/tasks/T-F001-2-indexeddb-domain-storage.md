---
id: "T-F001-2"
feature_id: "F-001"
slug: "indexeddb-domain-storage"
title: "实现 IndexedDB schema、迁移与领域记录仓储"
status: "done"
depends_on: ["T-F001-1"]
test_command: "npm test"
acceptance_criteria: ["可在 IndexedDB 中写入并刷新读取结构化记录及 PDF/DOCX Blob；对应文件内容不出现在 localStorage。","仓储创建记录自动生成稳定 ID 和有效 ISO 时间戳，更新记录不会更换 ID 或 createdAt，并更新 updatedAt。","数据库升级迁移的测试 fixture 中，旧版本记录的 ID、原字段和时间戳升级后保持不变且新字段获得明确默认值。","原始文件、确认后的提取文本、手动校正文本、AnalysisResult 和 AiConversation 使用可独立读取的记录或存储空间，保存其中一项不会覆盖其他项。","非法 Resume.status 或 Interview.status 被拒绝，Stage.kind 使用稳定的普通/offer/rejected/withdrawn 语义值。","所有读写通过事务 API 完成，离线运行时不触发任何网络请求。"]
files_hint: ["src/db/schema.ts","src/db/database.ts","src/db/migrations.ts","src/db/types.ts","src/db/repositories.ts","src/storage/blobStore.ts","tests/db/database.test.ts","tests/db/migrations.test.ts","tests/storage/blobStore.test.ts"]
---

# T-F001-2 — 实现 IndexedDB schema、迁移与领域记录仓储

在脚手架之上实现版本化 IndexedDB 数据层。定义 Resume、JobDescription、Application、Stage、ApplicationTimelineEvent、Interview、InterviewReview、AnalysisResult、AiConversation 及其文本/原始文件关联的 TypeScript 类型和 object store；结构化记录、提取或手动确认文本、分析结果、AI 对话和 PDF/DOCX Blob 均只能进入 IndexedDB，原始文件与文本版本不得相互覆盖。提供统一事务封装和 CRUD 仓储，创建记录生成稳定 ID 与 ISO createdAt/updatedAt，更新时保留 ID 和 createdAt；迁移必须保留旧字段、ID 和时间戳，并校验 Resume.status、Interview.status 和 Stage.kind 的允许值。

## Acceptance criteria

- [ ] 可在 IndexedDB 中写入并刷新读取结构化记录及 PDF/DOCX Blob；对应文件内容不出现在 localStorage。
- [ ] 仓储创建记录自动生成稳定 ID 和有效 ISO 时间戳，更新记录不会更换 ID 或 createdAt，并更新 updatedAt。
- [ ] 数据库升级迁移的测试 fixture 中，旧版本记录的 ID、原字段和时间戳升级后保持不变且新字段获得明确默认值。
- [ ] 原始文件、确认后的提取文本、手动校正文本、AnalysisResult 和 AiConversation 使用可独立读取的记录或存储空间，保存其中一项不会覆盖其他项。
- [ ] 非法 Resume.status 或 Interview.status 被拒绝，Stage.kind 使用稳定的普通/offer/rejected/withdrawn 语义值。
- [ ] 所有读写通过事务 API 完成，离线运行时不触发任何网络请求。
