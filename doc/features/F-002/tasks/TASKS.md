# F-002 — Tasks

| ID | Title | Status | Depends on | Test |
| --- | --- | --- | --- | --- |
| T-F002-1 | 实现本地简历上传、提取与持久化 | ✅ done | — | npm test -- tests/resume/parsers.test.ts tests/resume/ingestion.test.ts |
| T-F002-2 | 交付简历版本库与文本校正界面 | ✅ done | T-F002-1 | npm test -- tests/resume/library-service.test.ts tests/resume/library-ui.test.ts && npm run build |

