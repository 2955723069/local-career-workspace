---
id: "F-004"
slug: "interviews-reviews-dashboard"
title: "面试日历、提醒与复盘仪表盘"
status: "done"
test_command: "npm test"
depends_on: ["F-003"]
acceptance_criteria: ["可为同一职位创建多轮面试，每场必须有有效 startsAt 和 timezone，endsAt 可为空。","面试可设置 10 分钟、30 分钟、1 小时、1 天或自定义提醒，并按面试时区计算显示。","支持日、周、月视图，改期、取消和完成；改期追加新时间及时间线记录，不静默覆盖旧值。","浏览器通知获授权时按正确时区触发；被拒绝或浏览器关闭时应用内提醒和 .ics 导出仍可用并显示提示。",".ics 包含标题、开始/结束时间、TZID、地点或链接、公司和职位。","可填写和编辑 InterviewReview 的评分、问题、优缺点、信号、薪资讨论、下一步和私密备注。","仪表盘显示今日/7 日行动、阶段数量、最近简历/匹配、待复盘和提醒失败，并可按 jobType 筛选。"]
files_hint: ["src/features/interviews/","src/features/calendar/","src/features/reviews/","src/features/dashboard/","src/calendar/ics.ts","tests/interviews/"]
test_cases: [{"id":"IR-TC-1","desc":"创建跨时区面试并计算提醒，展示时间与记录时区一致。","source":"§6.4；§9；§8 职位与面试 R5"},{"id":"IR-TC-2","desc":"改期后旧时间线记录保留且新时间可在日历中查看。","source":"§6.4；§5 Interview"},{"id":"IR-TC-3","desc":"拒绝通知权限时应用内提醒和 .ics 仍可生成，.ics 包含规定字段。","source":"§6.4；§9；§7"},{"id":"IR-TC-4","desc":"保存结构化复盘并在仪表盘显示待复盘状态，jobType 筛选结果正确。","source":"§4.1；§6.4"}]
test_cases_command: "npm test"
---

# F-004 — 面试日历、提醒与复盘仪表盘

实现 Interview、Reminder 和 InterviewReview 及其 UI。支持多轮面试、每场独立时区、开始/可选结束时间、地点或链接、面试官、提醒和状态；提供日/周/月日历、应用内提醒、浏览器通知权限处理、预设及自定义提醒、改期/取消/完成、结构化复盘和标准 .ics 导出。改期必须产生历史记录。将今日/未来 7 天面试、待跟进职位、阶段统计、待复盘和失败通知聚合到仪表盘并支持 jobType 筛选。

## Acceptance criteria

- [ ] 可为同一职位创建多轮面试，每场必须有有效 startsAt 和 timezone，endsAt 可为空。
- [ ] 面试可设置 10 分钟、30 分钟、1 小时、1 天或自定义提醒，并按面试时区计算显示。
- [ ] 支持日、周、月视图，改期、取消和完成；改期追加新时间及时间线记录，不静默覆盖旧值。
- [ ] 浏览器通知获授权时按正确时区触发；被拒绝或浏览器关闭时应用内提醒和 .ics 导出仍可用并显示提示。
- [ ] .ics 包含标题、开始/结束时间、TZID、地点或链接、公司和职位。
- [ ] 可填写和编辑 InterviewReview 的评分、问题、优缺点、信号、薪资讨论、下一步和私密备注。
- [ ] 仪表盘显示今日/7 日行动、阶段数量、最近简历/匹配、待复盘和提醒失败，并可按 jobType 筛选。

## Test cases

- [ ] IR-TC-1: 创建跨时区面试并计算提醒，展示时间与记录时区一致。 (来源: §6.4；§9；§8 职位与面试 R5)
- [ ] IR-TC-2: 改期后旧时间线记录保留且新时间可在日历中查看。 (来源: §6.4；§5 Interview)
- [ ] IR-TC-3: 拒绝通知权限时应用内提醒和 .ics 仍可生成，.ics 包含规定字段。 (来源: §6.4；§9；§7)
- [ ] IR-TC-4: 保存结构化复盘并在仪表盘显示待复盘状态，jobType 筛选结果正确。 (来源: §4.1；§6.4)
