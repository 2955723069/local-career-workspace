---
id: "T-F008-1"
feature_id: "F-008"
slug: "responsive-accessible-ui-states"
title: "完善响应式布局、无障碍语义与隐私状态反馈"
status: "done"
depends_on: []
test_command: "npm test -- tests/app.test.ts tests/resume/library-ui.test.ts tests/applications/application-board.test.ts tests/interviews/interview-ui.test.ts tests/interviews/interview-review.test.ts tests/backup/backup-ui.test.ts tests/ai/advisor-service.test.ts && npm run build"
acceptance_criteria: ["桌面宽度下职位看板、列表、仪表盘和日历保持可扫描的多列布局；720px 以下为单列，阶段列可横向滚动，主要操作区在移动端可访问且不遮挡内容。","长文件名、公司名、职位名、JD、匹配证据和备份冲突 ID 在窄屏可换行或截断，不导致按钮、状态文本或表单控件重叠或溢出视口。","上传、创建职位、绑定简历、匹配、保存面试/复盘、备份恢复和 AI 预览发送均能使用键盘完成，焦点可见且模态/导入步骤的焦点移动合理。","所有主要表单控件有可访问名称；保存中、已保存、错误、通知被拒绝、AI 发送中/失败及可重试状态通过 aria-live 可感知。","状态和错误反馈不暴露简历正文、JD 正文、私密复盘、API Key、原始文件内容或底层网络错误详情。"]
files_hint: ["src/app/createApp.ts","src/styles.css","src/components/ApplicationBoard/ApplicationBoard.ts","src/components/InterviewCalendar/InterviewCalendar.ts","src/components/InterviewReview/InterviewReview.ts","src/components/Dashboard/Dashboard.ts","src/components/SendPreview/SendPreview.ts","src/features/backup/BackupPanel.ts","tests/app.test.ts","tests/applications/application-board.test.ts","tests/backup/backup-ui.test.ts"]
---

# T-F008-1 — 完善响应式布局、无障碍语义与隐私状态反馈

审查并补齐 createApp、简历库、职位看板、仪表盘、面试日历、复盘、AI 发送预览和备份面板的交互语义。桌面端保留看板、列表和日历的并排信息密度；移动端在窄屏切为单列，职位阶段列可横向滚动切换，并为主要提交/保存操作提供不遮挡内容的底部操作区。为所有表单控件提供关联 label，为动态保存、错误、通知权限、导入、匹配和 AI 外发状态提供 role=status 或 role=alert 的可感知反馈；确保键盘焦点在模态确认、导入步骤和失败重试后落到合理位置。统一使用不包含简历、JD、私密笔记、API Key 或原始错误响应的安全状态文案。补齐长文件名、公司名、职位名和文本证据的换行/截断规则，以及移动端按钮和状态区域的无重叠布局。

## Acceptance criteria

- [ ] 桌面宽度下职位看板、列表、仪表盘和日历保持可扫描的多列布局；720px 以下为单列，阶段列可横向滚动，主要操作区在移动端可访问且不遮挡内容。
- [ ] 长文件名、公司名、职位名、JD、匹配证据和备份冲突 ID 在窄屏可换行或截断，不导致按钮、状态文本或表单控件重叠或溢出视口。
- [ ] 上传、创建职位、绑定简历、匹配、保存面试/复盘、备份恢复和 AI 预览发送均能使用键盘完成，焦点可见且模态/导入步骤的焦点移动合理。
- [ ] 所有主要表单控件有可访问名称；保存中、已保存、错误、通知被拒绝、AI 发送中/失败及可重试状态通过 aria-live 可感知。
- [ ] 状态和错误反馈不暴露简历正文、JD 正文、私密复盘、API Key、原始文件内容或底层网络错误详情。
