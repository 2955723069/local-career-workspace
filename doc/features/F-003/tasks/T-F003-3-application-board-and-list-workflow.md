---
id: "T-F003-3"
feature_id: "F-003"
slug: "application-board-and-list-workflow"
title: "交付职位看板、列表与详情交互"
status: "done"
depends_on: ["T-F003-2"]
test_command: "npm test -- tests/applications/application-board.test.ts && npm run build && npm run test:e2e -- tests/e2e/applications.spec.ts"
acceptance_criteria: ["用户可在界面创建和编辑全部职位字段，粘贴或上传并确认 JD、选择唯一当前简历，并在刷新后从 IndexedDB 恢复相同数据。","看板按阶段顺序显示职位，列表视图显示同一数据集；切换视图、jobType 筛选或阶段名称不会产生分叉的业务流程。","职位详情可查询简历 A/B 历史快照和阶段、简历、备注、归档事件，并可通过界面推进阶段、切换简历和添加备注。","阶段管理界面支持重命名、颜色、排序及普通阶段删除；结果阶段改名后界面统计仍按稳定 kind 展示。","归档、职位删除和有影响的阶段删除均展示影响概览并要求第二次确认；取消时可感知地提示未修改数据。","主要控件可通过键盘操作并具有语义化标签、可见焦点和屏幕阅读器状态；桌面与移动端不存在长文本遮挡操作控件。","自动化 UI 与端到端测试覆盖创建含 JD 和网址的职位、A 到 B 简历切换、Offer 阶段改名统计、阶段推进/备注/归档时间线及取消删除不写入。"]
files_hint: ["package.json","playwright.config.ts","src/components/ApplicationBoard/ApplicationBoard.ts","src/app/createApp.ts","src/main.ts","src/styles.css","tests/applications/application-board.test.ts","tests/e2e/applications.spec.ts"]
---

# T-F003-3 — 交付职位看板、列表与详情交互

将职位领域服务接入应用，交付可切换的阶段看板和列表视图，以及创建、编辑和详情工作流。表单包含全部职位字段、JD 粘贴或 PDF/DOCX 上传及文本确认、唯一当前简历选择；详情展示 JD、当前简历、历史快照、备注和按时间排序的时间线。看板按 Stage.order 分列，卡片和列表展示公司、职位、地点、jobType、workMode、当前简历和阶段；提供阶段推进、阶段重命名/改色/排序/普通阶段删除、备注、归档和职位删除操作。归档、职位删除及影响职位的阶段删除使用预览对话框和第二次确认。使用语义化表单标签、键盘可操作控件、可见焦点、aria-live 保存/错误状态和正确的对话框焦点处理；窄屏下看板可横向浏览，长 JD、文件名、公司名和职位名不得遮挡操作。补充 Playwright 配置与桌面、移动端主流程测试，并确保生产构建不包含测试文件、依赖源码目录或 API Key。

## Acceptance criteria

- [ ] 用户可在界面创建和编辑全部职位字段，粘贴或上传并确认 JD、选择唯一当前简历，并在刷新后从 IndexedDB 恢复相同数据。
- [ ] 看板按阶段顺序显示职位，列表视图显示同一数据集；切换视图、jobType 筛选或阶段名称不会产生分叉的业务流程。
- [ ] 职位详情可查询简历 A/B 历史快照和阶段、简历、备注、归档事件，并可通过界面推进阶段、切换简历和添加备注。
- [ ] 阶段管理界面支持重命名、颜色、排序及普通阶段删除；结果阶段改名后界面统计仍按稳定 kind 展示。
- [ ] 归档、职位删除和有影响的阶段删除均展示影响概览并要求第二次确认；取消时可感知地提示未修改数据。
- [ ] 主要控件可通过键盘操作并具有语义化标签、可见焦点和屏幕阅读器状态；桌面与移动端不存在长文本遮挡操作控件。
- [ ] 自动化 UI 与端到端测试覆盖创建含 JD 和网址的职位、A 到 B 简历切换、Offer 阶段改名统计、阶段推进/备注/归档时间线及取消删除不写入。
