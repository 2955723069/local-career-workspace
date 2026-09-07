# F-007 — Tasks

| ID | Title | Status | Depends on | Test |
| --- | --- | --- | --- | --- |
| T-F007-1 | 实现加密备份格式与导出 | ✅ done | — | npm test -- tests/backup/crypto.test.ts tests/backup/format.test.ts |
| T-F007-2 | 实现预览、冲突处理与原子导入 | ✅ done | T-F007-1 | npm test -- tests/backup/importTransaction.test.ts |
| T-F007-3 | 接入备份恢复界面与可感知状态 | ✅ done | T-F007-2 | npm test -- tests/backup/backup-ui.test.ts |

