import { expect, test } from "@playwright/test";

test("creates a job with JD and reference URL, then switches views", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "职位申请" }).click();
  await expect(page.locator("#application-board-title")).toHaveText("职位申请");
  await page.getByRole("textbox", { name: "公司", exact: true }).fill("E2E 公司");
  await page.getByRole("textbox", { name: "职位", exact: true }).fill("前端工程师");
  await page.locator('form[data-form="application"] .application-form__more > summary').click();
  await page.getByRole("textbox", { name: "招聘网址", exact: true }).fill("https://example.test/jobs/e2e");
  await page.getByRole("textbox", { name: "确认 JD 文本", exact: true }).fill("TypeScript React");
  await page.locator('form[data-form="application"] button[data-submit-application]').click({ force: true });
  await expect(page.locator(".application-card")).toContainText("E2E 公司");
  await page.getByRole("button", { name: "列表", exact: true }).click({ force: true });
  await expect(page.locator(".application-list-row")).toContainText("前端工程师");
  await page.reload();
  await expect(page.locator(".application-card")).toContainText("E2E 公司");
  await page.getByRole("button", { name: "详情" }).click({ force: true });
  await expect(page.locator(".application-detail__status")).toContainText("已载入");
  await page.locator('[data-detail-tab="jd"]').click({ force: true });
  await expect(page.locator(".application-detail-view")).toContainText("TypeScript React");
});

test("keeps long application names readable on mobile", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "职位申请" }).click();
  await expect(page.locator("#application-board-title")).toBeVisible();
  await expect(page.locator(".application-form")).toBeVisible();
});

test("drags a card to another column to change its stage", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "职位申请" }).click();
  await expect(page.locator("#application-board-title")).toHaveText("职位申请");
  await page.getByRole("textbox", { name: "公司", exact: true }).fill("拖拽公司");
  await page.getByRole("textbox", { name: "职位", exact: true }).fill("测试工程师");
  await page.getByRole("textbox", { name: "确认 JD 文本", exact: true }).fill("拖拽测试");
  await page.locator('form[data-form="application"] button[data-submit-application]').click({ force: true });
  const card = page.locator('.application-card', { hasText: "拖拽公司" });
  await expect(card).toBeVisible();
  await card.dispatchEvent("dragstart");
  const offerColumn = page.locator('.application-stage-column', { has: page.locator("h3 span", { hasText: "已获 Offer" }) });
  await offerColumn.dispatchEvent("dragover");
  await offerColumn.dispatchEvent("drop");
  await expect(offerColumn.locator('.application-card', { hasText: "拖拽公司" })).toBeVisible();
});
