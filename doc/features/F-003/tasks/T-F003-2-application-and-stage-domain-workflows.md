---
id: "T-F003-2"
feature_id: "F-003"
slug: "application-and-stage-domain-workflows"
title: "实现职位、阶段与可追溯申请领域流程"
status: "done"
depends_on: ["T-F003-1"]
test_command: "npm test -- tests/applications/application-service.test.ts tests/applications/stage-service.test.ts"
acceptance_criteria: ["职位全部基本字段可创建、读取和编辑，稳定 id 与 createdAt 不变、updatedAt 单调更新；deadline 存在时为有效绝对 ISO 时间。","创建含粘贴 JD 和 jobUrl 的职位后可读取确认 JD 与原网址，fetch 未被调用，也不存在网址抓取接口调用。","首次绑定简历 A 和切换到 B 后，Application.currentResumeId 仅为 B，使用历史按顺序保留 A、B 的名称与确认文本快照，并各有 resume-changed 时间线事件。","七个默认阶段幂等存在且可排序；普通阶段可重命名、改色和安全删除，结果阶段重命名后 kind 不变，Offer、拒绝、放弃统计始终按 kind 而非名称计算。","阶段推进、备注和归档与对应 ApplicationTimelineEvent 在同一事务中提交，查询结果按时间顺序完整返回；任一写入失败不会留下半完成状态。","职位归档或删除在缺少第二次确认时被拒绝，取消不改变数据；确认删除后使用历史和时间线仍可按原 applicationId 查询。"]
files_hint: ["src/features/applications/applicationService.ts","src/features/stages/stageService.ts","src/db/types.ts","src/db/database.ts","tests/applications/application-service.test.ts","tests/applications/stage-service.test.ts"]
---

# T-F003-2 — 实现职位、阶段与可追溯申请领域流程

实现 ApplicationService 和 StageService，并使用 IndexedDB 多 store 事务维护 Application、Stage、ResumeUsageHistory、ApplicationTimelineEvent 及已确认 JD 的一致性。职位创建和编辑覆盖 company、position、jobType、location、workMode、salaryText、source、jobUrl、deadline、contact、priority 和 note；jobType 只作为字段及筛选统计维度，jobUrl 只保存为参考文本，任何流程均不得据此抓取。幂等创建收藏、已申请、笔试/测评、面试中、已获 Offer、已拒绝、已放弃七个默认阶段；支持名称、颜色和顺序维护，Stage.kind 仅允许 normal、offer、rejected、withdrawn 且编辑时不可改变。删除普通阶段时，无关联职位可直接确认删除；有职位时必须明确选择替代阶段并在同一事务中迁移及写入阶段事件。绑定或切换当前简历时读取已确认简历文本，在同一事务中设置唯一 currentResumeId、追加不可变名称/文本快照和 resume-changed 事件。阶段推进、备注新增或修改、归档分别追加事件，时间线按绝对 ISO 时间和稳定次序查询。删除和归档均提供预览与第二次明确确认，取消不得写入；删除职位不得级联删除 ResumeUsageHistory、ApplicationTimelineEvent 或简历记录。

## Acceptance criteria

- [ ] 职位全部基本字段可创建、读取和编辑，稳定 id 与 createdAt 不变、updatedAt 单调更新；deadline 存在时为有效绝对 ISO 时间。
- [ ] 创建含粘贴 JD 和 jobUrl 的职位后可读取确认 JD 与原网址，fetch 未被调用，也不存在网址抓取接口调用。
- [ ] 首次绑定简历 A 和切换到 B 后，Application.currentResumeId 仅为 B，使用历史按顺序保留 A、B 的名称与确认文本快照，并各有 resume-changed 时间线事件。
- [ ] 七个默认阶段幂等存在且可排序；普通阶段可重命名、改色和安全删除，结果阶段重命名后 kind 不变，Offer、拒绝、放弃统计始终按 kind 而非名称计算。
- [ ] 阶段推进、备注和归档与对应 ApplicationTimelineEvent 在同一事务中提交，查询结果按时间顺序完整返回；任一写入失败不会留下半完成状态。
- [ ] 职位归档或删除在缺少第二次确认时被拒绝，取消不改变数据；确认删除后使用历史和时间线仍可按原 applicationId 查询。
