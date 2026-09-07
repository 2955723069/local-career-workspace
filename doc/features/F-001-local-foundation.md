---
id: "F-001"
slug: "local-foundation"
title: "本地应用基础与数据层"
status: "done"
test_command: "npm test"
depends_on: []
acceptance_criteria: ["应用可在无网络、无登录和无服务端的情况下启动并读写本地数据。","结构化记录和原始文件写入 IndexedDB；localStorage 中不出现原始文件内容或 Blob。","所有实体使用稳定 ID 和 ISO 时间戳，schema 迁移可从旧版本升级且不丢数据。","设置可保存默认时区、默认提醒和界面迁移标记；API Key 等敏感设置有独立本地存储接口。","清除全部数据前返回记录数量并要求二次确认或确认词，取消时不删除任何数据。","仓库提供可运行的单元测试脚手架和生产构建脚本。"]
files_hint: ["package.json","src/db/","src/storage/","src/settings/","tests/"]
test_cases: [{"id":"LF-TC-1","desc":"断网启动应用并创建一条记录，刷新后记录仍可读取。","source":"§3 本地优先；§6.1"},{"id":"LF-TC-2","desc":"写入 PDF Blob 后检查 localStorage 不含 Blob 或文件内容，IndexedDB 可重新读取。","source":"§5；§6.1"},{"id":"LF-TC-3","desc":"运行 schema 迁移后稳定 ID、原字段和时间戳保持不变。","source":"§5；§8"},{"id":"LF-TC-4","desc":"清除数据预览显示准确数量，取消确认后数据保持不变。","source":"§7"}]
test_cases_command: "npm test"
---

# F-001 — 本地应用基础与数据层

建立可离线运行的浏览器 Web 应用和测试脚手架。实现 IndexedDB 持久化结构化记录、提取文本、分析结果、AI 对话及 PDF/DOCX Blob；实现 schema 版本、迁移、稳定 ID、createdAt/updatedAt、事务封装和少量 localStorage 界面设置。提供默认时区/提醒设置、数据统计、隐私基线和清除数据前的确认状态。不得引入服务端数据库、HTTP API 或 Docker 数据卷。由于仓库目前只有 PRD 和流程文档，本特性负责确定 TypeScript 前端、构建和单元测试命令。

## Acceptance criteria

- [ ] 应用可在无网络、无登录和无服务端的情况下启动并读写本地数据。
- [ ] 结构化记录和原始文件写入 IndexedDB；localStorage 中不出现原始文件内容或 Blob。
- [ ] 所有实体使用稳定 ID 和 ISO 时间戳，schema 迁移可从旧版本升级且不丢数据。
- [ ] 设置可保存默认时区、默认提醒和界面迁移标记；API Key 等敏感设置有独立本地存储接口。
- [ ] 清除全部数据前返回记录数量并要求二次确认或确认词，取消时不删除任何数据。
- [ ] 仓库提供可运行的单元测试脚手架和生产构建脚本。

## Test cases

- [ ] LF-TC-1: 断网启动应用并创建一条记录，刷新后记录仍可读取。 (来源: §3 本地优先；§6.1)
- [ ] LF-TC-2: 写入 PDF Blob 后检查 localStorage 不含 Blob 或文件内容，IndexedDB 可重新读取。 (来源: §5；§6.1)
- [ ] LF-TC-3: 运行 schema 迁移后稳定 ID、原字段和时间戳保持不变。 (来源: §5；§8)
- [ ] LF-TC-4: 清除数据预览显示准确数量，取消确认后数据保持不变。 (来源: §7)
