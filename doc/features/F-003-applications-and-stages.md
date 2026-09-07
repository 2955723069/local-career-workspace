---
id: "F-003"
slug: "applications-and-stages"
title: "职位申请、JD 与阶段看板"
status: "done"
test_command: "npm test"
depends_on: ["F-002"]
acceptance_criteria: ["可创建和编辑职位基本信息、jobType、workMode、薪资、来源、网址、截止时间、联系人和备注，并在看板和列表中查看。","JD 可粘贴或上传 PDF/DOCX 后本地提取并确认；jobUrl 被保存但不会触发抓取网络请求。","每个职位始终只有一个 currentResumeId；绑定或切换简历会写入 ResumeUsageHistory 和时间线事件。","默认阶段存在且可排序；普通阶段可重命名、改色、删除，结果阶段改名后按 kind 统计不变。","阶段变化、简历变化、备注和归档均产生可查询的 ApplicationTimelineEvent。","职位删除或归档操作需要二次确认，并保留符合数据模型约束的关联历史。"]
files_hint: ["src/features/applications/","src/features/stages/","src/features/job-descriptions/","src/components/ApplicationBoard/","tests/applications/"]
test_cases: [{"id":"AS-TC-1","desc":"创建含粘贴 JD 和网址的职位，验证只保存网址、不调用抓取接口。","source":"§6.3；§8 职位 R1"},{"id":"AS-TC-2","desc":"为职位绑定简历 A 后切换到 B，currentResumeId 为 B 且历史含 A/B 快照。","source":"§3 可追溯；§6.3；§8 职位 R3"},{"id":"AS-TC-3","desc":"重命名 Offer 阶段并统计，结果仍归入 offer kind。","source":"§5 Stage；§8 职位 R4"},{"id":"AS-TC-4","desc":"推进阶段、添加备注、归档后时间线按时间顺序返回全部事件。","source":"§6.3"}]
test_cases_command: "npm test"
---

# F-003 — 职位申请、JD 与阶段看板

实现 JobDescription、Application、Stage、ResumeUsageHistory 和 ApplicationTimelineEvent。支持输入职位字段、粘贴或上传并确认 JD、仅保存 jobUrl 不抓取、绑定唯一当前简历、看板/列表视图、编辑/归档、阶段推进、备注和时间线。默认阶段可重命名、改色、排序并删除普通阶段；结果阶段通过稳定 kind 保留 offer、rejected、withdrawn 统计语义。切换当前简历时追加历史快照而不覆盖旧记录。

## Acceptance criteria

- [ ] 可创建和编辑职位基本信息、jobType、workMode、薪资、来源、网址、截止时间、联系人和备注，并在看板和列表中查看。
- [ ] JD 可粘贴或上传 PDF/DOCX 后本地提取并确认；jobUrl 被保存但不会触发抓取网络请求。
- [ ] 每个职位始终只有一个 currentResumeId；绑定或切换简历会写入 ResumeUsageHistory 和时间线事件。
- [ ] 默认阶段存在且可排序；普通阶段可重命名、改色、删除，结果阶段改名后按 kind 统计不变。
- [ ] 阶段变化、简历变化、备注和归档均产生可查询的 ApplicationTimelineEvent。
- [ ] 职位删除或归档操作需要二次确认，并保留符合数据模型约束的关联历史。

## Test cases

- [ ] AS-TC-1: 创建含粘贴 JD 和网址的职位，验证只保存网址、不调用抓取接口。 (来源: §6.3；§8 职位 R1)
- [ ] AS-TC-2: 为职位绑定简历 A 后切换到 B，currentResumeId 为 B 且历史含 A/B 快照。 (来源: §3 可追溯；§6.3；§8 职位 R3)
- [ ] AS-TC-3: 重命名 Offer 阶段并统计，结果仍归入 offer kind。 (来源: §5 Stage；§8 职位 R4)
- [ ] AS-TC-4: 推进阶段、添加备注、归档后时间线按时间顺序返回全部事件。 (来源: §6.3)
