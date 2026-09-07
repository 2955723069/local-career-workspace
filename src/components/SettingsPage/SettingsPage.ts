import { getPreferences, savePreferences, getDefaultReminders, getDefaultTimezone } from "../../settings/preferences";
import { clearAllData, previewDataClear, CLEAR_CONFIRMATION_WORD } from "../../storage/dataManagement";
import { getAiSettings, saveAiSettings, clearAiSettings, validateAiSettings } from "../../settings/secrets";
import { createOpenAiClient } from "../../ai/client";
import { AiAdvisorService } from "../../features/ai/aiAdvisorService";
import { createBackupPanel, type BackupPanelService } from "../../features/backup/BackupPanel";
import type { AppBus } from "../../app/appBus";

export interface SettingsPageOptions {
  database?: IDBDatabase;
  backupService?: BackupPanelService;
  bus?: AppBus;
  onAiSettingsChanged?: (service: AiAdvisorService | undefined) => void;
  signal?: AbortSignal;
}

export function createSettingsPage(
  documentRef: Document,
  options: SettingsPageOptions = {},
): HTMLElement {
  const root = documentRef.createElement("div");
  root.className = "settings-page";
  root.innerHTML = `
    <section class="settings-panel" aria-labelledby="backup-page-title">
      <div class="section-heading"><div><p class="section-label">偏好与隐私</p><h2 id="backup-page-title">设置</h2></div></div>
      <form class="settings-preferences" data-form="settings-preferences">
        <label for="settings-default-timezone">默认时区<input id="settings-default-timezone" name="defaultTimezone" required /></label>
        <fieldset><legend>默认提醒</legend><label><input type="checkbox" name="reminderInApp" />应用内</label><label><input type="checkbox" name="reminderBrowser" />浏览器通知</label><label>提前分钟数<input name="reminderOffset" type="number" min="1" value="30" /></label></fieldset>
        <div class="settings-actions"><button type="submit">保存偏好</button><button type="button" data-action="request-notifications" data-variant="secondary">启用浏览器通知</button></div>
      </form>
      <p class="settings-status" role="status" aria-live="polite"></p>
    </section>
    <section class="settings-panel ai-settings-panel" aria-labelledby="ai-settings-title">
      <div class="section-heading"><div><p class="section-label">可选服务</p><h2 id="ai-settings-title">AI 接口</h2></div></div>
      <form class="ai-settings-form" data-form="ai-settings">
        <label for="ai-api-url">API 地址<input id="ai-api-url" name="apiUrl" type="url" placeholder="https://api.openai.com/v1" required /></label>
        <label for="ai-model">模型名<input id="ai-model" name="model" required /></label>
        <label for="ai-api-key">API Key<input id="ai-api-key" name="apiKey" type="password" autocomplete="new-password" placeholder="保存后仅显示已配置" required /></label>
        <label for="ai-organization-id">组织 ID<input id="ai-organization-id" name="organizationId" /></label>
        <label for="ai-custom-headers">自定义请求头<textarea id="ai-custom-headers" name="customHeaders" rows="3" placeholder="X-Header: value"></textarea></label>
        <div class="settings-actions"><button type="button" data-action="test-ai-settings" data-variant="secondary">测试连接</button><button type="submit">保存 AI 设置</button><button type="button" data-action="clear-ai-settings" class="danger-action">清除 AI 设置</button></div>
      </form>
      <p class="ai-settings-status" role="status" aria-live="polite">尚未配置 AI</p>
    </section>
    <section class="data-management-panel" aria-labelledby="data-management-title">
      <div class="section-heading"><div><p class="section-label">本地存储</p><h2 id="data-management-title">数据管理</h2></div></div>
      <p class="data-preview-summary">点击查看当前浏览器中的本地记录数量。</p>
      <div class="settings-actions"><button type="button" data-action="refresh-data-preview" data-variant="secondary">查看数据统计</button><button type="button" data-action="open-clear-data" class="danger-action">清除全部数据</button></div>
      <div class="data-clear-dialog" role="dialog" aria-modal="true" aria-labelledby="clear-data-title" hidden><h3 id="clear-data-title">确认清除本地数据</h3><p class="data-clear-summary"></p><label for="clear-data-confirmation">输入 DELETE 确认<input id="clear-data-confirmation" autocomplete="off" /></label><div class="settings-actions"><button type="button" data-action="confirm-clear-data" class="danger-action">确认清除</button><button type="button" data-action="cancel-clear-data" data-variant="secondary">取消</button></div></div>
    </section>
    <div class="backup-panel-mount"></div>
  `;

  setupSettingsPanel(root, documentRef, options);

  const backupMount = root.querySelector<HTMLElement>(".backup-panel-mount");
  if (backupMount) {
    backupMount.replaceWith(createBackupPanel(documentRef, { backupService: options.backupService }));
  }

  return root;
}

function setupSettingsPanel(root: HTMLElement, documentRef: Document, options: SettingsPageOptions): void {
  const database = options.database;
  const onAiSettingsChanged = options.onAiSettingsChanged;
  const settingsRoot = root.querySelector<HTMLElement>(".settings-panel") ?? root;
  const form = settingsRoot.querySelector<HTMLFormElement>('[data-form="settings-preferences"]');
  const timezone = settingsRoot.querySelector<HTMLInputElement>("#settings-default-timezone");
  const reminderInApp = settingsRoot.querySelector<HTMLInputElement>('input[name="reminderInApp"]');
  const reminderBrowser = settingsRoot.querySelector<HTMLInputElement>('input[name="reminderBrowser"]');
  const reminderOffset = settingsRoot.querySelector<HTMLInputElement>('input[name="reminderOffset"]');
  const status = settingsRoot.querySelector<HTMLElement>(".settings-status");
  const preview = root.querySelector<HTMLElement>(".data-preview-summary");
  const clearDialog = root.querySelector<HTMLElement>(".data-clear-dialog");
  const clearSummary = root.querySelector<HTMLElement>(".data-clear-summary");
  const clearConfirmation = root.querySelector<HTMLInputElement>("#clear-data-confirmation");
  const notificationButton = settingsRoot.querySelector<HTMLButtonElement>('[data-action="request-notifications"]');
  const refreshButton = root.querySelector<HTMLButtonElement>('[data-action="refresh-data-preview"]');
  const clearButton = root.querySelector<HTMLButtonElement>('[data-action="open-clear-data"]');

  if (!form || !timezone || !status || !preview || !clearDialog || !clearSummary || !clearConfirmation) return;

  const preferences = getPreferences();
  timezone.value = preferences.defaultTimezone || getDefaultTimezone();
  const reminders = preferences.defaultReminders.length ? preferences.defaultReminders : getDefaultReminders();
  if (reminderInApp) reminderInApp.checked = reminders.some((item) => item.channel === "in-app");
  if (reminderBrowser) reminderBrowser.checked = reminders.some((item) => item.channel === "browser");
  if (reminderOffset && reminders[0]) reminderOffset.value = String(reminders[0].offsetMinutes);
  status.textContent = notificationStatus();

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    try {
      const offset = Number(reminderOffset?.value ?? 30);
      if (!Number.isFinite(offset) || offset <= 0) throw new Error("invalid reminder offset");
      const defaultReminders = [
        ...(reminderInApp?.checked ? [{ offsetMinutes: offset, channel: "in-app" as const }] : []),
        ...(reminderBrowser?.checked ? [{ offsetMinutes: offset, channel: "browser" as const }] : []),
      ];
      savePreferences({ defaultTimezone: timezone.value.trim(), defaultReminders });
      status.textContent = "默认时区和提醒设置已保存到此浏览器。";
    } catch {
      status.textContent = "时区无效，请使用 IANA 格式，例如 Asia/Shanghai。";
      timezone.focus();
    }
  }, { signal: options.signal });

  notificationButton?.addEventListener("click", async () => {
    if (typeof Notification === "undefined") {
      status.textContent = notificationStatus();
      return;
    }
    try {
      await Notification.requestPermission();
      status.textContent = notificationStatus();
    } catch {
      status.textContent = "通知授权失败；应用内提醒和 ICS 导出仍可用。";
    }
  }, { signal: options.signal });

  const updatePreview = async (): Promise<void> => {
    if (!database) {
      preview.textContent = "本地数据库连接后可显示记录数量。";
      return;
    }
    try {
      const result = await previewDataClear(database);
      preview.textContent = `当前有 ${result.totalRecords} 条业务记录、${result.textRecords} 条文本记录和 ${result.blobs} 个原始文件。`;
      clearSummary.textContent = `将永久删除 ${result.totalRecords} 条业务记录、${result.textRecords} 条文本记录和 ${result.blobs} 个原始文件，以及本地 AI 设置和界面偏好。此操作不能撤销。`;
    } catch {
      preview.textContent = "无法读取本地数据统计，可刷新页面后重试。";
    }
  };

  refreshButton?.addEventListener("click", () => void updatePreview(), { signal: options.signal });
  clearButton?.addEventListener("click", async () => {
    await updatePreview();
    clearDialog.hidden = false;
    clearConfirmation.value = "";
    clearConfirmation.focus();
  }, { signal: options.signal });
  clearDialog.addEventListener("click", async (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-action]");
    if (!button) return;
    if (button.dataset.action === "cancel-clear-data") {
      clearDialog.hidden = true;
      status.textContent = "已取消清除，本地数据未改变。";
      clearButton?.focus();
      return;
    }
    if (button.dataset.action !== "confirm-clear-data") return;
    if (!database) {
      status.textContent = "本地数据库尚未连接，无法清除数据。";
      return;
    }
    if (clearConfirmation.value !== CLEAR_CONFIRMATION_WORD) {
      status.textContent = `请输入 ${CLEAR_CONFIRMATION_WORD} 后再确认。`;
      clearConfirmation.focus();
      return;
    }
    button.disabled = true;
    const result = await clearAllData(database, { confirmationWord: clearConfirmation.value });
    button.disabled = false;
    if (!result.cleared) {
      status.textContent = "清除失败，本地数据未改变；可刷新页面后重试。";
      return;
    }
    clearDialog.hidden = true;
    preview.textContent = "本地数据已清除。";
    status.textContent = "全部本地数据和设置已清除。";
    documentRef.defaultView?.dispatchEvent(new Event("app-data-cleared"));
    options.bus?.emit("app-data-changed", undefined);
  }, { signal: options.signal });

  const aiForm = root.querySelector<HTMLFormElement>('[data-form="ai-settings"]');
  const aiStatus = root.querySelector<HTMLElement>(".ai-settings-status");
  const aiUrl = root.querySelector<HTMLInputElement>('input[name="apiUrl"]');
  const aiModel = root.querySelector<HTMLInputElement>('input[name="model"]');
  const aiKey = root.querySelector<HTMLInputElement>('input[name="apiKey"]');
  const aiOrg = root.querySelector<HTMLInputElement>('input[name="organizationId"]');
  const aiHeaders = root.querySelector<HTMLTextAreaElement>('textarea[name="customHeaders"]');
  const testAi = root.querySelector<HTMLButtonElement>('[data-action="test-ai-settings"]');
  const clearAi = root.querySelector<HTMLButtonElement>('[data-action="clear-ai-settings"]');
  const readAiForm = () => ({
    apiUrl: aiUrl?.value.trim() ?? "",
    model: aiModel?.value.trim() ?? "",
    apiKey: aiKey?.value.trim() ?? "",
    organizationId: aiOrg?.value.trim() ?? "",
    customHeaders: Object.fromEntries((aiHeaders?.value ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
      const separator = line.indexOf(":");
      return separator > 0 ? [line.slice(0, separator).trim(), line.slice(separator + 1).trim()] : ["", ""];
    }).filter(([name, value]) => name && value)),
  });
  const loadAi = async () => {
    if (!database || !aiForm) return;
    try {
      const settings = await getAiSettings(database);
      if (!settings) return;
      if (aiUrl) aiUrl.value = settings.apiUrl;
      if (aiModel) aiModel.value = settings.model;
      if (aiOrg) aiOrg.value = settings.organizationId;
      if (aiHeaders) aiHeaders.value = Object.entries(settings.customHeaders).map(([name, value]) => `${name}: ${value}`).join("\n");
      if (aiKey) { aiKey.required = false; aiKey.placeholder = "已配置，留空则保持原 Key"; }
      if (aiStatus) aiStatus.textContent = "AI 已配置，可测试连接。";
    } catch { if (aiStatus) aiStatus.textContent = "AI 设置读取失败。"; }
  };
  void loadAi();
  testAi?.addEventListener("click", async () => {
    if (!aiStatus) return;
    try { const settings = readAiForm(); validateAiSettings(settings); aiStatus.textContent = "正在测试连接..."; await createOpenAiClient(settings).testConnection(); aiStatus.textContent = "连接成功。"; }
    catch { aiStatus.textContent = "连接失败，请检查地址、模型和密钥。"; }
  }, { signal: options.signal });
  aiForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!database || !aiStatus) { if (aiStatus) aiStatus.textContent = "数据库尚未连接，无法保存 AI 设置。"; return; }
    try {
      const current = await getAiSettings(database);
      const next = readAiForm();
      if (!next.apiKey && current) next.apiKey = current.apiKey;
      validateAiSettings(next);
      await saveAiSettings(database, next);
      const service = new AiAdvisorService(database, { settings: next, client: createOpenAiClient(next) });
      onAiSettingsChanged?.(service);
      if (aiKey) { aiKey.value = ""; aiKey.required = false; aiKey.placeholder = "已配置，留空则保持原 Key"; }
      aiStatus.textContent = "AI 设置已保存。";
    } catch { aiStatus.textContent = "AI 设置无效或保存失败，请检查输入。"; }
  }, { signal: options.signal });
  clearAi?.addEventListener("click", async () => {
    if (!database || !aiStatus) return;
    const confirm = documentRef.defaultView?.confirm;
    if (confirm && !confirm.call(documentRef.defaultView, "确定清除 AI 设置吗？")) return;
    try { await clearAiSettings(database); onAiSettingsChanged?.(undefined); aiForm?.reset(); if (aiStatus) aiStatus.textContent = "AI 设置已清除。"; }
    catch { aiStatus.textContent = "AI 设置清除失败。"; }
  }, { signal: options.signal });
}

function notificationStatus(): string {
  if (typeof Notification === "undefined") return "浏览器通知不可用；应用内提醒和 ICS 导出仍可用。";
  if (Notification.permission === "granted") return "浏览器通知已授权；应用内提醒和 ICS 导出仍可用。";
  if (Notification.permission === "denied") return "浏览器通知已被拒绝；应用内提醒和 ICS 导出仍可用。";
  return "浏览器通知尚未授权；应用内提醒和 ICS 导出仍可用。";
}
