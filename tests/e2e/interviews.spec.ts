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
