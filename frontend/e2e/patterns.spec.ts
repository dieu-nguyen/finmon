import { expect, test } from "@playwright/test";

test.describe("Patterns QC", () => {
  test("searches the catalog and keeps a favorite after reload", async ({ page }) => {
    await page.goto("/patterns");
    await expect(page.getByRole("heading", { name: "Patterns" })).toBeVisible();
    await expect(page.getByRole("article", { name: "Double bottom" })).toBeVisible();

    await page.getByRole("searchbox", { name: "Search patterns" }).fill("flag");
    await expect(page.getByRole("article", { name: "Bull flag" })).toBeVisible();
    await expect(page.getByRole("article", { name: "Bear flag" })).toBeVisible();
    await expect(page.getByRole("article", { name: "Double bottom" })).toHaveCount(0);

    await page.getByRole("searchbox", { name: "Search patterns" }).fill("");
    await page.getByRole("button", { name: "Favorite Cup and handle" }).click();
    await expect(page.getByRole("button", { name: "Favorited Cup and handle" })).toBeVisible();

    const first = page.locator(".pattern-card").first();
    await expect(first).toHaveAttribute("aria-label", "Cup and handle");

    await page.reload();
    await expect(page.locator(".pattern-card").first()).toHaveAttribute("aria-label", "Cup and handle");
  });
});
