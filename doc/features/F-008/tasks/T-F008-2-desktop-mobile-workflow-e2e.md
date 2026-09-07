---
id: "T-F008-2"
feature_id: "F-008"
slug: "desktop-mobile-workflow-e2e"
title: "补齐桌面与移动端离线主流程端到端测试"
status: "done"
depends_on: ["T-F008-1"]
test_command: "npm run test:e2e"
acceptance_criteria: ["desktop 与 mobile Playwright 项目均执行上传简历、确认文本、创建职位、绑定简历、本地匹配、面试、复盘、备份导出和恢复的主流程。","移动端测试验证阶段看板可横向访问、主要操作区可使用且文本和控件未发生可见重叠或横向页面溢出。","端到端测试验证本地匹配期间未发出网络请求，并在离线路由失败条件下仍完成简历、职位、面试和本地匹配核心步骤。","测试通过角色、label 和键盘交互覆盖至少一个主要表单路径，并断言保存、错误或权限降级状态可见。","备份恢复测试经过文件选择、密码、概览、冲突处理、预览和最终确认，且恢复后数据可在当前浏览器 IndexedDB 中读取。"]
files_hint: ["playwright.config.ts","scripts/run-e2e.sh","tests/e2e/applications.spec.ts","tests/e2e/interviews-reviews-dashboard.spec.ts","tests/e2e/ai-career-advisor.spec.ts","tests/e2e/responsive-accessibility-workflow.spec.ts","tests/e2e/fixtures/"]
---

# T-F008-2 — 补齐桌面与移动端离线主流程端到端测试

在现有 Playwright 配置的 desktop 和 mobile 项目下新增或扩展端到端测试，覆盖真实 UI 主路径：上传受支持简历并确认文本、创建含确认 JD 的职位、绑定当前简历、运行本地匹配、创建/改期面试、保存复盘、导出加密备份并经文件选择和密码恢复。使用本地 IndexedDB 种子、页面上传文件和 Playwright 路由断言来控制测试数据；本地匹配和离线核心流程不得产生网络请求。测试应在两个视口断言阶段横向切换、移动底部操作区、可见焦点/状态提示和关键元素无布局溢出或重叠。

## Acceptance criteria

- [ ] desktop 与 mobile Playwright 项目均执行上传简历、确认文本、创建职位、绑定简历、本地匹配、面试、复盘、备份导出和恢复的主流程。
- [ ] 移动端测试验证阶段看板可横向访问、主要操作区可使用且文本和控件未发生可见重叠或横向页面溢出。
- [ ] 端到端测试验证本地匹配期间未发出网络请求，并在离线路由失败条件下仍完成简历、职位、面试和本地匹配核心步骤。
- [ ] 测试通过角色、label 和键盘交互覆盖至少一个主要表单路径，并断言保存、错误或权限降级状态可见。
- [ ] 备份恢复测试经过文件选择、密码、概览、冲突处理、预览和最终确认，且恢复后数据可在当前浏览器 IndexedDB 中读取。
