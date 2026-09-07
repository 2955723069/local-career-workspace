---
id: "T-F002-2"
feature_id: "F-002"
slug: "resume-library-workflow"
title: "交付简历版本库与文本校正界面"
status: "done"
depends_on: ["T-F002-1"]
test_command: "npm test -- tests/resume/library-service.test.ts tests/resume/library-ui.test.ts && npm run build"
acceptance_criteria: ["提取成功后可预览、修改和确认文本；确认后刷新页面仍能读取相同文本、正确的 textSource 和 textConfirmedAt，且原始 Blob 与 extracted 文本未改变。","提取失败的版本仍显示预览元数据和下载操作，并可通过手动粘贴或校正确认文本后变为 ready，供后续匹配读取。","用户可创建和管理多个版本，按名称、文件名或标签搜索，并执行重命名、标签编辑、预览、原文件下载和确认文本导出。","删除操作必须经过删除预览和第二次明确确认；任一步取消都不改变 Resume、原文件、文本或使用历史。","删除原文件或将版本标记为 deleted 后，既有 ResumeUsageHistory 仍保留 resumeNameSnapshot 和 textSnapshot；新建历史快照使用删除前已确认文本且不依赖后续 Resume 查询。","RL-TC-1 至 RL-TC-4 均由自动化测试覆盖，包括刷新持久化、原 Blob 不变、失败恢复、历史快照保留以及全过程无外发请求。","桌面和窄屏布局中的主要控件可通过键盘操作，保存、错误、提取和删除状态可被屏幕阅读器感知，长文件名不会遮挡操作控件。"]
files_hint: ["src/features/resumes/resumeLibrary.ts","src/features/resumes/resumeUsageSnapshots.ts","src/components/ResumeLibrary/ResumeLibrary.ts","src/app/createApp.ts","src/main.ts","src/styles.css","tests/resume/library-service.test.ts","tests/resume/library-ui.test.ts"]
---

# T-F002-2 — 交付简历版本库与文本校正界面

基于 local-resume-ingestion 交付完整简历库工作流和可访问界面。实现提取文本预览、编辑与确认：未修改提取结果时以 textSource=extracted 保存确认文本，修改或粘贴内容时以 textSource=manual 保存；原始 Blob、extracted 文本、confirmed/manual 文本始终独立且原始内容不可被覆盖。实现多版本列表、搜索、重命名、标签、文件及确认文本预览、原文件下载、确认文本 UTF-8 导出、失败后手动粘贴/校正和重试。实现删除预览与第二次明确确认；删除原文件或将 Resume 标记 deleted 时不得级联删除 ResumeUsageHistory，并提供创建使用历史时固化 resumeNameSnapshot 和 textSnapshot 的领域接口。界面需使用语义化标签、键盘可操作控件、可见焦点及 aria-live 状态，窄屏文件名和版本名不得遮挡操作；格式、大小、重复、提取失败、保存和删除状态均提供可感知且可恢复的反馈。

## Acceptance criteria

- [ ] 提取成功后可预览、修改和确认文本；确认后刷新页面仍能读取相同文本、正确的 textSource 和 textConfirmedAt，且原始 Blob 与 extracted 文本未改变。
- [ ] 提取失败的版本仍显示预览元数据和下载操作，并可通过手动粘贴或校正确认文本后变为 ready，供后续匹配读取。
- [ ] 用户可创建和管理多个版本，按名称、文件名或标签搜索，并执行重命名、标签编辑、预览、原文件下载和确认文本导出。
- [ ] 删除操作必须经过删除预览和第二次明确确认；任一步取消都不改变 Resume、原文件、文本或使用历史。
- [ ] 删除原文件或将版本标记为 deleted 后，既有 ResumeUsageHistory 仍保留 resumeNameSnapshot 和 textSnapshot；新建历史快照使用删除前已确认文本且不依赖后续 Resume 查询。
- [ ] RL-TC-1 至 RL-TC-4 均由自动化测试覆盖，包括刷新持久化、原 Blob 不变、失败恢复、历史快照保留以及全过程无外发请求。
- [ ] 桌面和窄屏布局中的主要控件可通过键盘操作，保存、错误、提取和删除状态可被屏幕阅读器感知，长文件名不会遮挡操作控件。
