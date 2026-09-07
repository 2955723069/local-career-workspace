---
id: "T-F004-1"
feature_id: "F-004"
slug: "interview-domain-and-calendar-services"
title: "实现面试、提醒、复盘与日历基础服务"
status: "done"
depends_on: []
test_command: "npm test -- tests/interviews tests/calendar"
acceptance_criteria: ["InterviewService 可为同一 applicationId 创建 round 不同的多场面试；无效 startsAt、timezone、endsAt 或非法状态/提醒会被拒绝，合法 endsAt 允许为空。","提醒预设和自定义 offset 均可保存，计算结果为绝对 ISO 时间，并能用 Interview.timezone 格式化为该面试当地时间。","rescheduleInterview 保留旧面试记录和既有时间线，在同一事务中写入新 startsAt/endsAt/timezone、状态 rescheduled 及 interview-rescheduled 事件；事务失败时面试和事件均回滚。","取消和完成操作只能写入 cancelled 或 completed；重复保存 InterviewReview 更新原记录而不改变 interviewId 或稳定 ID。","浏览器通知授权成功时可创建对应通知任务；权限 denied、不可用或通知异常时不发出网络请求，记录 reminder failure，并仍返回可显示的应用内提醒。","ICS 输出可被解析为标准 .ics，包含 SUMMARY、DTSTART、TZID、关联公司和职位，以及 LOCATION 或职位链接；有 endsAt 时包含 DTEND。","服务层测试覆盖跨时区提醒、改期历史、复盘编辑、通知失败回退、ICS 字段和 IndexedDB 持久化，且断言 fetch/XHR 未被调用。"]
files_hint: ["src/db/schema.ts","src/db/migrations.ts","src/db/repositories.ts","src/db/types.ts","src/features/interviews/interviewService.ts","src/features/reviews/interviewReviewService.ts","src/calendar/reminders.ts","src/calendar/notifications.ts","src/calendar/ics.ts","tests/interviews/interview-service.test.ts","tests/interviews/interview-review.test.ts","tests/calendar/reminders.test.ts","tests/calendar/ics.test.ts"]
---

# T-F004-1 — 实现面试、提醒、复盘与日历基础服务

基于现有 IndexedDB repositories、ApplicationTimelineEvent 和 F-003 职位服务，补齐 InterviewService、InterviewReviewService、提醒计算、浏览器通知协调、提醒失败记录及 ICS 导出。面试必须支持同一职位多轮、有效绝对 startsAt 和 IANA timezone、可选 endsAt、地点或链接、面试官、状态和提醒；提醒支持 10 分钟、30 分钟、1 小时、1 天及自定义 offset，并按面试时区计算展示。改期必须在同一事务中保存新时间、将状态置为 rescheduled，并追加 interview-rescheduled 时间线事件，旧事件和记录不可覆盖。复盘按 interviewId 唯一保存并支持编辑评分、问题、优缺点、信号、薪资讨论、下一步和私密备注。ICS 生成必须读取关联职位的公司和职位信息，使用标准 VCALENDAR/VEVENT、TZID、标题、开始时间、可选结束时间、地点或链接、公司和职位；成功导出后记录 calendarExportedAt。浏览器通知授权、拒绝、关闭或发送失败都必须保留本地应用内提醒，并将失败原因作为不含简历/JD/API Key 的 IndexedDB 结构化记录。必要时升级 schema/migrations，保留已有数据并维持所有稳定 ID、createdAt 和 updatedAt。

## Acceptance criteria

- [ ] InterviewService 可为同一 applicationId 创建 round 不同的多场面试；无效 startsAt、timezone、endsAt 或非法状态/提醒会被拒绝，合法 endsAt 允许为空。
- [ ] 提醒预设和自定义 offset 均可保存，计算结果为绝对 ISO 时间，并能用 Interview.timezone 格式化为该面试当地时间。
- [ ] rescheduleInterview 保留旧面试记录和既有时间线，在同一事务中写入新 startsAt/endsAt/timezone、状态 rescheduled 及 interview-rescheduled 事件；事务失败时面试和事件均回滚。
- [ ] 取消和完成操作只能写入 cancelled 或 completed；重复保存 InterviewReview 更新原记录而不改变 interviewId 或稳定 ID。
- [ ] 浏览器通知授权成功时可创建对应通知任务；权限 denied、不可用或通知异常时不发出网络请求，记录 reminder failure，并仍返回可显示的应用内提醒。
- [ ] ICS 输出可被解析为标准 .ics，包含 SUMMARY、DTSTART、TZID、关联公司和职位，以及 LOCATION 或职位链接；有 endsAt 时包含 DTEND。
- [ ] 服务层测试覆盖跨时区提醒、改期历史、复盘编辑、通知失败回退、ICS 字段和 IndexedDB 持久化，且断言 fetch/XHR 未被调用。
