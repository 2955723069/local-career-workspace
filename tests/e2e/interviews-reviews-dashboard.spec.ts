import { expect, test } from "@playwright/test";

test("shows dashboard aggregation and job type filter", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#dashboard-title")).toHaveText("求职进展总览");
  const filter = page.locator("#dashboard-job-type");
  await expect(filter).toBeVisible();
  await filter.selectOption("internship");
  await expect(page.locator(".dashboard-status")).toBeVisible();
  await filter.selectOption("");
  await expect(page.locator("#dashboard-today-title")).toContainText("今日面试");
});

test("keeps dashboard readable on mobile", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".dashboard-grid")).toBeVisible();
  await expect(page.locator("#dashboard-job-type")).toBeVisible();
});
