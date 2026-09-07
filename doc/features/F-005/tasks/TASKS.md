# F-005 — Tasks

| ID | Title | Status | Depends on | Test |
| --- | --- | --- | --- | --- |
| T-F005-1 | 实现本地 JD 归一化、分组与可解释评分引擎 | ✅ done | — | npm test -- tests/matching/normalization.test.ts tests/matching/scoring.test.ts |
| T-F005-2 | 持久化 AnalysisResult 并在职位详情提供匹配页面 | ✅ done | T-F005-1 | npm test -- tests/matching tests/applications/application-board.test.ts && npm run build && npm run test:e2e -- tests/e2e/applications.spec.ts |

