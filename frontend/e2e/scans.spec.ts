import { expect, test } from "@playwright/test";

test.describe("Scans QC", () => {
  test("shows stored named and look-alike hits, then opens Compare", async ({ page }) => {
    await page.goto("/scans");
    await expect(page.getByRole("heading", { name: "Scans" })).toBeVisible();

    const named = page.getByRole("region", { name: "Named pattern scan" });
    await expect(named.getByRole("link", { name: "HPG" })).toHaveAttribute("href", "/symbol/HPG?pattern=double_bottom");
    await expect(named.getByText("Forming")).toBeVisible();
    await expect(named.getByRole("cell", { name: "Double bottom" })).toBeVisible();

    const lookalike = page.getByRole("region", { name: "Look-alike" });
    await expect(lookalike.getByRole("button", { name: /Rise/ })).toBeVisible();
    await expect(lookalike.getByLabel("Reference")).toHaveValue("VCB");
    await expect(lookalike.getByRole("link", { name: "Compare" })).toHaveAttribute("href", /\/scans\/\d+\/compare\/HPG/);
    await expect(lookalike.getByRole("button", { name: "Scan" })).toBeEnabled();

    await lookalike.getByRole("link", { name: "Compare" }).click();
    await expect(page).toHaveURL(/\/scans\/\d+\/compare\/HPG/);
    await expect(page.getByText("VCB (Reference)")).toBeVisible();
    await expect(page.getByText("HPG (Match)")).toBeVisible();
    await expect(page.getByText("0.9100")).toBeVisible();
    await expect(page.locator(".chart-card")).toHaveCount(2);

    await page.locator(".back-link").click();
    await expect(page).toHaveURL(/\/scans$/);
  });
});
