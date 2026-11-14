import { expect, test } from "@playwright/test";

test.describe("Alerts QC", () => {
  test("creates and deletes a price alert through the live API", async ({ page }) => {
    await page.goto("/alerts");
    await expect(page.getByRole("heading", { name: /Alerts/ })).toBeVisible();

    await page.getByLabel("Ticker").fill("hpg");
    await page.getByLabel("Condition").selectOption("lte");
    await page.getByLabel("Price").fill("26500");
    await page.getByLabel("Frequency").selectOption("repeat");
    await page.getByRole("button", { name: "Add alert" }).click();

    await expect(page.getByText("HPG")).toBeVisible();
    await expect(page.getByRole("cell", { name: "repeat" })).toBeVisible();
    await expect(page.getByLabel("Ticker")).toHaveValue("");

    await page.getByRole("button", { name: "Delete HPG" }).click();
    await expect(page.getByText("HPG")).toHaveCount(0);
  });
});
