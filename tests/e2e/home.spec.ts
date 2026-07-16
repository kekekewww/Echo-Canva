import { expect, test } from "@playwright/test";

test("renders the accessible Echo Canvas application shell", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { level: 1, name: "Echo Canvas" }),
  ).toBeVisible();
  await expect(page.getByTestId("app-shell")).toBeVisible();
});
