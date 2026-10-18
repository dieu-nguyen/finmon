import { expect, test } from "@playwright/test";

test.describe("Scans QC", () => {
  test("shows stored named and look-alike hits, filters matches, then opens Compare", async ({ page }) => {
    await page.goto("/scans");
    await expect(page.getByRole("heading", { name: "Scans" })).toBeVisible();

    const named = page.getByRole("region", { name: "Named patterns" });
    const summary = named.getByRole("region", { name: "Named pattern summary" });
    const matches = named.getByRole("table", { name: "Named matches" });
    const hpg = matches.getByRole("row").filter({ has: page.getByRole("link", { name: "HPG" }) });
    const vcb = matches.getByRole("row").filter({ has: page.getByRole("link", { name: "VCB" }) });

    await expect(summary.getByRole("table", { name: "Pattern counts" }).getByRole("row", { name: /Double bottom/ }).getByRole("cell")).toHaveText([
      "Double bottom",
      "1",
      "1",
      "2",
    ]);
    await expect(hpg.getByRole("link", { name: "HPG" })).toHaveAttribute("href", "/symbol/HPG?pattern=double_bottom");
    await expect(hpg.getByRole("cell", { name: "Double bottom" })).toBeVisible();
    await expect(hpg.getByRole("cell", { name: "Forming" })).toBeVisible();
    await expect(hpg.getByRole("link", { name: "Chart" })).toHaveAttribute("href", "/symbol/HPG?pattern=double_bottom");
    await expect(hpg.getByRole("link", { name: "Chart" })).toHaveAttribute("target", "_blank");
    await expect(vcb.getByRole("link", { name: "VCB" })).toHaveAttribute("href", "/symbol/VCB?pattern=double_bottom");
    await expect(vcb.getByRole("cell", { name: "Confirmed" })).toBeVisible();

    await named.getByRole("textbox", { name: "Ticker", exact: true }).fill("HPG");
    await named.getByRole("button", { name: "Search" }).click();
    await expect(hpg.getByRole("link", { name: "HPG" })).toBeVisible();
    await expect(matches.getByRole("link", { name: "VCB" })).toHaveCount(0);

    const lookalike = page.getByRole("region", { name: "Look-alike", exact: true });
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
