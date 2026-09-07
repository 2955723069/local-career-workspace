---
id: "T-F005-1"
feature_id: "F-005"
slug: "local-matching-engine"
title: "实现本地 JD 归一化、分组与可解释评分引擎"
status: "done"
depends_on: []
test_command: "npm test -- tests/matching/normalization.test.ts tests/matching/scoring.test.ts"
acceptance_criteria: ["归一化测试覆盖中英文变体、大小写、空格和标点差异，分组结果保留可展示的原始关键词词形。","评分结果能区分明确匹配、同义词近似、弱上下文、缺失和待人工确认，并为有匹配证据的项目生成来自简历原文的可核验片段。","结果同时提供总体、必需和加分覆盖率，以及匹配、弱匹配、缺失和待人工确认列表，覆盖率分母和空集合行为有明确测试。","在拦截 fetch 和 XMLHttpRequest 的测试中执行匹配时网络调用次数为零，替换在线/离线状态不会改变同一输入的结果。","核心模块测试不写入 IndexedDB 或 localStorage，也不修改原始 JD、简历文本或文件内容。"]
files_hint: ["src/matching/normalization.ts","src/matching/scoring.ts","src/matching/types.ts","tests/matching/normalization.test.ts","tests/matching/scoring.test.ts"]
---

# T-F005-1 — 实现本地 JD 归一化、分组与可解释评分引擎

基于 F-003 已确认的 JD 文本和简历文本，新增完全浏览器内执行的匹配核心。实现 src/matching/normalization.ts、scoring.ts 及必要的类型或解析模块：统一大小写、空格、标点和常见中英文变体，保留每个关键词的原始词形；按技能/工具/框架/平台、通用能力、学历、证书、语言、年限和职责词分组，并识别必需与加分属性。对每项输出明确匹配、同义词近似、弱上下文、缺失或待人工确认状态、原始词形、简历证据片段和不确定标记，计算总体、必需和加分覆盖率。引擎只能读取传入文本，不得调用 fetch、XMLHttpRequest 或其他网络接口。

## Acceptance criteria

- [ ] 归一化测试覆盖中英文变体、大小写、空格和标点差异，分组结果保留可展示的原始关键词词形。
- [ ] 评分结果能区分明确匹配、同义词近似、弱上下文、缺失和待人工确认，并为有匹配证据的项目生成来自简历原文的可核验片段。
- [ ] 结果同时提供总体、必需和加分覆盖率，以及匹配、弱匹配、缺失和待人工确认列表，覆盖率分母和空集合行为有明确测试。
- [ ] 在拦截 fetch 和 XMLHttpRequest 的测试中执行匹配时网络调用次数为零，替换在线/离线状态不会改变同一输入的结果。
- [ ] 核心模块测试不写入 IndexedDB 或 localStorage，也不修改原始 JD、简历文本或文件内容。
