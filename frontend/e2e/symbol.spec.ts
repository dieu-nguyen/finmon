import { expect, test } from "@playwright/test";

test.describe("Symbol QC", () => {
  test("loads the chart, company cache, note, alert, and stored scan", async ({ page }) => {
    await page.goto("/symbol/VCB");
    await expect(page.getByRole("heading", { name: "VCB" })).toBeVisible();
    await expect(page.locator(".quote-name")).toHaveText("Vietcombank");
    await expect(page.locator(".chart-frame")).toBeVisible();
    await expect(page.getByText("No daily bars for VCB")).toHaveCount(0);

    await expect(page.getByText("Ngân hàng TMCP Ngoại thương Việt Nam")).toBeVisible();
    await expect(page.getByText("Revenue")).toBeVisible();

    await page.getByRole("button", { name: "Note" }).click();
    await page.getByLabel("Note").fill("QC thesis: hold VCB");
    await page.getByRole("button", { name: "Save note" }).click();
    await expect(page.getByText("Saved")).toBeVisible();

    await page.getByRole("button", { name: "Alert" }).click();
    await page.getByLabel("Price").fill("92000");
    await page.getByRole("button", { name: "Add alert" }).click();
    await expect(page.getByText("Saved")).toBeVisible();

    await page.getByRole("button", { name: "Scan" }).click();
    await expect(page.getByRole("button", { name: /Double bottom · Confirmed/ })).toHaveAttribute("aria-pressed", "true");
  });
});
