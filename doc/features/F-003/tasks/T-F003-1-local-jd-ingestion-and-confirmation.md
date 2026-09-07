---
id: "T-F003-1"
feature_id: "F-003"
slug: "local-jd-ingestion-and-confirmation"
title: "实现本地 JD 导入、提取与确认"
status: "done"
depends_on: []
test_command: "npm test -- tests/applications/job-description.test.ts"
acceptance_criteria: ["粘贴 JD 可先保存为独立原文记录，明确确认后生成确认文本并同步 Application.jdText，未确认内容不会被后续匹配读取。","合法 PDF/DOCX 可完全在浏览器内完成格式、25 MB 上限、内容签名、SHA-256 和文本提取，并将 JobDescription、各类文本和原始 Blob 分开持久化。","确认或手动校正 JD 不会覆盖原始 Blob、粘贴原文或 extracted 文本；刷新数据库后仍可读取各自内容及稳定 id、createdAt、updatedAt。","格式不支持、类型不一致、超限和重复文件在产生非预期写入前返回明确可恢复反馈；提取失败仍保留原文件并允许手动确认。","成功、失败和恢复路径的自动化测试均断言 fetch 未被调用，且错误及日志不包含 JD 正文或文件内容。"]
files_hint: ["src/db/types.ts","src/features/job-descriptions/jobDescriptionService.ts","src/parsers/pdf.ts","src/parsers/docx.ts","tests/applications/job-description.test.ts"]
---

# T-F003-1 — 实现本地 JD 导入、提取与确认

基于现有 PDF/DOCX 浏览器解析器和 IndexedDB 基础设施实现 JobDescriptionService。支持粘贴 JD，或上传不超过 25 MB 的 PDF/DOCX 后在本地校验、计算 SHA-256、提取文本并保存原始 Blob；不得使用 OCR 或发出网络请求。将粘贴原文、提取文本、确认文本和手动校正文本作为独立 JobDescriptionText 记录保存，必要时扩展 JobDescriptionTextKind；确认后同步 Application.jdText，文件来源同时关联 Application.jdFileId。解析失败时保留职位、JobDescription 元数据和原始文件，返回可恢复的手动粘贴或校正状态。错误和日志只包含安全元数据，不包含 JD 正文，文件 hash 不得与内容一起记录。

## Acceptance criteria

- [ ] 粘贴 JD 可先保存为独立原文记录，明确确认后生成确认文本并同步 Application.jdText，未确认内容不会被后续匹配读取。
- [ ] 合法 PDF/DOCX 可完全在浏览器内完成格式、25 MB 上限、内容签名、SHA-256 和文本提取，并将 JobDescription、各类文本和原始 Blob 分开持久化。
- [ ] 确认或手动校正 JD 不会覆盖原始 Blob、粘贴原文或 extracted 文本；刷新数据库后仍可读取各自内容及稳定 id、createdAt、updatedAt。
- [ ] 格式不支持、类型不一致、超限和重复文件在产生非预期写入前返回明确可恢复反馈；提取失败仍保留原文件并允许手动确认。
- [ ] 成功、失败和恢复路径的自动化测试均断言 fetch 未被调用，且错误及日志不包含 JD 正文或文件内容。
