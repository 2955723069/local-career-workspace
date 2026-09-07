# F-004 — Tasks

| ID | Title | Status | Depends on | Test |
| --- | --- | --- | --- | --- |
| T-F004-1 | 实现面试、提醒、复盘与日历基础服务 | ✅ done | — | npm test -- tests/interviews tests/calendar |
| T-F004-2 | 集成面试日历、提醒反馈和复盘界面 | ✅ done | T-F004-1 | npm test -- tests/interviews/interview-ui.test.ts |
| T-F004-3 | 实现仪表盘聚合、职位类型筛选与端到端流程 | ✅ done | T-F004-1, T-F004-2 | npm test -- tests/dashboard/dashboard.test.ts && npm run test:e2e -- tests/e2e/interviews-reviews-dashboard.spec.ts |

