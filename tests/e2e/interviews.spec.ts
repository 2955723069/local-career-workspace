import { expect, test } from "@playwright/test";

test("month view renders a 6x7 calendar grid", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "面试日历" }).click();
  await expect(page.locator("#interview-calendar-title")).toHaveText("面试日历");
  await page.getByRole("button", { name: "月", exact: true }).click({ force: true });
  await expect(page.locator(".calendar-grid")).toBeVisible();
  await expect(page.locator(".calendar-cell")).toHaveCount(42);
  await expect(page.locator(".calendar-grid__weekdays [role=columnheader]")).toHaveCount(7);
});

test("interview timezone is a select populated with IANA zones", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "面试日历" }).click();
  await expect(page.locator("#interview-calendar-title")).toHaveText("面试日历");
  const tz = page.locator('form[data-form="interview"] select[name="timezone"]');
  await expect(tz).toBeVisible();
  await expect(tz.locator("option", { hasText: "Asia/Shanghai" })).toHaveCount(1);
  const n = await tz.locator("option").count();
  expect(n).toBeGreaterThan(20);
});
