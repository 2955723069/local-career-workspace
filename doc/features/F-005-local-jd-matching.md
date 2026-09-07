---
id: "F-005"
slug: "local-jd-matching"
title: "可解释的本地 JD 匹配"
status: "done"
test_command: "npm test"
depends_on: ["F-003"]
acceptance_criteria: ["运行本地匹配时不发出任何网络请求，离线状态下结果与在线状态一致。","归一化和分组保留原始关键词词形，并能区分明确匹配、弱匹配、缺失和待人工确认。","结果显示总体、必需和加分关键词覆盖率，以及匹配/弱匹配/缺失列表。","每个匹配项提供可核验的简历证据片段；结果明确声明仅代表文本证据。","AnalysisResult 按 applicationId、resumeId、mode 和时间持久化，并可从职位详情重新打开。"]
files_hint: ["src/features/matching/","src/matching/","src/matching/normalization.ts","src/matching/scoring.ts","tests/matching/"]
test_cases: [{"id":"JM-TC-1","desc":"在拦截 fetch/XHR 的测试中运行匹配，确认网络调用次数为零。","source":"§6.5；§8 匹配与 AI M1"},{"id":"JM-TC-2","desc":"输入含中英文变体、大小写和标点差异的文本，归一化后分组和原词形均正确。","source":"§6.5"},{"id":"JM-TC-3","desc":"结果同时返回覆盖率、已匹配、弱匹配、缺失和证据片段。","source":"§6.5；§8 匹配与 AI M2"},{"id":"JM-TC-4","desc":"相同职位切换不同简历后 AnalysisResult 隔离保存且可重新查看。","source":"§5 AnalysisResult；§4.5"}]
test_cases_command: "npm test"
---

# F-005 — 可解释的本地 JD 匹配

实现完全浏览器内运行的匹配引擎和 JD 匹配页面。对 JD 与确认后的简历文本做大小写、空格、标点及常见中英文变体归一化，按技能/工具/框架/平台、通用能力、学历、证书、语言、年限和职责词分组，识别明确、同义词近似、弱上下文和缺失项。每项保存原始词形、证据片段和不确定标记，计算总体、必需和加分覆盖率，并持久化 AnalysisResult。

## Acceptance criteria

- [ ] 运行本地匹配时不发出任何网络请求，离线状态下结果与在线状态一致。
- [ ] 归一化和分组保留原始关键词词形，并能区分明确匹配、弱匹配、缺失和待人工确认。
- [ ] 结果显示总体、必需和加分关键词覆盖率，以及匹配/弱匹配/缺失列表。
- [ ] 每个匹配项提供可核验的简历证据片段；结果明确声明仅代表文本证据。
- [ ] AnalysisResult 按 applicationId、resumeId、mode 和时间持久化，并可从职位详情重新打开。

## Test cases

- [ ] JM-TC-1: 在拦截 fetch/XHR 的测试中运行匹配，确认网络调用次数为零。 (来源: §6.5；§8 匹配与 AI M1)
- [ ] JM-TC-2: 输入含中英文变体、大小写和标点差异的文本，归一化后分组和原词形均正确。 (来源: §6.5)
- [ ] JM-TC-3: 结果同时返回覆盖率、已匹配、弱匹配、缺失和证据片段。 (来源: §6.5；§8 匹配与 AI M2)
- [ ] JM-TC-4: 相同职位切换不同简历后 AnalysisResult 隔离保存且可重新查看。 (来源: §5 AnalysisResult；§4.5)
