---
id: "T-F004-3"
feature_id: "F-004"
slug: "dashboard-aggregation-and-e2e"
title: "实现仪表盘聚合、职位类型筛选与端到端流程"
status: "done"
depends_on: ["T-F004-1","T-F004-2"]
test_command: "npm test -- tests/dashboard/dashboard.test.ts && npm run test:e2e -- tests/e2e/interviews-reviews-dashboard.spec.ts"
acceptance_criteria: ["DashboardService 返回今日面试、未来 7 日行动、待跟进职位、按阶段统计、最近简历、最近 AnalysisResult、待复盘面试和提醒失败的结构化聚合结果。","传入 jobType 后所有聚合结果只包含对应职位；清除筛选后恢复全部类型，且不会修改 IndexedDB 业务记录。","完成面试但未保存 InterviewReview 的记录出现在待复盘区域；保存复盘后从待复盘区域移除或标记为已完成。","仪表盘显示提醒失败原因和可恢复操作入口；无通知权限时仍能从日历导出 ICS 并查看应用内提醒。","新增 Playwright spec 在 desktop 和 mobile projects 均通过，验证主要面试、改期、复盘、仪表盘筛选流程；生产构建不包含测试文件或敏感设置。"]
files_hint: ["src/features/dashboard/dashboardService.ts","src/components/Dashboard/Dashboard.ts","src/app/createApp.ts","src/styles.css","tests/dashboard/dashboard.test.ts","tests/e2e/interviews-reviews-dashboard.spec.ts"]
---

# T-F004-3 — 实现仪表盘聚合、职位类型筛选与端到端流程

新增 DashboardService 和仪表盘组件，读取 Interview、InterviewReview、Application、Stage、Resume、AnalysisResult 及提醒失败记录，聚合今日面试、未来 7 日行动、待跟进职位、阶段数量、最近简历/匹配、已完成但缺少复盘的面试和提醒失败。提供 jobType 筛选，筛选必须同时作用于所有聚合区块，默认展示全部类型。将仪表盘接入现有首页并与职位详情、日历和复盘状态联动；空数据、读取异常和提醒失败必须以可感知状态呈现。新增 Playwright 桌面端和移动端流程，覆盖创建职位、创建跨时区面试、改期、完成、填写复盘、查看仪表盘筛选及通知拒绝后的 ICS/应用内提醒回退。

## Acceptance criteria

- [ ] DashboardService 返回今日面试、未来 7 日行动、待跟进职位、按阶段统计、最近简历、最近 AnalysisResult、待复盘面试和提醒失败的结构化聚合结果。
- [ ] 传入 jobType 后所有聚合结果只包含对应职位；清除筛选后恢复全部类型，且不会修改 IndexedDB 业务记录。
- [ ] 完成面试但未保存 InterviewReview 的记录出现在待复盘区域；保存复盘后从待复盘区域移除或标记为已完成。
- [ ] 仪表盘显示提醒失败原因和可恢复操作入口；无通知权限时仍能从日历导出 ICS 并查看应用内提醒。
- [ ] 新增 Playwright spec 在 desktop 和 mobile projects 均通过，验证主要面试、改期、复盘、仪表盘筛选流程；生产构建不包含测试文件或敏感设置。
