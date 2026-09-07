import { expect, test } from "@playwright/test";

async function seedData(page: import("@playwright/test").Page): Promise<void> {
  await page.evaluate(async () => {
    const request = indexedDB.open("local-career-workspace", 6);
    await new Promise<void>((resolve, reject) => {
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
    const db = request.result;
    const now = "2026-09-01T00:00:00.000Z";
    const put = (store: string, value: unknown) => new Promise<void>((resolve, reject) => {
      const tx = db.transaction(store, "readwrite");
      tx.objectStore(store).put(value);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    await put("stages", { id: "stage-e2e", name: "待申请", color: "#2563eb", order: 0, kind: "normal", createdAt: now, updatedAt: now });
    await put("resumes", { id: "resume-e2e", name: "E2E 简历", type: "pdf", fileName: "resume.pdf", fileSize: 1, fileHash: "hash-e2e", uploadedAt: now, tags: [], note: "", status: "ready", textSource: "extracted", createdAt: now, updatedAt: now });
    await put("resumeTexts", { id: "resume-text-e2e", resumeId: "resume-e2e", kind: "confirmed", text: "TypeScript React experience", confirmedAt: now, createdAt: now, updatedAt: now });
    await put("applications", { id: "application-e2e", company: "E2E 公司", position: "前端工程师", jobType: "tech", location: "", workMode: "remote", salaryText: "", source: "", jobUrl: "", jdText: "TypeScript React", stageId: "stage-e2e", priority: 0, contact: "", note: "", currentResumeId: "resume-e2e", createdAt: now, updatedAt: now });
    await put("jobDescriptions", { id: "jd-e2e", applicationId: "application-e2e", textSource: "pasted", createdAt: now, updatedAt: now });
    await put("jobDescriptionTexts", { id: "jd-text-e2e", jobDescriptionId: "jd-e2e", kind: "confirmed", text: "TypeScript React", confirmedAt: now, createdAt: now, updatedAt: now });
    await put("sensitiveSettings", { id: "ai", apiUrl: "https://api.example.test/v1", model: "test-model", apiKey: "test-key", organizationId: "", customHeaders: {}, createdAt: now, updatedAt: now });
    db.close();
  });
}

test("previews, cancels, then confirms an AI advisor request", async ({ page }) => {
  let requestCount = 0;
  await page.route("https://api.example.test/**", async (route) => {
    requestCount += 1;
    if (route.request().url().endsWith("/models")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [] }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ choices: [{ message: { content: JSON.stringify({ matchOverview: "匹配良好", issues: ["缺少量化证据"], suggestions: ["补充项目结果"], rewrites: [{ original: "TypeScript experience", rewrite: "建议：补充可核验的 TypeScript 项目成果" }], missingInfo: ["项目时间"], risks: ["请人工核验"], authenticityRisk: true }) } }] }) });
  });
  await page.goto("/");
  await seedData(page);
  await page.reload();
  await page.getByRole("tab", { name: "职位申请" }).click();
  await page.getByRole("button", { name: "查看详情" }).click({ force: true });
  await page.getByLabel("咨询问题").fill("请给出优化建议");
  await page.getByRole("button", { name: "预览并发送" }).click({ force: true });
  await expect(page.getByRole("dialog", { name: "发送前确认" })).toBeVisible();
  await expect(page.locator(".send-preview dt", { hasText: "简历版本" })).toBeVisible();
  expect(requestCount).toBe(0);
  await page.getByRole("button", { name: "取消", exact: true }).click({ force: true });
  expect(requestCount).toBe(0);
  await page.getByRole("button", { name: "预览并发送" }).click({ force: true });
  await page.getByRole("button", { name: "确认发送" }).click({ force: true });
  await expect(page.locator(".ai-result")).toContainText("真实性风险");
  expect(requestCount).toBe(2);
});
