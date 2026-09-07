import { expect, test, type Page } from "@playwright/test";
import { makePdf } from "../resume/fixtures";

declare const Buffer: {
  from(data: string | Uint8Array): unknown;
};

const DB_NAME = "local-career-workspace";
const DB_VERSION = 6;
const RESUME_TEXT = "TypeScript React 本地匹配证据";
const BACKUP_PASSWORD = "e2e-backup-password";

async function readStoreCounts(page: Page): Promise<Record<string, number>> {
  return page.evaluate(({ databaseName, version }) => new Promise<Record<string, number>>((resolve, reject) => {
    const request = indexedDB.open(databaseName, version);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const names = ["resumes", "resumeTexts", "applications", "interviews", "interviewReviews", "analysisResults"];
      const transaction = db.transaction(names, "readonly");
      const counts: Record<string, number> = {};
      let remaining = names.length;
      for (const name of names) {
        const countRequest = transaction.objectStore(name).count();
        countRequest.onsuccess = () => {
          counts[name] = countRequest.result;
          remaining -= 1;
          if (remaining === 0) {
            db.close();
            resolve(counts);
          }
        };
      }
      transaction.onerror = () => reject(transaction.error);
    };
  }), { databaseName: DB_NAME, version: DB_VERSION });
}

function localDateTime(offsetDays: number, hour: number): string {
  const date = new Date(Date.now() + offsetDays * 86_400_000);
  date.setHours(hour, 0, 0, 0);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

test("completes the offline resume-to-backup workflow on desktop and mobile", async ({ page, context }) => {
  await page.addInitScript(() => {
    const originalCreateObjectUrl = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (object: Blob | MediaSource) => {
      if (object instanceof Blob && object.type === "application/json") {
        (window as Window & { __careerBackupBlob?: Blob }).__careerBackupBlob = object;
      }
      return originalCreateObjectUrl(object);
    };
  });
  await page.goto("/");
  await expect(page.locator(".local-status")).toContainText("本地数据已就绪");
  await page.getByRole("tab", { name: "简历库" }).click();

  const resumeInput = page.locator(".resume-file-input");
  await resumeInput.setInputFiles({
    name: "e2e-resume.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(makePdf(RESUME_TEXT)) as never,
  });
  await expect(page.locator(".resume-library-item__meta")).toContainText("needs-review");
  await page.getByRole("button", { name: "预览文本" }).click({ force: true });
  const resumeEditor = page.getByLabel("确认简历文本");
  await expect(resumeEditor).toBeFocused();
  await resumeEditor.fill(`${RESUME_TEXT}\n项目成果可人工核验`);
  await page.getByRole("button", { name: "确认文本" }).press("Enter");
  await expect(page.locator(".resume-editor")).toBeHidden();
  await expect(page.locator(".resume-library-status")).toContainText("1 个简历版本");
  await page.reload();
  await expect(page.locator(".resume-library-item__meta")).toContainText("ready");

  await page.getByRole("tab", { name: "职位申请" }).click();

  const company = page.getByRole("textbox", { name: "公司", exact: true });
  await company.focus();
  await expect(company).toBeFocused();
  await company.fill("离线 E2E 公司");
  await page.getByRole("textbox", { name: "职位", exact: true }).fill("前端工程师");
  await page.getByRole("textbox", { name: "确认 JD 文本", exact: true }).fill("TypeScript React");
  await page.locator("#application-deadline").fill(localDateTime(7, 17));
  const resumeSelect = page.getByLabel("当前简历");
  await expect(resumeSelect.locator("option")).toHaveCount(2);
  await resumeSelect.selectOption({ index: 1 });
  await page.getByRole("button", { name: "保存职位" }).press("Enter");
  await expect(page.locator(".application-board__status")).toContainText("职位已保存");
  await expect(page.locator(".application-card")).toContainText("离线 E2E 公司");

  await page.reload();
  await expect(page.locator(".application-card")).toContainText("离线 E2E 公司");
  await page.getByRole("button", { name: "查看详情" }).click({ force: true });
  await expect(page.locator(".application-detail__status")).toContainText("已载入");
  await page.locator('[data-detail-tab="matching"]').click({ force: true });
  const outboundRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().startsWith("http") && !request.url().startsWith("http://127.0.0.1:4175")) outboundRequests.push(request.url());
  });
  await context.setOffline(true);
  await page.getByRole("button", { name: "运行匹配" }).click({ force: true });
  await expect(page.locator(".matching-result")).toBeVisible();
  expect(outboundRequests).toEqual([]);

  await page.getByRole("tab", { name: "面试日历" }).click();

  const startsAt = localDateTime(1, 10);
  const endsAt = localDateTime(1, 11);
  await page.getByLabel("标题").fill("技术面试");
  await page.locator("#interview-starts-at").fill(startsAt);
  await page.locator("#interview-ends-at").fill(endsAt);
  await page.getByLabel("地点或链接").fill("https://meet.example.test/e2e");
  await page.getByRole("button", { name: "保存面试" }).press("Enter");
  await expect(page.locator(".interview-item")).toContainText("技术面试");
  await expect(page.locator(".interview-calendar__status")).toContainText("面试已保存");
  await page.getByRole("button", { name: "改期" }).click({ force: true });
  await page.getByLabel("新的开始时间").fill(localDateTime(1, 11));
  await page.getByLabel("新的结束时间").fill(localDateTime(1, 12));
  await page.getByRole("button", { name: "确认改期" }).press("Enter");
  await expect(page.locator(".interview-calendar__status")).toContainText("面试已改期");
  await page.getByRole("button", { name: "填写或编辑复盘" }).click({ force: true });
  await page.getByLabel("评分（0 至 5）").fill("4");
  await page.getByLabel("优势回答").fill("能解释 TypeScript 项目经验");
  await page.getByLabel("下一步").fill("等待反馈");
  await page.getByRole("button", { name: "保存复盘" }).press("Enter");
  await expect(page.locator("[data-review-status]")).toContainText("已复盘");

  await page.getByRole("tab", { name: "设置与备份" }).click();

  const exportPassword = page.getByLabel("备份密码").first();
  await exportPassword.fill(BACKUP_PASSWORD);
  await page.getByLabel("确认备份密码").fill(BACKUP_PASSWORD);
  const exportButton = page.getByRole("button", { name: "导出轻量备份" });
  await expect(exportButton).toBeEnabled();
  await exportButton.click({ force: true });
  await expect(page.locator(".backup-panel__status")).toContainText("轻量备份已加密并下载");
  const backupState = await page.evaluate(async () => {
    const blob = (window as Window & { __careerBackupBlob?: Blob }).__careerBackupBlob;
    return { hasBlob: Boolean(blob), bytes: blob ? [...new Uint8Array(await blob.arrayBuffer())] : [] };
  });
  if (!backupState.hasBlob) throw new Error(`backup blob was not generated; status=${await page.locator(".backup-panel__status").textContent()}`);
  const backupBytes = backupState.bytes;

  const importFile = page.locator("#backup-import-file");
  await importFile.setInputFiles({ name: "career-backup-light.json", mimeType: "application/json", buffer: Buffer.from(new Uint8Array(backupBytes)) as never });
  await expect(page.getByLabel("备份密码")).toHaveCount(3);
  await page.getByLabel("备份密码").last().fill(BACKUP_PASSWORD);
  await page.getByRole("button", { name: "解密并查看概览" }).press("Enter");
  await expect(page.locator('[data-import-step="overview"]')).toBeVisible();
  await page.getByRole("button", { name: "继续处理冲突" }).click({ force: true });
  await expect(page.locator('[data-import-step="conflicts"]')).toBeVisible();
  const conflictSelect = page.locator("[data-conflict-resolution]").first();
  await expect(conflictSelect).toHaveValue("keep-local");
  await conflictSelect.selectOption("use-backup");
  await page.getByRole("button", { name: "生成导入预览" }).click({ force: true });
  await expect(page.locator('[data-import-step="preview"]')).toBeVisible();
  await page.getByRole("button", { name: "最终确认并导入" }).click({ force: true });
  await expect(page.locator(".backup-panel__status")).toContainText("导入完成");
  const counts = await readStoreCounts(page);
  expect(counts.resumes).toBe(1);
  expect(counts.applications).toBe(1);
  expect(counts.interviews).toBe(1);
  expect(counts.interviewReviews).toBe(1);
  expect(counts.analysisResults).toBe(1);

  if (test.info().project.name === "mobile") {
    await page.getByRole("tab", { name: "职位申请" }).click();
    const board = page.locator(".application-board-view");
    await expect(board).toBeVisible();
    const boardMetrics = await board.evaluate((element) => ({ scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }));
    expect(boardMetrics.scrollWidth).toBeGreaterThan(boardMetrics.clientWidth);
    await board.evaluate((element) => { element.scrollLeft = element.scrollWidth; });
    await expect(page.locator(".application-stage-column").last()).toBeVisible();
    await page.getByRole("tab", { name: "面试日历" }).click();
    await expect(page.locator(".interview-review__actions")).toBeVisible();
    const pageMetrics = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
    expect(pageMetrics.scrollWidth).toBeLessThanOrEqual(pageMetrics.clientWidth + 1);
  }
});
