---
id: "T-F002-1"
feature_id: "F-002"
slug: "local-resume-ingestion"
title: "实现本地简历上传、提取与持久化"
status: "done"
depends_on: []
test_command: "npm test -- tests/resume/parsers.test.ts tests/resume/ingestion.test.ts"
acceptance_criteria: ["不超过 25 MB 的 PDF 和 DOCX 可在无网络请求的情况下计算 SHA-256、提取文本，并将 Resume、原始 Blob 和 extracted 文本分开持久化到 IndexedDB。","关闭并重新打开数据库后仍可读取与上传时字节一致的原始 Blob、文件名、类型、大小、hash 和绝对 ISO 上传时间。","不支持的格式、伪造或不一致的文件类型以及超过 25 MB 的文件在写入前被拒绝，并返回包含明确修复动作的结构化错误。","相同 hash 的重复文件会被识别并返回可恢复反馈，不会静默创建重复版本。","解析失败不会删除或修改原始 Blob；Resume.status 只能进入 extraction-failed 或 needs-review，并可重新读取和下载原文件。","解析器、上传服务和错误路径测试断言 fetch 未被调用，且日志、错误信息和序列化诊断中不存在文件内容或提取正文。"]
files_hint: ["package.json","src/db/types.ts","src/db/migrations.ts","src/storage/blobStore.ts","src/parsers/pdf.ts","src/parsers/docx.ts","src/features/resumes/ingestion.ts","tests/resume/parsers.test.ts","tests/resume/ingestion.test.ts"]
---

# T-F002-1 — 实现本地简历上传、提取与持久化

建立浏览器内简历导入领域层：为 PDF/DOCX 配置纯前端文本解析器（禁止 OCR 和网络请求），校验扩展名、MIME 类型及 25 MB 上限，使用 Web Crypto SHA-256 计算文件 hash 并检测重复文件。将 Resume 元数据、原始 Blob、提取文本分别写入 IndexedDB；补齐 Resume 的 textSource、textConfirmedAt 等类型和兼容迁移。提取成功时保存不可变的 extracted 文本并将版本置为 needs-review；提取异常时仍提交原始 Blob 和元数据，将状态置为 extraction-failed，并返回可恢复的手动校正入口信息。提供刷新后读取原文件、生成下载数据和重新尝试提取的接口；任何日志或错误对象只能包含文件名、类型、大小、hash、状态等元数据，不得包含文件字节或简历文本。

## Acceptance criteria

- [ ] 不超过 25 MB 的 PDF 和 DOCX 可在无网络请求的情况下计算 SHA-256、提取文本，并将 Resume、原始 Blob 和 extracted 文本分开持久化到 IndexedDB。
- [ ] 关闭并重新打开数据库后仍可读取与上传时字节一致的原始 Blob、文件名、类型、大小、hash 和绝对 ISO 上传时间。
- [ ] 不支持的格式、伪造或不一致的文件类型以及超过 25 MB 的文件在写入前被拒绝，并返回包含明确修复动作的结构化错误。
- [ ] 相同 hash 的重复文件会被识别并返回可恢复反馈，不会静默创建重复版本。
- [ ] 解析失败不会删除或修改原始 Blob；Resume.status 只能进入 extraction-failed 或 needs-review，并可重新读取和下载原文件。
- [ ] 解析器、上传服务和错误路径测试断言 fetch 未被调用，且日志、错误信息和序列化诊断中不存在文件内容或提取正文。
