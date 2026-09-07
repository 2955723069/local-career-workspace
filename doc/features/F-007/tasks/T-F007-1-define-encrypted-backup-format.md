---
id: "T-F007-1"
feature_id: "F-007"
slug: "define-encrypted-backup-format"
title: "实现加密备份格式与导出"
status: "done"
depends_on: []
test_command: "npm test -- tests/backup/crypto.test.ts tests/backup/format.test.ts"
acceptance_criteria: ["轻量备份可通过 decryptBackup 解密解析，payload 不含 originalFiles 或任何 Blob；完整备份包含每个 originalFiles 记录的文件名、类型、owner 信息和可还原的字节内容。","连续两次使用相同密码和数据导出时，salt 和 IV 均为非空随机值且两次均不同；解密结果正确，导出内容和元数据中不存在密码。","实现实际调用 PBKDF2-SHA-256 和 AES-GCM 256 位密钥；修改密文、认证标签、版本或格式字段时 decryptBackup 明确失败。","导出 allowlist 不包含 sensitiveSettings、API Key、通知授权、临时 AI 请求上下文或发送预览，并通过 fetch spy 断言导出没有网络请求。","导出只读取 IndexedDB，不改变任何现有记录，且 malformed payload、错误密码和损坏二进制均在写入前失败。"]
files_hint: ["src/backup/crypto.ts","src/backup/format.ts","src/db/schema.ts","src/db/types.ts","tests/backup/crypto.test.ts","tests/backup/format.test.ts"]
---

# T-F007-1 — 实现加密备份格式与导出

在 src/backup/crypto.ts 和 src/backup/format.ts 中定义版本化备份信封、轻量/完整备份类型及序列化接口。实现 exportBackup(database, { kind, password }) 和 decryptBackup(input, password)：从 IndexedDB 读取允许导出的业务 store，排除 sensitiveSettings、localStorage、API 配置、通知授权、临时 AI 上下文和发送预览；轻量备份不得包含 originalFiles，完整备份须以无损字节和元数据包含全部 PDF/DOCX Blob。使用 Web Crypto 的 PBKDF2-SHA-256 派生 256 位密钥和 AES-256-GCM 加密，随机生成 salt 与 IV，密码不得进入信封、明文 payload、日志或持久化设置。对版本、备份类型、store 记录、Blob 编码和认证标签执行严格格式校验，并为后续导入暴露稳定的 BackupPayload 类型。

## Acceptance criteria

- [ ] 轻量备份可通过 decryptBackup 解密解析，payload 不含 originalFiles 或任何 Blob；完整备份包含每个 originalFiles 记录的文件名、类型、owner 信息和可还原的字节内容。
- [ ] 连续两次使用相同密码和数据导出时，salt 和 IV 均为非空随机值且两次均不同；解密结果正确，导出内容和元数据中不存在密码。
- [ ] 实现实际调用 PBKDF2-SHA-256 和 AES-GCM 256 位密钥；修改密文、认证标签、版本或格式字段时 decryptBackup 明确失败。
- [ ] 导出 allowlist 不包含 sensitiveSettings、API Key、通知授权、临时 AI 请求上下文或发送预览，并通过 fetch spy 断言导出没有网络请求。
- [ ] 导出只读取 IndexedDB，不改变任何现有记录，且 malformed payload、错误密码和损坏二进制均在写入前失败。
