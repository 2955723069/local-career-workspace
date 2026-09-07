# F-003 — Tasks

| ID | Title | Status | Depends on | Test |
| --- | --- | --- | --- | --- |
| T-F003-1 | 实现本地 JD 导入、提取与确认 | ✅ done | — | npm test -- tests/applications/job-description.test.ts |
| T-F003-2 | 实现职位、阶段与可追溯申请领域流程 | ✅ done | T-F003-1 | npm test -- tests/applications/application-service.test.ts tests/applications/stage-service.test.ts |
| T-F003-3 | 交付职位看板、列表与详情交互 | ✅ done | T-F003-2 | npm test -- tests/applications/application-board.test.ts && npm run build && npm run test:e2e -- tests/e2e/applications.spec.ts |

