# F-008 — Tasks

| ID | Title | Status | Depends on | Test |
| --- | --- | --- | --- | --- |
| T-F008-1 | 完善响应式布局、无障碍语义与隐私状态反馈 | ✅ done | — | npm test -- tests/app.test.ts tests/resume/library-ui.test.ts tests/applications/application-board.test.ts tests/interviews/interview-ui.test.ts tests/interviews/interview-review.test.ts tests/backup/backup-ui.test.ts tests/ai/advisor-service.test.ts && npm run build |
| T-F008-2 | 补齐桌面与移动端离线主流程端到端测试 | ✅ done | T-F008-1 | npm run test:e2e |
| T-F008-3 | 增加生产包隐私审计并完成使用文档 | ✅ done | T-F008-2 | npm test && npm run build && npm run check:production && npm run test:e2e |

