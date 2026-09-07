---
id: "T-F005-2"
feature_id: "F-005"
slug: "persist-and-present-matching-results"
title: "持久化 AnalysisResult 并在职位详情提供匹配页面"
status: "done"
depends_on: ["T-F005-1"]
test_command: "npm test -- tests/matching tests/applications/application-board.test.ts && npm run build && npm run test:e2e -- tests/e2e/applications.spec.ts"
acceptance_criteria: ["运行匹配只使用确认后的 JD 和简历文本，在拦截 fetch/XMLHttpRequest 的服务与 UI 测试中网络调用次数为零。","每次运行都新增独立的 AnalysisResult，applicationId、resumeId、mode 和时间戳正确保存；同一职位切换不同简历后结果彼此隔离，旧结果仍可查询。","职位详情可以从当前简历或其他可用简历启动本地匹配，并从历史列表重新打开已保存结果，不需要联网或外部 API 配置。","界面显示总体、必需和加分覆盖率、匹配/弱匹配/缺失/待人工确认列表、每项证据片段及仅代表文本证据的提示；长关键词和证据在窄屏可换行且不遮挡控件。","未确认 JD/简历文本、无绑定简历、匹配异常或 IndexedDB 写入失败均以可感知状态提示反馈，不覆盖原始文件、确认文本、手动校正文本或已有 AnalysisResult。","自动化测试覆盖持久化刷新读取、职位/简历隔离、历史重新打开、取消或错误状态，以及职位详情的桌面和移动端主要匹配流程。"]
files_hint: ["src/features/matching/matchingService.ts","src/db/types.ts","src/db/schema.ts","src/db/repositories.ts","src/components/MatchingPanel/MatchingPanel.ts","src/components/ApplicationBoard/ApplicationBoard.ts","src/app/createApp.ts","src/styles.css","tests/matching/service.test.ts","tests/applications/application-board.test.ts","tests/e2e/applications.spec.ts"]
---

# T-F005-2 — 持久化 AnalysisResult 并在职位详情提供匹配页面

在 local-matching-engine 基础上实现匹配领域服务和职位详情中的 JD 匹配界面。服务从 IndexedDB 读取 Application 的确认 JD 文本及所选 Resume 的确认文本，调用纯本地引擎并将 mode 为 local 的 AnalysisResult 写入 analysisResults store；记录必须保留稳定 id、createdAt、updatedAt、applicationId 和 resumeId，支持按职位、简历、模式查询历史并读取最新结果。必要时补充复合索引或类型字段，但不得把敏感配置、原始文件或未确认文本写入结果。扩展 ApplicationBoardOptions、createApp 和 ApplicationBoard，在职位详情中允许选择可用简历、运行匹配、重新打开历史结果，并展示覆盖率、匹配/弱匹配/缺失/待确认项目、证据片段及“仅代表文本证据”的明确声明；缺少确认文本或保存失败时显示可恢复状态且保留现有资料。

## Acceptance criteria

- [ ] 运行匹配只使用确认后的 JD 和简历文本，在拦截 fetch/XMLHttpRequest 的服务与 UI 测试中网络调用次数为零。
- [ ] 每次运行都新增独立的 AnalysisResult，applicationId、resumeId、mode 和时间戳正确保存；同一职位切换不同简历后结果彼此隔离，旧结果仍可查询。
- [ ] 职位详情可以从当前简历或其他可用简历启动本地匹配，并从历史列表重新打开已保存结果，不需要联网或外部 API 配置。
- [ ] 界面显示总体、必需和加分覆盖率、匹配/弱匹配/缺失/待人工确认列表、每项证据片段及仅代表文本证据的提示；长关键词和证据在窄屏可换行且不遮挡控件。
- [ ] 未确认 JD/简历文本、无绑定简历、匹配异常或 IndexedDB 写入失败均以可感知状态提示反馈，不覆盖原始文件、确认文本、手动校正文本或已有 AnalysisResult。
- [ ] 自动化测试覆盖持久化刷新读取、职位/简历隔离、历史重新打开、取消或错误状态，以及职位详情的桌面和移动端主要匹配流程。
