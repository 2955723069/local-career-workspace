---
id: "T-F007-2"
feature_id: "F-007"
slug: "implement-atomic-backup-import"
title: "实现预览、冲突处理与原子导入"
status: "done"
depends_on: ["T-F007-1"]
test_command: "npm test -- tests/backup/importTransaction.test.ts"
acceptance_criteria: ["prepareBackupImport 在任何写入前返回备份版本、类型、各 store 数量、Blob 数量和冲突项；未提供冲突选择时所有冲突默认保留本地数据。","每个冲突项都可独立选择 keep-local、use-backup 或 import-copy；import-copy 使用新 ID，并使 application、resume、text、interview、timeline、analysis、conversation、originalFiles 等引用保持一致。","commitBackupImport 只通过一个覆盖相关 store 的 readwrite 事务提交；模拟重复键、索引错误、关闭数据库或其他写入失败后，本地所有 store 的快照与导入前完全一致。","错误密码、损坏文件、版本/Schema/时间戳/status/timezone 校验失败以及取消冲突处理都不会修改本地数据，也不会删除原始文件或已有对话。","成功提交后关闭并重新打开数据库仍可读取导入记录和完整备份中的 Blob；再次导入同一备份会报告冲突并等待用户选择，不自动覆盖。"]
files_hint: ["src/backup/importTransaction.ts","src/features/backup/backupService.ts","src/db/database.ts","src/db/repositories.ts","src/db/types.ts","src/storage/blobStore.ts","tests/backup/importTransaction.test.ts"]
---

# T-F007-2 — 实现预览、冲突处理与原子导入

在 src/backup/importTransaction.ts 和 src/features/backup/backupService.ts 中实现分阶段导入服务，复用 decryptBackup。提供 prepareBackupImport(database, encryptedInput, password) 以完成解密、版本/记录校验、数据概览和按 store/id 的重复检测，但不得写库；提供 buildImportPlan(session, resolutions) 支持 keep-local、use-backup、import-copy 三种逐项选择，默认 keep-local；对导入副本生成新稳定 ID，并一致重映射跨记录引用以及 originalFiles.ownerId。提供 commitBackupImport(database, plan)，在覆盖所有相关业务 store 的单个 readwrite IndexedDB 事务中一次性提交，任何校验、取消或写入异常都 abort 且不产生部分结果；成功后记录可刷新读取，重复导入不能静默覆盖本地记录。

## Acceptance criteria

- [ ] prepareBackupImport 在任何写入前返回备份版本、类型、各 store 数量、Blob 数量和冲突项；未提供冲突选择时所有冲突默认保留本地数据。
- [ ] 每个冲突项都可独立选择 keep-local、use-backup 或 import-copy；import-copy 使用新 ID，并使 application、resume、text、interview、timeline、analysis、conversation、originalFiles 等引用保持一致。
- [ ] commitBackupImport 只通过一个覆盖相关 store 的 readwrite 事务提交；模拟重复键、索引错误、关闭数据库或其他写入失败后，本地所有 store 的快照与导入前完全一致。
- [ ] 错误密码、损坏文件、版本/Schema/时间戳/status/timezone 校验失败以及取消冲突处理都不会修改本地数据，也不会删除原始文件或已有对话。
- [ ] 成功提交后关闭并重新打开数据库仍可读取导入记录和完整备份中的 Blob；再次导入同一备份会报告冲突并等待用户选择，不自动覆盖。
