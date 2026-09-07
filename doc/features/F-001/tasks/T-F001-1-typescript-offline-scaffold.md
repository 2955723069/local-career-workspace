---
id: "T-F001-1"
feature_id: "F-001"
slug: "typescript-offline-scaffold"
title: "建立 TypeScript 离线应用、构建与测试脚手架"
status: "done"
depends_on: []
test_command: "npm test"
acceptance_criteria: ["执行 npm test 能发现并运行测试，且测试环境可创建浏览器 IndexedDB 实例。","执行 npm run build 生成生产构建，构建内容不包含测试文件、原始依赖目录或硬编码 API Key。","应用入口在断网条件下可由静态资源启动，不发起认证、服务端数据库或 HTTP API 请求。","README 至少说明安装、启动、离线使用和本地存储边界。"]
files_hint: ["package.json","tsconfig.json","vite.config.ts","index.html","src/main.ts","src/app/","tests/setup.ts","tests/smoke.test.ts","README.md"]
---

# T-F001-1 — 建立 TypeScript 离线应用、构建与测试脚手架

从当前仅有文档的仓库建立最小可运行的 TypeScript 前端工程。配置 package.json、Vite（或同等静态构建工具）、TypeScript 和 Vitest 测试环境，提供 dev/build/test 脚本及浏览器 IndexedDB 测试模拟。创建无需登录、服务端或联网请求即可启动的应用入口和基础状态提示，并在 README 中说明安装、启动、离线运行和本地数据原则。

## Acceptance criteria

- [ ] 执行 npm test 能发现并运行测试，且测试环境可创建浏览器 IndexedDB 实例。
- [ ] 执行 npm run build 生成生产构建，构建内容不包含测试文件、原始依赖目录或硬编码 API Key。
- [ ] 应用入口在断网条件下可由静态资源启动，不发起认证、服务端数据库或 HTTP API 请求。
- [ ] README 至少说明安装、启动、离线使用和本地存储边界。
