import { expect, test } from "@playwright/test";

test.describe("Market QC", () => {
  test("lists seeded names, pins a row, and opens the chart", async ({ page }) => {
    await page.goto("/market");
    await expect(page.getByText("finmon")).toBeVisible();
    await expect(page.locator(".status-pill")).toHaveText(/ok|stale|unconfigured/);
    await expect(page.getByRole("heading", { name: "Market" })).toBeVisible();
    await expect(page.getByText("VCB", { exact: true })).toBeVisible();
    await expect(page.getByText("Vietcombank")).toBeVisible();

    await page.getByRole("button", { name: "Funds" }).click();
    await expect(page.getByText("E1VFVN30")).toBeVisible();
    await expect(page.getByRole("button", { name: "HOSE" })).toHaveCount(0);

    await page.getByRole("button", { name: "Stocks" }).click();
    await page.getByLabel("Search").fill("HPG");
    await expect(page.getByText("Hoa Phat")).toBeVisible();
    await expect(page.getByText("Vietcombank")).toHaveCount(0);

    await page.getByLabel("Search").fill("");
    await expect(page.getByText("Vietcombank")).toBeVisible();
    await page.getByRole("button", { name: "Pin" }).first().click();
    await expect(page.getByRole("button", { name: "Unpin" })).toBeVisible();

    await page.getByText("Vietcombank").click();
    await expect(page).toHaveURL(/\/symbol\/VCB/);
    await expect(page.getByRole("heading", { name: "VCB" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Market" })).toHaveClass(/active/);
  });
});
