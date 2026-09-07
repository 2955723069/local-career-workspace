import type { ResumeIngestionService } from "../../features/resumes/ingestion";
import { ResumeLibraryService } from "../../features/resumes/resumeLibrary";

export interface ResumeLibraryComponentOptions {
  ingestion?: ResumeIngestionService;
}

/** Mounts the reusable resume-library shell into an existing element. */
export class ResumeLibrary {
  readonly #root: HTMLElement;
  readonly #service: ResumeLibraryService;
  readonly #options: ResumeLibraryComponentOptions;

  constructor(
    root: HTMLElement,
    service: ResumeLibraryService,
    options: ResumeLibraryComponentOptions = {},
  ) {
    this.#root = root;
    this.#service = service;
    this.#options = options;
  }

  async mount(): Promise<void> {
    const resumes = await this.#service.listResumes();
    this.#root.setAttribute("aria-label", "简历版本库");
    this.#root.innerHTML = `
      <h2>简历版本库</h2>
      <p role="status" aria-live="polite">${resumes.length ? `${resumes.length} 个简历版本` : "暂无简历版本"}</p>
      <div class="resume-library-list"></div>
    `;
    const list = this.#root.querySelector<HTMLElement>(".resume-library-list");
    if (!list) return;
    list.innerHTML = resumes.map((resume) => `
      <article class="resume-library-item" data-resume-id="${resume.id}">
        <h3>${escapeHtml(resume.name)}</h3>
        <p>${escapeHtml(resume.fileName)}</p>
      </article>
    `).join("");
    void this.#options;
  }
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
