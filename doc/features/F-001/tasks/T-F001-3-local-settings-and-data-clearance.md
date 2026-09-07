---
id: "T-F001-3"
feature_id: "F-001"
slug: "local-settings-and-data-clearance"
title: "加入本地设置、敏感配置隔离与清除数据确认"
status: "done"
depends_on: ["T-F001-2"]
test_command: "npm test"
acceptance_criteria: ["可保存、读取和更新默认时区、默认提醒与界面迁移标记；localStorage 只包含这些小型设置，不包含 Blob、原始文件内容或简历/JD 长文本。","敏感 AI 设置可通过独立接口保存和读取，业务仓储无法将其作为业务字段写入记录。","清除预览返回各类结构化记录、文本和 Blob 的准确数量，并要求确认词或二次确认。","用户取消确认时 IndexedDB 和 localStorage 数据逐项保持不变；确认后所有本地业务数据及敏感设置被清除。","清除事务或后续清理失败时不会留下部分删除状态，并向调用方返回可感知的错误结果。","设置、统计和清除流程均有自动化测试覆盖。"]
files_hint: ["src/settings/preferences.ts","src/settings/secrets.ts","src/storage/dataManagement.ts","src/settings/types.ts","tests/settings/preferences.test.ts","tests/settings/secrets.test.ts","tests/storage/dataManagement.test.ts"]
---

# T-F001-3 — 加入本地设置、敏感配置隔离与清除数据确认

实现设置和数据管理模块。默认时区、默认提醒、界面偏好及迁移标记仅使用小型 localStorage 键保存；API 地址、模型名、API Key、组织 ID 和自定义请求头通过独立的本地敏感设置接口保存于 IndexedDB 的专用 store，不得写入业务记录。提供数据统计预览和二次确认/确认词流程，确认前不删除任何内容，确认后以事务方式清除所有业务记录、文件 Blob、对话和敏感设置，并在取消或失败时保持原数据。

## Acceptance criteria

- [ ] 可保存、读取和更新默认时区、默认提醒与界面迁移标记；localStorage 只包含这些小型设置，不包含 Blob、原始文件内容或简历/JD 长文本。
- [ ] 敏感 AI 设置可通过独立接口保存和读取，业务仓储无法将其作为业务字段写入记录。
- [ ] 清除预览返回各类结构化记录、文本和 Blob 的准确数量，并要求确认词或二次确认。
- [ ] 用户取消确认时 IndexedDB 和 localStorage 数据逐项保持不变；确认后所有本地业务数据及敏感设置被清除。
- [ ] 清除事务或后续清理失败时不会留下部分删除状态，并向调用方返回可感知的错误结果。
- [ ] 设置、统计和清除流程均有自动化测试覆盖。
