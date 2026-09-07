# F-006 — Tasks

| ID | Title | Status | Depends on | Test |
| --- | --- | --- | --- | --- |
| T-F006-1 | 实现 AI 设置、OpenAI 客户端与职位级对话服务 | ✅ done | — | npm test -- tests/ai tests/settings/secrets.test.ts |
| T-F006-2 | 集成发送确认、顾问结果展示、追问与报告导出 | ✅ done | T-F006-1 | npm test -- tests/ai tests/applications/application-board.test.ts && npm run build && npm run test:e2e -- tests/e2e/ai-career-advisor.spec.ts |

