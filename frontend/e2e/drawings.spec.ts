import { expect, test } from "@playwright/test";
import { clickCandle, drawingsFor, waitForChart } from "./helpers";

test.describe("Drawing QC", () => {
  test("draws a horizontal and a trend, persists them, then deletes the last one", async ({ page }) => {
    await page.goto("/symbol/VCB");
    await waitForChart(page);
    await expect(page.getByRole("button", { name: "horizontal" })).toBeVisible();

    await page.getByRole("button", { name: "horizontal" }).click();
    const savedHorizontal = page.waitForResponse((res) => res.url().includes("/drawings") && res.request().method() === "PUT");
    await clickCandle(page, 80);
    await savedHorizontal;
    await expect(page.getByText("Saved")).toBeVisible();

    let rows = await drawingsFor(page, "VCB");
    expect(rows.map((row) => row.tool)).toEqual(["horizontal"]);
    expect(rows[0].points).toHaveLength(1);

    await page.getByRole("button", { name: "trend" }).click();
    const firstLeg = page.waitForResponse((res) => res.url().includes("/drawings") && res.request().method() === "PUT");
    await clickCandle(page, 40);
    await firstLeg;
    const secondLeg = page.waitForResponse((res) => res.url().includes("/drawings") && res.request().method() === "PUT");
    await clickCandle(page, 70);
    await secondLeg;
    await expect(page.getByText("Saved")).toBeVisible();

    rows = await drawingsFor(page, "VCB");
    expect(rows.map((row) => row.tool)).toEqual(["horizontal", "trend"]);
    expect(rows[1].points).toHaveLength(2);

    await page.reload();
    await waitForChart(page);
    rows = await drawingsFor(page, "VCB");
    expect(rows.map((row) => row.tool)).toEqual(["horizontal", "trend"]);

    await page.getByRole("button", { name: "delete selected" }).click();
    const deleted = page.waitForResponse((res) => res.url().includes("/drawings") && res.request().method() === "PUT");
    await clickCandle(page, 80);
    await deleted;
    rows = await drawingsFor(page, "VCB");
    expect(rows.map((row) => row.tool)).toEqual(["horizontal"]);
  });
});
