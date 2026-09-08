# 第 4d 期 · 恢复冲突批量策略 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在备份恢复的"逐项处理 ID 冲突"之上，增加"全部保留本地 / 全部使用备份 / 全部导入副本"一键批量按钮：点击即把所有逐项下拉设为该选择，逐项仍可继续微调；默认仍不覆盖本地（`keep-local`）。

**Architecture:** 纯前端 UI 增强，全部落在 `BackupPanel.ts` 的冲突渲染区。批量按钮只是"一次性设置所有既有 `[data-conflict-resolution]` 下拉的 value"，随后走完全相同的既有链路（`renderPreview` 收集各下拉 value → `buildImportPlan` → `commitBackupImport`）。**不改**备份格式、加密、`importTransaction`、`backupService`、冲突数据模型（`ImportResolution`/`BackupConflict`/`BackupConflictResolution`）。

**Tech Stack:** TypeScript、Vite、Vitest（jsdom，`createApp`/`createBackupPanel` + mocked `BackupPanelService`）、原生 DOM、`tokens.css` 设计令牌、Playwright e2e。

**Spec:** `docs/superpowers/specs/2026-09-04-job-search-app-restructure-design.md`（§7 第 4 项「恢复冲突批量策略」；§8 第 4 期 4d）

## Global Constraints

- **不动底层与备份契约**：不修改 `src/backup/*`（含 `importTransaction.ts`、`crypto.ts`、`format.ts`）、`src/features/backup/backupService.ts` 与 `BackupPanelService` 接口、`ImportResolution`/`BackupConflict`/`BackupConflictResolution` 类型。仅改 `BackupPanel.ts`（UI）、`backup.css`、测试。
- **批量=设置既有下拉**：批量按钮只设置各 `[data-conflict-resolution]` 的 `value`，不新建/绕过 resolution 数据流；预览/导入仍从这些下拉读取（`renderPreview` 现逻辑不变）。
- **逐项仍可微调**：批量设置后，用户仍能改任一逐项下拉；最终计划以各下拉当前 value 为准。
- **默认不覆盖本地**：初始每项仍默认 `keep-local`（PRD 约束）；批量按钮为显式操作，不改默认。
- **仅有冲突时显示批量条**：`session.conflicts.length === 0` 时不渲染批量按钮（与"未检测到相同 ID"一致）。
- 组件为工厂函数、无 class；安全中文文案，不回显 `error.message`；仅用既有 `tokens.css` 变量。
- **命令**：单文件 `npx vitest run <path>`；全量 `npm test`；类型 `npx tsc --noEmit`；构建 `npm run build`；e2e `npm run test:e2e`（现基线 18/18）。
- **提交**：git 可用；identity 缺失用 `git -c user.name='qh' -c user.email='qh@local' commit ...`。

---

## 文件结构

**改写：**
- `src/features/backup/BackupPanel.ts` — `renderConflicts()` 在有冲突时于逐项列表前插入批量按钮组；`steps` 的 click 委托新增 `data-batch-resolution` 分支（设置所有逐项下拉 value + 状态提示）。
- `src/styles/backup.css` — 批量按钮组最小样式（复用既有 `.backup-panel__actions` 风格与令牌）。

**测试：**
- `tests/backup/backup-ui.test.ts` — 追加批量策略用例（批量设全部、逐项仍可覆盖、预览用混合结果）。

---

## Task 1: 批量策略按钮 + 一键设置全部逐项下拉

**Files:**
- Modify: `src/features/backup/BackupPanel.ts`
- Test: `tests/backup/backup-ui.test.ts`

**Interfaces:**
- Consumes: 既有 `session.conflicts`、逐项 `<select data-conflict-resolution data-store-name data-record-id>`（值域 `keep-local|use-backup|import-copy`）、既有 `steps` click 委托、`setStatus`、`renderPreview`（读取各下拉 value 的逻辑不变）。
- Produces: 批量按钮 `<button data-batch-resolution="keep-local|use-backup|import-copy">`（仅在有冲突时渲染，位于逐项列表前）；`steps` click 委托新增 `data-batch-resolution` 分支。

- [ ] **Step 1: 写失败测试**

在 `tests/backup/backup-ui.test.ts` 追加。复用文件既有 helper：`importSession(conflicts)`、`service(overrides)`、`setFile`、`submit`、`tick`（若 `setFile`/`submit`/`tick` 名称不同，按文件现有等价工具调用——参考既有"requires file, password, overview…"用例的驱动方式）。构造两条冲突：

```typescript
  it("applies a batch resolution to every conflict while keeping per-item overrides", async () => {
    const session = importSession([
      { storeName: "resumes", id: "resume-1", defaultResolution: "keep-local" },
      { storeName: "applications", id: "app-1", defaultResolution: "keep-local" },
    ]);
    const backupService = service({ prepareBackupImport: vi.fn(async () => session) });
    vi.stubGlobal("fetch", vi.fn());
    document.body.innerHTML = '<div id="app"></div>';
    const root = createApp(document, { backupService });

    setFile(root.querySelector<HTMLInputElement>("#backup-import-file")!);
    const importPassword = root.querySelector<HTMLInputElement>("#backup-import-password")!;
    importPassword.value = "restore-only";
    submit(root.querySelector<HTMLFormElement>('[data-import-step="password"]')!);
    await tick();
    root.querySelector<HTMLButtonElement>('[data-action="review-conflicts"]')!.click();

    const selects = () => [...root.querySelectorAll<HTMLSelectElement>("[data-conflict-resolution]")];
    expect(selects()).toHaveLength(2);
    expect(selects().every((select) => select.value === "keep-local")).toBe(true);

    // 批量：全部使用备份
    root.querySelector<HTMLButtonElement>('[data-batch-resolution="use-backup"]')!.click();
    expect(selects().every((select) => select.value === "use-backup")).toBe(true);

    // 逐项微调：把第二项改回导入副本
    selects()[1].value = "import-copy";

    root.querySelector<HTMLButtonElement>('[data-action="preview-import"]')!.click();
    expect(backupService.buildImportPlan).toHaveBeenCalledWith(session, [
      { storeName: "resumes", id: "resume-1", resolution: "use-backup" },
      { storeName: "applications", id: "app-1", resolution: "import-copy" },
    ]);
  });

  it("does not render batch buttons when there are no conflicts", async () => {
    const backupService = service({ prepareBackupImport: vi.fn(async () => importSession()) });
    vi.stubGlobal("fetch", vi.fn());
    document.body.innerHTML = '<div id="app"></div>';
    const root = createApp(document, { backupService });
    setFile(root.querySelector<HTMLInputElement>("#backup-import-file")!);
    const importPassword = root.querySelector<HTMLInputElement>("#backup-import-password")!;
    importPassword.value = "restore-only";
    submit(root.querySelector<HTMLFormElement>('[data-import-step="password"]')!);
    await tick();
    root.querySelector<HTMLButtonElement>('[data-action="review-conflicts"]')!.click();
    expect(root.querySelector("[data-batch-resolution]")).toBeNull();
  });
```

（注：`buildImportPlan` 断言里 resolutions 的顺序 = `session.conflicts` 的渲染顺序，与 `renderPreview` 遍历 DOM 下拉的顺序一致。若既有 `setFile`/`submit`/`tick` helper 命名不同，用文件顶部已定义的等价函数；勿新增重复 helper。）

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/backup/backup-ui.test.ts`
Expected: 新用例 FAIL（`[data-batch-resolution]` 不存在）；既有用例仍 PASS。

- [ ] **Step 3: renderConflicts 插入批量按钮组（仅有冲突时）**

`src/features/backup/BackupPanel.ts` 的 `renderConflicts()`：在 `if (session.conflicts.length === 0) {...}` 之后、逐项 `for (const [index, conflict] of ...)` 循环之前，插入批量按钮组：

```typescript
    if (session.conflicts.length > 0) {
      const batch = documentRef.createElement("div");
      batch.className = "backup-conflict-batch";
      batch.setAttribute("role", "group");
      batch.setAttribute("aria-label", "批量处理全部冲突");
      batch.innerHTML = `
        <span class="backup-conflict-batch__label">批量处理全部冲突：</span>
        <button type="button" data-batch-resolution="keep-local">全部保留本地</button>
        <button type="button" data-batch-resolution="use-backup">全部使用备份</button>
        <button type="button" data-batch-resolution="import-copy">全部导入副本</button>
      `;
      conflicts.append(batch);
    }
```

（`conflicts` 为该函数内已创建的 `<fieldset>`；批量组加在 legend/空提示之后、逐项行之前。）

- [ ] **Step 4: steps click 委托新增 batch 分支**

在 `steps.addEventListener("click", ...)` 里，`cancel-at` 分支之后、`review-conflicts` 之前（或任意早于 `confirm-import` 的位置）新增：

```typescript
    if (button.dataset.batchResolution) {
      const resolution = button.dataset.batchResolution;
      const targets = steps.querySelectorAll<HTMLSelectElement>("[data-conflict-resolution]");
      for (const select of targets) select.value = resolution;
      setStatus(`已将全部 ${targets.length} 项冲突设为「${resolution === "keep-local" ? "保留本地" : resolution === "use-backup" ? "使用备份覆盖" : "导入为新副本"}」；仍可逐项调整后再生成预览。`);
      return;
    }
```

（`button` 已由现有 `closest("button")` 取得。批量只改下拉 value，不触发预览——用户随后点"生成导入预览"走既有链路。）

- [ ] **Step 5: 运行确认通过（新用例 + 既有回归）**

Run: `npx vitest run tests/backup/backup-ui.test.ts`
Expected: 全 PASS——含新 2 条与既有全部用例（既有"逐项冲突"流程不受影响：批量组是新增节点，逐项 `[data-conflict-resolution]` 选择器与 `renderPreview` 收集逻辑不变）。

- [ ] **Step 6: 类型检查 + 全量**

Run: `npx tsc --noEmit && npm test`
Expected: 0 类型错误、全量全绿。

- [ ] **Step 7: 提交**

```bash
git add src/features/backup/BackupPanel.ts tests/backup/backup-ui.test.ts
git commit -m "feat(backup): batch resolution buttons for restore conflicts (keep-local/use-backup/import-copy)"
```

---

## Task 2: 批量按钮样式 + 整期回归

**Files:**
- Modify: `src/styles/backup.css`
- Test: 全量 + e2e

**Interfaces:** 无新导出；仅样式与回归。

- [ ] **Step 1: 批量按钮组样式**

`src/styles/backup.css` 追加（仅用既有令牌，风格对齐既有 `.backup-panel__actions`）：

```css
.backup-conflict-batch {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: var(--r-md);
}
.backup-conflict-batch__label {
  font-size: var(--fs-xs);
  color: var(--text-2);
  font-weight: var(--fw-medium);
}
```

（批量按钮本身沿用面板既有 `button` 样式，无需额外规则；如需与逐项分隔，靠 `margin-bottom` 即可。令牌 `--r-md`/`--fs-xs`/`--text-2`/`--fw-medium` 均已存在于 `tokens.css`。）

- [ ] **Step 2: 全量 + 类型 + 构建 + e2e**

Run: `npm test && npx tsc --noEmit && npm run build && npm run test:e2e`
Expected: 单测全绿、0 错误、构建 `✓ built`、e2e 保持 18/18。

**关于 e2e 覆盖（重要说明，非占位符）：** 批量按钮位于"密码解密 → 概览 → 冲突"深层流程，且只在**存在同 ID 冲突**时出现——e2e 要触达它需先导出真实加密备份、再以冲突数据重导入并输密码，成本高且脆弱。因此本期**不新增**针对批量按钮的 e2e；批量逻辑已由 Task 1 的组件单测（mocked `BackupPanelService` + 双冲突会话）充分覆盖。本步仅跑**全量 e2e 作回归**，确保新增节点不破坏既有备份/恢复 e2e。执行者若发现可低成本复用既有 e2e 备份流程触达冲突，可酌情加一条；否则以回归为准并在报告中记录该判断。

- [ ] **Step 3: 提交**

```bash
git add -A
git commit -m "style(backup): batch conflict-resolution button row"
```

---

## Self-Review

**1. Spec 覆盖（§7 第 4 项 / §8 第 4 期 4d）：**
- 「在逐项选择之上增加"全部保留本地/全部使用备份/全部导入副本"一键批量」→ Task 1 三个 `data-batch-resolution` 按钮 ✅。
- 「逐项仍可微调覆盖」→ 批量只设 value，逐项下拉可再改；`renderPreview` 以各下拉当前 value 为准（Task 1 用例一验证混合结果）✅。
- 「默认不覆盖本地」→ 初始每项仍 `keep-local`，批量为显式操作不改默认 ✅。

**2. 占位符扫描：** 无 TODO/TBD；每步给出精确代码；e2e 覆盖说明是明确的范围判断（非占位符）。

**3. 类型一致性：**
- 批量按钮 value ∈ `keep-local|use-backup|import-copy`，与逐项下拉、`ImportResolution`、`renderPreview` 收集的 `resolution` 完全一致 ✅。
- 不新增/改动 `BackupConflictResolution`/`ImportResolution` 类型；`buildImportPlan` 签名不变 ✅。
- 批量只写既有 `[data-conflict-resolution]` 的 `value`，数据流与提交契约不变 ✅。

**4. 风险点：**
- **不改数据流**：批量按钮不绕过逐项下拉，预览/导入仍从下拉读取——最小面、零服务层改动。reviewer 重点核对没有新增第二条 resolution 收集路径。
- **仅有冲突时渲染**：`session.conflicts.length > 0` 守卫，无冲突不显示（用例二覆盖）✅。
- **既有冲突流程回归**：批量组为新增兄弟节点，逐项选择器/`renderPreview`/`buildImportPlan` 调用不变；既有"requires file, password, overview, per-conflict…"用例应仍通过 ✅。
- **默认与安全**：默认仍 `keep-local`（不覆盖本地）；文案不回显 error.message ✅。
