import type { ResumeIngestionService } from "../../features/resumes/ingestion";
import { ResumeIngestionError } from "../../features/resumes/ingestion";
import type { AppBus } from "../../app/appBus";

export interface ResumeLibraryUiService {
  search(query?: string): Promise<any[]>;
  getResumeText(resumeId: string, kind?: "extracted" | "confirmed" | "manual"): Promise<any>;
  getDownloadData(resumeId: string): Promise<{ blob: Blob; fileName: string }>;
  exportConfirmedText(resumeId: string): Promise<Blob>;
  getResume(resumeId: string): Promise<any>;
  updateMetadata(resumeId: string, patch: { name?: string; tags?: string[] }): Promise<any>;
  previewDelete(resumeId: string): Promise<any>;
  deleteResume(resumeId: string, options?: { confirmed?: boolean }): Promise<void>;
  confirmText(resumeId: string, text: string): Promise<any>;
  getDefaultResume(): Promise<any>;
  setDefaultResume(resumeId: string | null): Promise<void>;
}

export interface ResumeLibraryOptions {
  resumeLibrary?: ResumeLibraryUiService;
  resumeIngestion?: ResumeIngestionService;
  applicationService?: { listApplications(): Promise<any[]> };
  bus?: AppBus;
  signal?: AbortSignal;
}

export function createResumeLibrary(
  documentRef: Document,
  options: ResumeLibraryOptions = {},
): HTMLElement {
  const root = documentRef.createElement("section");
  root.className = "resume-library";
  root.setAttribute("aria-labelledby", "resume-library-title");
  root.innerHTML = `
    <div class="section-heading">
      <div>
        <p class="section-label">资料</p>
        <h2 id="resume-library-title">简历版本库</h2>
      </div>
      <label class="resume-upload-button">
        <span>上传简历</span>
        <input class="resume-file-input" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" />
      </label>
    </div>
    <div class="resume-library-toolbar">
      <label for="resume-search">搜索简历</label>
      <input id="resume-search" type="search" placeholder="按名称、文件名或标签搜索" autocomplete="off" />
      <button type="button" class="resume-refresh" aria-label="刷新简历列表">刷新</button>
    </div>
    <div class="resume-library-status" role="status" aria-live="polite" aria-atomic="true">暂无简历版本</div>
    <div class="resume-library-list" aria-live="polite"></div>
    <div class="resume-editor" hidden>
      <label for="resume-text-editor">确认简历文本</label>
      <textarea id="resume-text-editor" rows="12"></textarea>
      <div class="resume-editor__actions">
        <button type="button" data-action="confirm-text">确认文本</button>
        <button type="button" data-action="cancel-text">取消</button>
      </div>
    </div>
    <div class="resume-metadata-editor" hidden>
      <h3>编辑版本信息</h3>
      <label for="resume-name-editor">版本名称</label>
      <input id="resume-name-editor" type="text" />
      <label for="resume-tags-editor">标签（用逗号分隔）</label>
      <input id="resume-tags-editor" type="text" />
      <div class="resume-editor__actions">
        <button type="button" data-action="save-metadata">保存</button>
        <button type="button" data-action="cancel-metadata">取消</button>
      </div>
    </div>
    <div class="resume-delete-preview" role="dialog" aria-modal="true" aria-labelledby="resume-delete-title" hidden>
      <h3 id="resume-delete-title">确认删除简历</h3>
      <p class="resume-delete-summary"></p>
      <div class="resume-editor__actions">
        <button type="button" data-action="confirm-delete">确认删除</button>
        <button type="button" data-action="cancel-delete">取消</button>
      </div>
    </div>
    <section class="resume-usage-overview" aria-labelledby="resume-usage-title">
      <h3 id="resume-usage-title">公司 ↔ 简历对照</h3>
      <div class="resume-usage-table"></div>
    </section>
  `;

  const status = root.querySelector<HTMLElement>(".resume-library-status");
  const list = root.querySelector<HTMLElement>(".resume-library-list");
  const search = root.querySelector<HTMLInputElement>("#resume-search");
  const fileInput = root.querySelector<HTMLInputElement>(".resume-file-input");
  const refresh = root.querySelector<HTMLButtonElement>(".resume-refresh");
  const editor = root.querySelector<HTMLElement>(".resume-editor");
  const editorText = root.querySelector<HTMLTextAreaElement>("#resume-text-editor");
  const metadataEditor = root.querySelector<HTMLElement>(".resume-metadata-editor");
  const nameEditor = root.querySelector<HTMLInputElement>("#resume-name-editor");
  const tagsEditor = root.querySelector<HTMLInputElement>("#resume-tags-editor");
  const deletePreview = root.querySelector<HTMLElement>(".resume-delete-preview");
  const deleteSummary = root.querySelector<HTMLElement>(".resume-delete-summary");
  const usageTable = root.querySelector<HTMLElement>(".resume-usage-table");
  let editingResumeId: string | undefined;
  let metadataResumeId: string | undefined;
  let pendingDeleteId: string | undefined;
  let deleteReturnFocus: HTMLElement | undefined;

  const renderUsageOverview = async (resumes: any[]) => {
    if (!usageTable || !options.applicationService) return;
    try {
      const applications = await options.applicationService.listApplications();
      const activeApplications = applications.filter((app) => !app.archivedAt);
      const defaultResume = resumes.find((r) => r.isDefault && r.status !== "deleted");

      if (activeApplications.length === 0) {
        usageTable.innerHTML = "<p>暂无职位</p>";
        return;
      }

      const rows = activeApplications.map((app) => {
        const resume = resumes.find((r) => r.id === app.currentResumeId);
        const isDefault = defaultResume && app.currentResumeId === defaultResume.id;
        const badge = app.currentResumeId
          ? (isDefault ? '<span class="usage-badge usage-badge--default">通用</span>' : '<span class="usage-badge usage-badge--custom">专用</span>')
          : '<span class="usage-badge usage-badge--none">未绑定</span>';
        return `
          <tr>
            <td>${escapeHtml(app.company)} · ${escapeHtml(app.position)}</td>
            <td>${resume ? escapeHtml(resume.name) : "—"}</td>
            <td>${badge}</td>
          </tr>
        `;
      }).join("");

      usageTable.innerHTML = `
        <table class="usage-table">
          <thead>
            <tr>
              <th>公司 · 职位</th>
              <th>当前简历</th>
              <th>标记</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      `;
    } catch {
      usageTable.innerHTML = "<p>对照表加载失败</p>";
    }
  };

  const render = async (query = "") => {
    if (!list) return;
    let resumes: any[] = [];
    try {
      resumes = options.resumeLibrary ? await options.resumeLibrary.search(query) : [];
    } catch {
      list.innerHTML = "";
      if (status) status.textContent = "简历列表读取失败，可重试";
      options.bus?.emit("resumes-changed", { count: 0 });
      return;
    }
    list.innerHTML = resumes.length
      ? resumes.map((resume: any) => `
          <article class="resume-library-item" data-resume-id="${resume.id}">
            <div class="resume-library-item__body">
              <h3 title="${escapeHtml(resume.name)}">${escapeHtml(resume.name)}${resume.isDefault ? ' <span class="resume-default-badge">通用</span>' : ""}</h3>
              <p>${escapeHtml(resume.fileName)}</p>
              <p class="resume-library-item__meta">${escapeHtml(resume.status)}${resume.tags.length ? ` · ${escapeHtml(resume.tags.join("、"))}` : ""}</p>
            </div>
            <div class="resume-library-item__actions">
              <button type="button" data-action="preview" data-resume-id="${resume.id}">预览文本</button>
              <button type="button" data-action="edit-metadata" data-resume-id="${resume.id}">编辑名称和标签</button>
              ${resume.status === "extraction-failed" ? `<button type="button" data-action="retry" data-resume-id="${resume.id}">重试提取</button>` : ""}
              ${resume.status !== "deleted" ? (resume.isDefault ? `<button type="button" data-action="unset-default" data-resume-id="${resume.id}">取消通用</button>` : `<button type="button" data-action="set-default" data-resume-id="${resume.id}">设为通用</button>`) : ""}
              <button type="button" data-action="export" data-resume-id="${resume.id}">导出文本</button>
              <button type="button" data-action="download" data-resume-id="${resume.id}">下载原文件</button>
              <button type="button" data-action="delete" data-resume-id="${resume.id}">删除</button>
            </div>
          </article>
        `).join("")
      : "";
    if (status) status.textContent = resumes.length ? `${resumes.length} 个简历版本` : "暂无简历版本";

    // 渲染公司 ↔ 简历对照表
    await renderUsageOverview(resumes);
    options.bus?.emit("resumes-changed", { count: resumes.length });
  };

  search?.addEventListener("input", () => void render(search.value), { signal: options.signal });
  refresh?.addEventListener("click", () => void render(search?.value ?? ""), { signal: options.signal });
  fileInput?.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file || !options.resumeIngestion) return;
    fileInput.disabled = true;
    const uploadButton = root.querySelector<HTMLElement>(".resume-upload-button");
    uploadButton?.classList.add("is-loading");
    if (status) status.textContent = file.size > 3 * 1024 * 1024 ? "正在解析并保存简历，较大文件可能需要几秒..." : "正在解析并保存简历...";
    try {
      const result = await options.resumeIngestion.ingest(file);
      if (status) status.textContent = result.outcome === "needs-review" ? "提取完成，请确认文本" : "提取失败，请粘贴或校正文本";
      await render(search?.value ?? "");
      options.bus?.emit("app-data-changed", undefined);
    } catch (error) {
      if (status) status.textContent = resumeUploadErrorMessage(error);
    } finally {
      fileInput.disabled = false;
      uploadButton?.classList.remove("is-loading");
      fileInput.value = "";
    }
  }, { signal: options.signal });

  list?.addEventListener("click", async (event) => {
    const target = event.target as HTMLElement;
    const button = target.closest<HTMLButtonElement>("button[data-action]");
    const resumeId = button?.dataset.resumeId;
    if (!button || !resumeId || !options.resumeLibrary) return;
    try {
      if (button.dataset.action === "preview") {
        const textRecord = await options.resumeLibrary.getResumeText(resumeId, "confirmed")
          ?? await options.resumeLibrary.getResumeText(resumeId, "extracted")
          ?? await options.resumeLibrary.getResumeText(resumeId, "manual");
        editingResumeId = resumeId;
        if (editorText) editorText.value = textRecord?.text ?? "";
        if (editor) editor.hidden = false;
        editorText?.focus();
        if (status) status.textContent = textRecord ? `已读取文本（${textRecord.text.length} 字）` : "尚未提取文本，请粘贴或校正";
      } else if (button.dataset.action === "download") {
        const download = await options.resumeLibrary.getDownloadData(resumeId);
        triggerDownload(documentRef, download.blob, download.fileName);
        if (status) status.textContent = "原文件已下载";
      } else if (button.dataset.action === "export") {
        const blob = await options.resumeLibrary.exportConfirmedText(resumeId);
        triggerDownload(documentRef, blob, "resume-confirmed.txt");
        if (status) status.textContent = "确认文本已导出";
      } else if (button.dataset.action === "edit-metadata") {
        const resume = await options.resumeLibrary.getResume(resumeId);
        if (!resume) throw new Error("简历版本不存在");
        metadataResumeId = resumeId;
        if (nameEditor) nameEditor.value = resume.name;
        if (tagsEditor) tagsEditor.value = resume.tags.join(", ");
        if (metadataEditor) metadataEditor.hidden = false;
        nameEditor?.focus();
      } else if (button.dataset.action === "retry") {
        if (!options.resumeIngestion) throw new Error("当前无法重试文本提取");
        const result = await options.resumeIngestion.retryExtraction(resumeId);
        if (status) status.textContent = result.outcome === "needs-review" ? "重新提取完成，请确认文本" : "提取仍然失败，可继续手动粘贴文本";
        await render(search?.value ?? "");
      } else if (button.dataset.action === "delete") {
        const preview = await options.resumeLibrary.previewDelete(resumeId);
        pendingDeleteId = resumeId;
        deleteReturnFocus = button;
        if (deleteSummary) deleteSummary.textContent = `将删除"${preview.name}"及其原文件；已固化的使用历史不会删除。`;
        if (deletePreview) deletePreview.hidden = false;
        deletePreview?.querySelector<HTMLButtonElement>('[data-action="confirm-delete"]')?.focus();
        if (status) status.textContent = "删除预览已打开，尚未删除任何数据";
      } else if (button.dataset.action === "set-default") {
        await options.resumeLibrary.setDefaultResume(resumeId);
        if (status) status.textContent = "已设为通用简历";
        await render(search?.value ?? "");
        options.bus?.emit("app-data-changed", undefined);
      } else if (button.dataset.action === "unset-default") {
        await options.resumeLibrary.setDefaultResume(null);
        if (status) status.textContent = "已取消通用简历";
        await render(search?.value ?? "");
        options.bus?.emit("app-data-changed", undefined);
      }
    } catch (error) {
      if (status) status.textContent = error instanceof ResumeIngestionError ? resumeUploadErrorMessage(error) : "简历操作失败，请重试";
    }
  }, { signal: options.signal });

  metadataEditor?.addEventListener("click", async (event) => {
    const action = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-action]")?.dataset.action;
    if (action === "cancel-metadata") {
      metadataEditor.hidden = true;
      metadataResumeId = undefined;
      return;
    }
    if (action !== "save-metadata" || !metadataResumeId || !options.resumeLibrary) return;
    try {
      if (status) status.textContent = "正在保存版本信息...";
      await options.resumeLibrary.updateMetadata(metadataResumeId, {
        name: nameEditor?.value,
        tags: tagsEditor?.value.split(/[,，]/),
      });
      metadataEditor.hidden = true;
      if (status) status.textContent = "版本名称和标签已保存";
      await render(search?.value ?? "");
    } catch (error) {
      if (status) status.textContent = "版本信息保存失败，请重试";
    }
  }, { signal: options.signal });

  deletePreview?.addEventListener("click", async (event) => {
    const action = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-action]")?.dataset.action;
    if (action === "cancel-delete") {
      deletePreview.hidden = true;
      pendingDeleteId = undefined;
      deleteReturnFocus?.focus();
      deleteReturnFocus = undefined;
      if (status) status.textContent = "已取消删除，数据未改变";
      return;
    }
    if (action !== "confirm-delete" || !pendingDeleteId || !options.resumeLibrary) return;
    try {
      if (status) status.textContent = "正在删除简历...";
      await options.resumeLibrary.deleteResume(pendingDeleteId, { confirmed: true });
      deletePreview.hidden = true;
      pendingDeleteId = undefined;
      deleteReturnFocus?.focus();
      deleteReturnFocus = undefined;
      if (status) status.textContent = "简历已删除";
      await render(search?.value ?? "");
      options.bus?.emit("app-data-changed", undefined);
    } catch (error) {
      if (status) status.textContent = "删除失败，请重试";
    }
  }, { signal: options.signal });
  deletePreview?.addEventListener("keydown", (event) => {
    if (event.key === "Tab") {
      const focusable = Array.from(deletePreview.querySelectorAll<HTMLElement>("button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])"));
      if (focusable.length) {
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && documentRef.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && documentRef.activeElement === last) { event.preventDefault(); first.focus(); }
      }
      return;
    }
    if (event.key === "Escape") {
      deletePreview.hidden = true;
      pendingDeleteId = undefined;
      deleteReturnFocus?.focus();
      deleteReturnFocus = undefined;
      if (status) status.textContent = "已取消删除，数据未改变";
    }
  }, { signal: options.signal });

  editor?.addEventListener("click", async (event) => {
    const target = event.target as HTMLElement;
    const action = target.closest<HTMLButtonElement>("button[data-action]")?.dataset.action;
    if (action === "cancel-text") {
      editor.hidden = true;
      editingResumeId = undefined;
      return;
    }
    if (action !== "confirm-text" || !editingResumeId || !options.resumeLibrary || !editorText) return;
    try {
      if (status) status.textContent = "正在保存确认文本...";
      await options.resumeLibrary.confirmText(editingResumeId, editorText.value);
      if (status) status.textContent = "文本已保存并确认";
      editor.hidden = true;
      await render(search?.value ?? "");
    } catch (error) {
      if (status) status.textContent = "文本保存失败，请重试";
    }
  }, { signal: options.signal });

  void render();
  documentRef.defaultView?.addEventListener("app-data-cleared", () => void render(search?.value ?? ""), { signal: options.signal });

  return root;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character] ?? character);
}

/** 把简历导入错误翻译成安全的中文提示，不回显底层 error.message（可能含敏感正文）。 */
function resumeUploadErrorMessage(error: unknown): string {
  if (error instanceof ResumeIngestionError) {
    switch (error.code) {
      case "unsupported-format":
        return "文件格式不支持，请选择 PDF 或 DOCX 文件。";
      case "file-too-large":
        return "文件超过 25 MB 上限，请选择更小的文件。";
      case "type-mismatch":
        return "文件扩展名与类型不一致，请重新导出后再上传。";
      case "invalid-file":
        return "文件已损坏或不是有效的 PDF/DOCX，请重新选择。";
      case "duplicate-file":
        return "该简历文件此前已导入，可直接使用已存在的版本。";
      default:
        return "简历保存失败，请重试";
    }
  }
  return "简历保存失败，请重试";
}

function triggerDownload(documentRef: Document, blob: Blob, fileName: string): void {
  if (typeof URL.createObjectURL !== "function") return;
  const anchor = documentRef.createElement("a");
  anchor.href = URL.createObjectURL(blob);
  anchor.download = fileName;
  anchor.hidden = true;
  documentRef.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(anchor.href);
}
