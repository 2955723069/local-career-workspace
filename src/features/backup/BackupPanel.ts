import type { BackupEnvelope, BackupKind } from "../../backup/format";
import type {
  BackupConflictResolution,
  BackupImportSession,
  ImportPlan,
} from "./backupService";

export interface BackupPanelService {
  exportBackup(options: { kind: BackupKind; password: string }): Promise<BackupEnvelope>;
  prepareBackupImport(encryptedInput: unknown, password: string): Promise<BackupImportSession>;
  buildImportPlan(session: BackupImportSession, resolutions: readonly BackupConflictResolution[]): ImportPlan;
  commitBackupImport(plan: ImportPlan): Promise<void>;
}

export interface BackupPanelOptions {
  backupService?: BackupPanelService;
}

const STORE_LABELS: Record<string, string> = {
  resumes: "简历",
  resumeTexts: "简历文本",
  jobDescriptions: "JD",
  jobDescriptionTexts: "JD 文本",
  applications: "职位",
  resumeUsageHistory: "简历使用历史",
  stages: "申请阶段",
  applicationTimelineEvents: "时间线",
  interviews: "面试",
  interviewReviews: "面试复盘",
  reminderFailures: "提醒记录",
  analysisResults: "匹配结果",
  aiConversations: "AI 对话",
  originalFiles: "原始文件",
};

function readFileText(file: File): Promise<string> {
  if (typeof file.text === "function") return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result ?? "")));
    reader.addEventListener("error", () => reject(reader.error ?? new Error("Unable to read backup file")));
    reader.readAsText(file);
  });
}

function triggerBackupDownload(documentRef: Document, envelope: BackupEnvelope): void {
  if (typeof URL.createObjectURL !== "function") return;
  const blob = new Blob([JSON.stringify(envelope)], { type: "application/json" });
  const href = URL.createObjectURL(blob);
  const anchor = documentRef.createElement("a");
  anchor.href = href;
  anchor.download = `career-backup-${envelope.kind}-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.hidden = true;
  documentRef.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(href);
}

function importErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (error instanceof SyntaxError) {
    return "备份文件损坏或不是有效 JSON，未导入任何数据；请重新选择文件。";
  }
  if (/Unable to decrypt/i.test(message)) {
    return "密码错误或备份文件已损坏，未导入任何数据；请检查密码或重新选择文件。";
  }
  if (/Invalid backup|Unsupported backup|mismatch|Invalid record|Duplicate record|Disallowed backup|Sensitive data|Binary data|Invalid original file|Light backup|Full backup/i.test(message)) {
    return "备份文件校验失败或已损坏（密码可能是对的），未导入任何数据；请更换有效备份文件。";
  }
  return "备份无法读取，未导入任何数据；请检查文件后重试。";
}

function recordCount(plan: ImportPlan): number {
  return Object.values(plan.records).reduce((total, rows) => total + (rows?.length ?? 0), 0);
}

export function createBackupPanel(
  documentRef: Document,
  options: BackupPanelOptions = {},
): HTMLElement {
  const host = documentRef.createElement("div");
  host.dataset.component = "backup-panel";
  host.innerHTML = `
    <section class="backup-panel" aria-labelledby="backup-panel-title">
      <div class="section-heading backup-panel__heading">
        <div>
          <p class="section-label">本地数据</p>
          <h2 id="backup-panel-title">加密备份与恢复</h2>
        </div>
      </div>

      <div class="backup-export" aria-labelledby="backup-export-title">
        <h3 id="backup-export-title">导出备份</h3>
        <label for="backup-export-password">备份密码</label>
        <input id="backup-export-password" type="password" autocomplete="new-password" minlength="8" aria-describedby="backup-export-hint" />
        <label for="backup-export-password-confirm">确认备份密码</label>
        <input id="backup-export-password-confirm" type="password" autocomplete="new-password" />
        <p id="backup-export-hint" class="backup-export__hint">请使用至少 8 位密码。密码只用于本次加密、不会被保存，应用也无法找回或重置；一旦遗忘将永久无法解密该备份，请务必自行妥善保管。</p>
        <div class="backup-panel__actions">
          <button type="button" data-backup-export="light">导出轻量备份</button>
          <button type="button" data-backup-export="full">导出完整备份</button>
        </div>
      </div>

      <div class="backup-import" aria-labelledby="backup-import-title">
        <h3 id="backup-import-title">恢复备份</h3>
        <label for="backup-import-file">选择加密备份文件</label>
        <input id="backup-import-file" type="file" accept=".json,application/json" />
        <div class="backup-import__steps"></div>
      </div>

      <p class="backup-panel__status" role="status" aria-live="polite" aria-atomic="true">${options.backupService ? "备份工具已就绪，所有操作均在此浏览器内完成。" : "本地数据库就绪后即可备份和恢复。"}</p>
    </section>
  `;

  const service = options.backupService;
  const status = host.querySelector<HTMLElement>(".backup-panel__status")!;
  const exportPassword = host.querySelector<HTMLInputElement>("#backup-export-password")!;
  const exportPasswordConfirm = host.querySelector<HTMLInputElement>("#backup-export-password-confirm")!;
  const fileInput = host.querySelector<HTMLInputElement>("#backup-import-file")!;
  const steps = host.querySelector<HTMLElement>(".backup-import__steps")!;
  let selectedFile: File | undefined;
  let importPassword: HTMLInputElement | undefined;
  let session: BackupImportSession | undefined;
  let plan: ImportPlan | undefined;

  const setStatus = (message: string) => {
    status.textContent = message;
  };

  const resetImport = (message: string) => {
    selectedFile = undefined;
    session = undefined;
    plan = undefined;
    if (importPassword) importPassword.value = "";
    importPassword = undefined;
    fileInput.value = "";
    steps.replaceChildren();
    setStatus(message);
    fileInput.focus();
  };

  const cancelImport = () => resetImport("已取消恢复，未导入任何数据；可重新选择备份文件。 ");

  const renderPreview = () => {
    if (!session || !service) return;
    const resolutions = [...steps.querySelectorAll<HTMLSelectElement>("[data-conflict-resolution]")].map((select) => ({
      storeName: select.dataset.storeName as BackupConflictResolution["storeName"],
      id: select.dataset.recordId ?? "",
      resolution: select.value as BackupConflictResolution["resolution"],
    }));
    try {
      plan = service.buildImportPlan(session, resolutions);
      const preview = documentRef.createElement("div");
      preview.className = "backup-import__preview";
      preview.dataset.importStep = "preview";
      const selected = recordCount(plan);
      preview.innerHTML = `
        <h4>导入预览</h4>
        <p>将一次性写入 ${selected} 条记录${session.kind === "full" ? `，包含 ${session.originalFileCount} 个原始文件` : "，不包含原始文件"}。</p>
        <p>确认后才会写入；任一写入失败都会整体回滚。</p>
        <div class="backup-panel__actions">
          <button type="button" data-action="confirm-import">最终确认并导入</button>
          <button type="button" data-cancel-at="preview">取消</button>
        </div>
      `;
      steps.querySelector('[data-import-step="preview"]')?.remove();
      steps.append(preview);
      preview.querySelector<HTMLButtonElement>('[data-action="confirm-import"]')?.focus();
      setStatus("导入预览已生成，尚未写入任何数据；请最终确认。 ");
    } catch {
      setStatus("无法生成导入预览，未导入任何数据；请检查冲突选择后重试。");
    }
  };

  const renderConflicts = () => {
    if (!session || steps.querySelector('[data-import-step="conflicts"]')) return;
    const conflicts = documentRef.createElement("fieldset");
    conflicts.className = "backup-import__conflicts";
    conflicts.dataset.importStep = "conflicts";
    const legend = documentRef.createElement("legend");
    legend.textContent = "逐项处理 ID 冲突";
    conflicts.append(legend);
    if (session.conflicts.length === 0) {
      const empty = documentRef.createElement("p");
      empty.textContent = "未检测到相同 ID。";
      conflicts.append(empty);
    }
    for (const [index, conflict] of session.conflicts.entries()) {
      const row = documentRef.createElement("div");
      row.className = "backup-conflict backup-conflict--wrap";
      const id = `backup-conflict-${index}`;
      const label = documentRef.createElement("label");
      label.htmlFor = id;
      label.textContent = `${STORE_LABELS[conflict.storeName] ?? conflict.storeName}：${conflict.id}`;
      label.title = conflict.id;
      const select = documentRef.createElement("select");
      select.id = id;
      select.dataset.conflictResolution = "";
      select.dataset.storeName = conflict.storeName;
      select.dataset.recordId = conflict.id;
      select.innerHTML = `
        <option value="keep-local">保留本地（默认）</option>
        <option value="use-backup">使用备份覆盖</option>
        <option value="import-copy">导入为新副本</option>
      `;
      row.append(label, select);
      conflicts.append(row);
    }
    const actions = documentRef.createElement("div");
    actions.className = "backup-panel__actions";
    actions.innerHTML = `
      <button type="button" data-action="preview-import">生成导入预览</button>
      <button type="button" data-cancel-at="conflicts">取消</button>
    `;
    conflicts.append(actions);
    steps.append(conflicts);
    conflicts.querySelector<HTMLSelectElement>("select")?.focus();
    setStatus(`冲突检查完成，发现 ${session.conflicts.length} 项冲突；默认保留本地数据。`);
  };

  const renderSession = (nextSession: BackupImportSession) => {
    if (importPassword) importPassword.value = "";
    session = nextSession;
    plan = undefined;
    steps.replaceChildren();

    const overview = documentRef.createElement("div");
    overview.className = "backup-import__overview";
    overview.dataset.importStep = "overview";
    overview.tabIndex = -1;
    const populatedStores = Object.entries(nextSession.storeCounts).filter(([, count]) => count > 0);
    overview.innerHTML = `
      <h4>版本与数据概览</h4>
      <dl>
        <div><dt>备份版本</dt><dd>版本 ${nextSession.backupVersion}</dd></div>
        <div><dt>备份类型</dt><dd>${nextSession.backupKind === "full" ? "完整备份" : "轻量备份"}</dd></div>
        <div><dt>原始文件</dt><dd>${nextSession.originalFileCount} 个</dd></div>
      </dl>
      <ul class="backup-import__counts"></ul>
      <div class="backup-panel__actions">
        <button type="button" data-action="review-conflicts">继续处理冲突</button>
        <button type="button" data-cancel-at="overview">取消</button>
      </div>
    `;
    const counts = overview.querySelector<HTMLUListElement>(".backup-import__counts")!;
    for (const [storeName, count] of populatedStores) {
      const item = documentRef.createElement("li");
      item.textContent = `${count} 条${STORE_LABELS[storeName] ?? storeName}`;
      counts.append(item);
    }
    steps.append(overview);
    setStatus("备份已解密并通过校验；请查看版本和数据概览，再继续处理冲突。 ");
    overview.focus();
  };

  const prepareSelectedFile = async () => {
    if (!selectedFile || !importPassword || !service) return;
    if (!importPassword.value) {
      setStatus("请输入备份密码后再查看数据概览。 ");
      importPassword.focus();
      return;
    }
    try {
      const encryptedInput: unknown = JSON.parse(await readFileText(selectedFile));
      const nextSession = await service.prepareBackupImport(encryptedInput, importPassword.value);
      renderSession(nextSession);
    } catch (error) {
      setStatus(importErrorMessage(error));
      importPassword.focus();
    }
  };

  const MIN_EXPORT_PASSWORD_LENGTH = 8;
  for (const button of host.querySelectorAll<HTMLButtonElement>("[data-backup-export]")) {
    button.disabled = !service;
    button.addEventListener("click", async () => {
      const password = exportPassword.value;
      if (!service) return;
      if (!password) {
        setStatus("请输入备份密码后再导出。 ");
        exportPassword.focus();
        return;
      }
      if (password.length < MIN_EXPORT_PASSWORD_LENGTH) {
        setStatus(`备份密码至少需要 ${MIN_EXPORT_PASSWORD_LENGTH} 位；密码无法找回，请设置足够强度的密码。`);
        exportPassword.focus();
        return;
      }
      if (password !== exportPasswordConfirm.value) {
        setStatus("两次输入的备份密码不一致；密码一旦遗忘将无法解密备份，请重新确认。");
        exportPasswordConfirm.focus();
        return;
      }
      const kind = button.dataset.backupExport as BackupKind;
      try {
        const envelope = await service.exportBackup({ kind, password });
        triggerBackupDownload(documentRef, envelope);
        setStatus(`${kind === "full" ? "完整" : "轻量"}备份已加密并下载；密码未保存，也无法找回，请妥善保管。`);
      } catch {
        setStatus("备份导出失败，本地数据未改变；可重试。");
      }
    });
  }

  exportPassword.disabled = !service;
  exportPasswordConfirm.disabled = !service;
  fileInput.disabled = !service;
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    session = undefined;
    plan = undefined;
    if (importPassword) importPassword.value = "";
    steps.replaceChildren();
    if (!file) {
      selectedFile = undefined;
      setStatus("未选择备份文件，本地数据未改变。 ");
      return;
    }
    selectedFile = file;
    const form = documentRef.createElement("form");
    form.className = "backup-import__password";
    form.dataset.importStep = "password";
    form.innerHTML = `
      <p class="backup-selected-file" title="${file.name.replace(/&/g, "&amp;").replace(/\"/g, "&quot;")}">已选择：${file.name.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>
      <label for="backup-import-password">备份密码</label>
      <input id="backup-import-password" type="password" autocomplete="current-password" />
      <div class="backup-panel__actions">
        <button type="submit">解密并查看概览</button>
        <button type="button" data-cancel-at="password">取消</button>
      </div>
    `;
    steps.append(form);
    importPassword = form.querySelector<HTMLInputElement>("#backup-import-password")!;
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      void prepareSelectedFile();
    });
    setStatus("备份文件已选择；请输入密码以解密并查看版本和数据概览。 ");
    importPassword.focus();
  });

  steps.addEventListener("click", async (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button");
    if (!button) return;
    if (button.dataset.cancelAt) {
      cancelImport();
      return;
    }
    if (button.dataset.action === "review-conflicts") {
      renderConflicts();
      return;
    }
    if (button.dataset.action === "preview-import") {
      renderPreview();
      return;
    }
    if (button.dataset.action !== "confirm-import" || !plan || !service) return;
    button.disabled = true;
    setStatus("正在一次性提交导入，请稍候。 ");
    try {
      await service.commitBackupImport(plan);
      if (importPassword) importPassword.value = "";
      selectedFile = undefined;
      session = undefined;
      plan = undefined;
      importPassword = undefined;
      fileInput.value = "";
      steps.replaceChildren();
      setStatus("导入完成，数据已保存到此浏览器；刷新后仍可读取。 ");
      host.dispatchEvent(new CustomEvent("backup-imported", { bubbles: true }));
    } catch {
      button.disabled = false;
      setStatus("导入失败，事务已回滚；本地资料和已保存对话未改变，可重试或取消。 ");
    }
  });

  return host;
}
