---
id: "T-F007-3"
feature_id: "F-007"
slug: "integrate-backup-restore-ui"
title: "接入备份恢复界面与可感知状态"
status: "done"
depends_on: ["T-F007-2"]
test_command: "npm test -- tests/backup/backup-ui.test.ts"
acceptance_criteria: ["用户必须依次完成文件选择、密码输入、版本/数据概览查看、冲突逐项选择、导入预览和最终确认；取消任一步骤都不调用 commitBackupImport，且本地数据保持不变。","轻量和完整导出分别调用对应备份类型并触发下载；密码输入不会写入 localStorage、IndexedDB、业务记录或备份文件。","错误密码、损坏文件、格式校验失败、冲突取消和提交异常均显示明确的 role=status 或 aria-live 恢复提示，已有资料和已保存对话仍可继续使用。","备份面板通过 createApp 选项和 main.ts 的真实 IndexedDB 实例接入，刷新后可看到成功导入的数据；测试使用 fetch spy 断言备份流程不发出网络请求。","README.md 明确说明备份类型、密码恢复限制、导入冲突默认策略、原子回滚、离线可用和清除数据注意事项；组件测试覆盖语义标签、键盘可操作控件及窄屏长文本换行/截断。"]
files_hint: ["src/features/backup/BackupPanel.ts","src/features/backup/backupService.ts","src/app/createApp.ts","src/main.ts","src/styles.css","README.md","tests/backup/backup-ui.test.ts"]
---

# T-F007-3 — 接入备份恢复界面与可感知状态

新增 src/features/backup/BackupPanel.ts（或同目录等价组件），并修改 src/app/createApp.ts、src/main.ts 和 README.md，将 BackupService 接入现有应用。界面必须提供轻量/完整导出按钮、密码输入、备份文件选择、解密后的版本与数据概览、逐项冲突选择、导入预览、明确提交和取消操作；在用户确认前不得调用提交或产生外发请求。所有成功、取消、错误密码、格式错误、冲突取消、写入失败和完成状态都通过 role=status/aria-live 等可感知提示呈现，密码只保存在当前交互内。补充组件测试验证流程顺序、取消无写入、错误可恢复、导出类型选择和移动窄屏下控件不遮挡，并更新 README 的备份、恢复、离线使用和清除数据说明。

## Acceptance criteria

- [ ] 用户必须依次完成文件选择、密码输入、版本/数据概览查看、冲突逐项选择、导入预览和最终确认；取消任一步骤都不调用 commitBackupImport，且本地数据保持不变。
- [ ] 轻量和完整导出分别调用对应备份类型并触发下载；密码输入不会写入 localStorage、IndexedDB、业务记录或备份文件。
- [ ] 错误密码、损坏文件、格式校验失败、冲突取消和提交异常均显示明确的 role=status 或 aria-live 恢复提示，已有资料和已保存对话仍可继续使用。
- [ ] 备份面板通过 createApp 选项和 main.ts 的真实 IndexedDB 实例接入，刷新后可看到成功导入的数据；测试使用 fetch spy 断言备份流程不发出网络请求。
- [ ] README.md 明确说明备份类型、密码恢复限制、导入冲突默认策略、原子回滚、离线可用和清除数据注意事项；组件测试覆盖语义标签、键盘可操作控件及窄屏长文本换行/截断。
