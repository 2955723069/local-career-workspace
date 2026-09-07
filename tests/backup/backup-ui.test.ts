import { afterEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../../src/app/createApp";
import { createBackupPanel, type BackupPanelService } from "../../src/features/backup/BackupPanel";
import {
  BackupService,
  type BackupEnvelope,
  type BackupImportSession,
  type BackupKind,
  type ImportPlan,
} from "../../src/features/backup/backupService";
import { deleteCareerDatabase, openCareerDatabase, requestToPromise, transactionToPromise } from "../../src/db/database";
import { STORE_NAMES } from "../../src/db/schema";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

async function waitFor(predicate: () => boolean, timeoutMs = 3_000): Promise<void> {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) throw new Error("Timed out waiting for backup UI state");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function importSession(conflicts: BackupImportSession["conflicts"] = []): BackupImportSession {
  const counts = {
    resumes: 1,
    resumeTexts: 1,
    jobDescriptions: 0,
    jobDescriptionTexts: 0,
    applications: 2,
    resumeUsageHistory: 0,
    stages: 1,
    applicationTimelineEvents: 0,
    interviews: 0,
    interviewReviews: 0,
    reminderFailures: 0,
    analysisResults: 0,
    aiConversations: 1,
    originalFiles: 0,
  } as BackupImportSession["storeCounts"];
  return {
    version: 1,
    kind: "light",
    backupVersion: 1,
    backupKind: "light",
    payload: { kind: "light", exportedAt: "2026-09-03T08:00:00.000Z", stores: {} },
    storeCounts: counts,
    counts,
    blobCount: 0,
    originalFileCount: 0,
    conflicts,
    decodedOriginalFiles: [],
  };
}

function service(overrides: Partial<BackupPanelService> = {}): BackupPanelService {
  return {
    exportBackup: vi.fn(async ({ kind }: { kind: BackupKind; password: string }): Promise<BackupEnvelope> => ({
      format: "local-career-workspace-backup",
      version: 1,
      kind,
      salt: "salt",
      iv: "iv",
      kdf: { name: "PBKDF2", hash: "SHA-256", iterations: 210_000, salt: "salt" },
      cipher: { name: "AES-GCM", iv: "iv", tagLength: 128 },
      ciphertext: "ciphertext",
    })),
    prepareBackupImport: vi.fn(async () => importSession()),
    buildImportPlan: vi.fn(() => ({ kind: "light", records: { applications: [{ id: "app-1" }] }, operations: [] }) as unknown as ImportPlan),
    commitBackupImport: vi.fn(async () => undefined),
    ...overrides,
  };
}

function setFile(input: HTMLInputElement, fileName = "career-backup.json", contents = "{\"backup\":true}"): void {
  const file = new File([contents], fileName, { type: "application/json" });
  Object.defineProperty(input, "files", { configurable: true, value: [file] });
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function submit(form: HTMLFormElement): void {
  form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
}

afterEach(() => {
  document.body.innerHTML = "";
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("backup and restore panel", () => {
  it("exports light and full encrypted downloads without persisting the password or using the network", async () => {
    const backupService = service();
    const fetchSpy = vi.fn();
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", fetchSpy);
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:backup"),
      revokeObjectURL: vi.fn(),
    });
    document.body.innerHTML = '<div id="app"></div>';
    const root = createApp(document, { backupService });
    const password = root.querySelector<HTMLInputElement>("#backup-export-password")!;
    password.value = "never-store-this";
    root.querySelector<HTMLInputElement>("#backup-export-password-confirm")!.value = "never-store-this";

    root.querySelector<HTMLButtonElement>('[data-backup-export="light"]')!.click();
    await tick();
    root.querySelector<HTMLButtonElement>('[data-backup-export="full"]')!.click();
    await tick();

    expect(backupService.exportBackup).toHaveBeenNthCalledWith(1, { kind: "light", password: "never-store-this" });
    expect(backupService.exportBackup).toHaveBeenNthCalledWith(2, { kind: "full", password: "never-store-this" });
    expect(clickSpy).toHaveBeenCalledTimes(2);
    expect(localStorage.length).toBe(0);
    expect(JSON.stringify((backupService.exportBackup as ReturnType<typeof vi.fn>).mock.results)).not.toContain("never-store-this");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("requires file, password, overview, per-conflict choices, preview, and final confirmation in order", async () => {
    const conflictId = `resume-${"very-long-id-".repeat(12)}`;
    const session = importSession([{ storeName: "resumes", id: conflictId, defaultResolution: "keep-local" }]);
    const backupService = service({ prepareBackupImport: vi.fn(async () => session) });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    document.body.innerHTML = '<div id="app"></div>';
    const root = createApp(document, { backupService });

    expect(root.querySelector('[data-import-step="password"]')).toBeNull();
    setFile(root.querySelector<HTMLInputElement>("#backup-import-file")!);
    expect(root.querySelector('[data-import-step="password"]')).not.toBeNull();
    const importPassword = root.querySelector<HTMLInputElement>("#backup-import-password")!;
    expect(importPassword.labels?.[0]?.textContent).toContain("备份密码");
    importPassword.value = "restore-only";
    submit(root.querySelector<HTMLFormElement>('[data-import-step="password"]')!);
    await tick();

    expect(root.querySelector('[data-import-step="overview"]')?.textContent).toContain("版本 1");
    expect(importPassword.value).toBe("");
    expect(root.querySelector('[data-import-step="overview"]')?.textContent).toContain("2 条职位");
    expect(root.querySelector('[data-import-step="conflicts"]')).toBeNull();
    root.querySelector<HTMLButtonElement>('[data-action="review-conflicts"]')!.click();
    expect(root.querySelector('[data-import-step="conflicts"]')).not.toBeNull();
    const conflictSelect = root.querySelector<HTMLSelectElement>("[data-conflict-resolution]")!;
    expect(conflictSelect.value).toBe("keep-local");
    expect(conflictSelect.labels?.[0]?.textContent).toContain(conflictId);
    expect(conflictSelect.closest(".backup-conflict")?.classList.contains("backup-conflict--wrap")).toBe(true);
    expect(backupService.commitBackupImport).not.toHaveBeenCalled();

    conflictSelect.value = "import-copy";
    root.querySelector<HTMLButtonElement>('[data-action="preview-import"]')!.click();
    expect(root.querySelector('[data-import-step="preview"]')?.textContent).toContain("导入预览");
    expect(backupService.buildImportPlan).toHaveBeenCalledWith(session, [{ storeName: "resumes", id: conflictId, resolution: "import-copy" }]);
    expect(backupService.commitBackupImport).not.toHaveBeenCalled();

    root.querySelector<HTMLButtonElement>('[data-action="confirm-import"]')!.click();
    await tick();
    expect(backupService.commitBackupImport).toHaveBeenCalledTimes(1);
    expect(root.querySelector('[role="status"]')?.textContent).toBeTruthy();
    expect(root.querySelector(".backup-panel__status")?.textContent).toContain("导入完成");
    expect(importPassword.value).toBe("");
    expect(localStorage.length).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each([
    ["选择文件后", "password"],
    ["查看概览后", "overview"],
    ["处理冲突时", "conflicts"],
    ["导入预览后", "preview"],
  ])("%s取消不会提交且给出可恢复状态", async (_label, cancelAt) => {
    const backupService = service({ prepareBackupImport: vi.fn(async () => importSession()) });
    const panel = createBackupPanel(document, { backupService });
    document.body.append(panel);
    setFile(panel.querySelector<HTMLInputElement>("#backup-import-file")!);

    if (cancelAt !== "password") {
      panel.querySelector<HTMLInputElement>("#backup-import-password")!.value = "pw";
      submit(panel.querySelector<HTMLFormElement>('[data-import-step="password"]')!);
      await tick();
    }
    if (cancelAt === "conflicts" || cancelAt === "preview") {
      panel.querySelector<HTMLButtonElement>('[data-action="review-conflicts"]')!.click();
    }
    if (cancelAt === "preview") {
      panel.querySelector<HTMLButtonElement>('[data-action="preview-import"]')!.click();
    }
    panel.querySelector<HTMLButtonElement>(`[data-cancel-at="${cancelAt}"]`)!.click();

    expect(backupService.commitBackupImport).not.toHaveBeenCalled();
    expect(panel.querySelector(".backup-panel__status")?.textContent).toContain("未导入任何数据");
    expect(panel.querySelector<HTMLInputElement>("#backup-import-password")).toBeNull();
  });

  it.each([
    ["密码错误或文件损坏", new Error("Unable to decrypt backup"), "密码错误或备份文件已损坏"],
    ["格式校验失败", new Error("Invalid backup format"), "备份文件校验失败或已损坏"],
  ])("%s时保留可重试的文件和密码步骤", async (_label, error, message) => {
    const backupService = service({ prepareBackupImport: vi.fn(async () => { throw error; }) });
    const panel = createBackupPanel(document, { backupService });
    document.body.append(panel);
    setFile(panel.querySelector<HTMLInputElement>("#backup-import-file")!);
    panel.querySelector<HTMLInputElement>("#backup-import-password")!.value = "wrong";
    submit(panel.querySelector<HTMLFormElement>('[data-import-step="password"]')!);
    await tick();

    expect(panel.querySelector(".backup-panel__status")?.textContent).toContain(message);
    expect(panel.querySelector('[data-import-step="password"]')).not.toBeNull();
    expect(backupService.commitBackupImport).not.toHaveBeenCalled();
  });

  it("identifies malformed JSON as a damaged backup and stays recoverable", async () => {
    const backupService = service();
    const panel = createBackupPanel(document, { backupService });
    document.body.append(panel);
    setFile(panel.querySelector<HTMLInputElement>("#backup-import-file")!, "damaged.json", "not-json");
    panel.querySelector<HTMLInputElement>("#backup-import-password")!.value = "pw";
    submit(panel.querySelector<HTMLFormElement>('[data-import-step="password"]')!);
    await tick();

    expect(panel.querySelector(".backup-panel__status")?.textContent).toContain("备份文件损坏");
    expect(panel.querySelector('[data-import-step="password"]')).not.toBeNull();
    expect(backupService.prepareBackupImport).not.toHaveBeenCalled();
    expect(backupService.commitBackupImport).not.toHaveBeenCalled();
  });

  it("reports an atomic rollback on commit failure and keeps the preview available for retry or cancel", async () => {
    const backupService = service({ commitBackupImport: vi.fn(async () => { throw new Error("transaction failed"); }) });
    const panel = createBackupPanel(document, { backupService });
    document.body.append(panel);
    setFile(panel.querySelector<HTMLInputElement>("#backup-import-file")!);
    panel.querySelector<HTMLInputElement>("#backup-import-password")!.value = "pw";
    submit(panel.querySelector<HTMLFormElement>('[data-import-step="password"]')!);
    await tick();
    panel.querySelector<HTMLButtonElement>('[data-action="review-conflicts"]')!.click();
    panel.querySelector<HTMLButtonElement>('[data-action="preview-import"]')!.click();
    panel.querySelector<HTMLButtonElement>('[data-action="confirm-import"]')!.click();
    await tick();

    expect(panel.querySelector(".backup-panel__status")?.textContent).toContain("已回滚");
    expect(panel.querySelector(".backup-panel__status")?.textContent).toContain("本地资料和已保存对话未改变");
    expect(panel.querySelector('[data-import-step="preview"]')).not.toBeNull();
  });

  it("uses semantic keyboard-operable controls and a polite atomic live status", () => {
    const panel = createBackupPanel(document, { backupService: service() });
    document.body.append(panel);

    expect(panel.querySelector("section")?.getAttribute("aria-labelledby")).toBe("backup-panel-title");
    expect(panel.querySelector(".backup-panel__status")?.getAttribute("role")).toBe("status");
    expect(panel.querySelector(".backup-panel__status")?.getAttribute("aria-live")).toBe("polite");
    expect(panel.querySelector(".backup-panel__status")?.getAttribute("aria-atomic")).toBe("true");
    expect([...panel.querySelectorAll("button")].every((button) => ["button", "submit"].includes(button.type))).toBe(true);
    expect(panel.querySelector<HTMLInputElement>("#backup-export-password")?.type).toBe("password");
    expect(panel.querySelector<HTMLInputElement>("#backup-import-file")?.accept).toContain("json");
  });

  it("imports through createApp with the real IndexedDB service and remains readable after reopening", async () => {
    const sourceName = `backup-ui-source-${crypto.randomUUID()}`;
    const targetName = `backup-ui-target-${crypto.randomUUID()}`;
    let source: IDBDatabase | undefined;
    let target: IDBDatabase | undefined;
    let reopened: IDBDatabase | undefined;
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    try {
      source = await openCareerDatabase({ name: sourceName });
      const transaction = source.transaction(STORE_NAMES.stages, "readwrite");
      transaction.objectStore(STORE_NAMES.stages).add({
        id: "stage-from-backup",
        createdAt: "2026-09-03T08:00:00.000Z",
        updatedAt: "2026-09-03T08:00:00.000Z",
        name: "Imported stage",
        color: "#39705a",
        order: 1,
        kind: "normal",
      });
      await transactionToPromise(transaction);
      const envelope = await new BackupService(source).exportBackup({ kind: "light", password: "local-only-password" });
      expect(JSON.stringify(envelope)).not.toContain("local-only-password");

      target = await openCareerDatabase({ name: targetName });
      document.body.innerHTML = '<div id="app"></div>';
      const root = createApp(document, { backupService: new BackupService(target) });
      setFile(root.querySelector<HTMLInputElement>("#backup-import-file")!, "backup.json", JSON.stringify(envelope));
      root.querySelector<HTMLInputElement>("#backup-import-password")!.value = "local-only-password";
      submit(root.querySelector<HTMLFormElement>('[data-import-step="password"]')!);
      await waitFor(() => root.querySelector('[data-import-step="overview"]') !== null);
      root.querySelector<HTMLButtonElement>('[data-action="review-conflicts"]')!.click();
      root.querySelector<HTMLButtonElement>('[data-action="preview-import"]')!.click();
      root.querySelector<HTMLButtonElement>('[data-action="confirm-import"]')!.click();
      await waitFor(() => root.querySelector(".backup-panel__status")?.textContent?.includes("导入完成") === true);

      target.close();
      target = undefined;
      reopened = await openCareerDatabase({ name: targetName });
      const readTransaction = reopened.transaction(STORE_NAMES.stages, "readonly");
      const stages = await requestToPromise<Array<{ id: string }>>(readTransaction.objectStore(STORE_NAMES.stages).getAll());
      await transactionToPromise(readTransaction);
      expect(stages).toContainEqual(expect.objectContaining({ id: "stage-from-backup" }));
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      source?.close();
      target?.close();
      reopened?.close();
      await deleteCareerDatabase(sourceName);
      await deleteCareerDatabase(targetName);
    }
  });
});
