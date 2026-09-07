---
id: "T-F008-3"
feature_id: "F-008"
slug: "release-documentation-and-production-audit"
title: "增加生产包隐私审计并完成使用文档"
status: "done"
depends_on: ["T-F008-2"]
test_command: "npm test && npm run build && npm run check:production && npm run test:e2e"
acceptance_criteria: ["提供可由 npm script 运行的生产审计，构建成功后确认 dist 不含 tests/e2e、测试源码、node_modules 或原始依赖目录。","生产审计拒绝疑似硬编码 API Key 或敏感 AI 配置进入构建产物，且错误输出仅标识文件和规则，不输出业务正文或密钥内容。","README 覆盖安装、启动、离线核心流程、浏览器本地存储边界、加密备份与原子恢复、通知/ICS 限制、OpenAI 兼容 AI 配置和确认发送、清除本地数据及二次确认。","npm test、npm run build、生产审计和桌面/移动端端到端测试均通过。"]
files_hint: ["package.json","scripts/check-production.ts","tests/scripts/check-production.test.ts","README.md","vite.config.ts"]
---

# T-F008-3 — 增加生产包隐私审计并完成使用文档

新增生产构建审计脚本并接入 package scripts：先构建，再递归检查 dist 不含测试源码、原始依赖目录和疑似 API Key/敏感配置值；脚本自身不得扫描或输出业务内容。为审计脚本添加自动化测试或可控临时构建目录测试。更新 README，准确说明安装启动、离线可完成的核心流程、IndexedDB 与 localStorage 边界、轻量/完整加密备份与恢复步骤、通知拒绝和浏览器关闭时的限制及 ICS 降级、OpenAI 兼容 AI 配置和发送确认、以及二次确认清除本地数据的影响。文档不得暗示存在账户、云同步、服务端 API 或自动投递。

## Acceptance criteria

- [ ] 提供可由 npm script 运行的生产审计，构建成功后确认 dist 不含 tests/e2e、测试源码、node_modules 或原始依赖目录。
- [ ] 生产审计拒绝疑似硬编码 API Key 或敏感 AI 配置进入构建产物，且错误输出仅标识文件和规则，不输出业务正文或密钥内容。
- [ ] README 覆盖安装、启动、离线核心流程、浏览器本地存储边界、加密备份与原子恢复、通知/ICS 限制、OpenAI 兼容 AI 配置和确认发送、清除本地数据及二次确认。
- [ ] npm test、npm run build、生产审计和桌面/移动端端到端测试均通过。
