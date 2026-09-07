---
id: "F-002"
slug: "resume-library"
title: "简历库与本地文本提取"
status: "done"
test_command: "npm test"
depends_on: ["F-001"]
acceptance_criteria: ["可上传不超过 25 MB 的 PDF/DOCX，保存类型、大小、文件名、hash 和上传时间；不支持格式或超限文件被拒绝并显示修复动作。","提取成功后用户可确认或修改文本，确认文本以 textSource=extracted 或 manual 保存。","提取失败时原文件仍可下载，记录状态为 extraction-failed 或 needs-review，并可粘贴/校正文本后继续使用。","可创建多个简历版本、重命名、添加标签、搜索、预览、下载、导出和删除；删除需要二次确认。","删除原始文件或将版本标记 deleted 后，已存在的使用历史仍可保存 resumeNameSnapshot 和 textSnapshot。","日志和错误反馈只包含文件元数据，不包含简历正文。"]
files_hint: ["src/features/resumes/","src/parsers/","src/components/ResumeLibrary/","tests/resume/"]
test_cases: [{"id":"RL-TC-1","desc":"上传 25 MB 以内 PDF 和 DOCX，刷新后可预览和下载。","source":"§6.2；§8 简历 R1"},{"id":"RL-TC-2","desc":"模拟文本提取成功，确认和修改后的文本可被重新读取且原 Blob 未改变。","source":"§6.2；§8 简历 R2"},{"id":"RL-TC-3","desc":"模拟提取失败，原文件保留、显示手动校正入口，粘贴文本后匹配输入可用。","source":"§6.2；§7；§8 简历 R3"},{"id":"RL-TC-4","desc":"删除原文件后查询使用历史仍返回名称和文本快照。","source":"§5 ResumeUsageHistory；§8 简历 R5"}]
test_cases_command: "npm test"
---

# F-002 — 简历库与本地文本提取

实现 Resume 及其原始文件存储、PDF/DOCX 上传校验、文件 hash、浏览器本地文本提取、成功确认/编辑、失败手动校正以及版本库管理。原始文件和确认后的文本必须分开保存；提取失败保留原文件并标记 extraction-failed 或 needs-review。提供预览、下载、重命名、标签、搜索、导出和二次确认删除，并为后续职位简历历史保留名称和文本快照能力。

## Acceptance criteria

- [ ] 可上传不超过 25 MB 的 PDF/DOCX，保存类型、大小、文件名、hash 和上传时间；不支持格式或超限文件被拒绝并显示修复动作。
- [ ] 提取成功后用户可确认或修改文本，确认文本以 textSource=extracted 或 manual 保存。
- [ ] 提取失败时原文件仍可下载，记录状态为 extraction-failed 或 needs-review，并可粘贴/校正文本后继续使用。
- [ ] 可创建多个简历版本、重命名、添加标签、搜索、预览、下载、导出和删除；删除需要二次确认。
- [ ] 删除原始文件或将版本标记 deleted 后，已存在的使用历史仍可保存 resumeNameSnapshot 和 textSnapshot。
- [ ] 日志和错误反馈只包含文件元数据，不包含简历正文。

## Test cases

- [ ] RL-TC-1: 上传 25 MB 以内 PDF 和 DOCX，刷新后可预览和下载。 (来源: §6.2；§8 简历 R1)
- [ ] RL-TC-2: 模拟文本提取成功，确认和修改后的文本可被重新读取且原 Blob 未改变。 (来源: §6.2；§8 简历 R2)
- [ ] RL-TC-3: 模拟提取失败，原文件保留、显示手动校正入口，粘贴文本后匹配输入可用。 (来源: §6.2；§7；§8 简历 R3)
- [ ] RL-TC-4: 删除原文件后查询使用历史仍返回名称和文本快照。 (来源: §5 ResumeUsageHistory；§8 简历 R5)
