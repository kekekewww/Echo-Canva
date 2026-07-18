import { expect, test } from "@playwright/test";

test("renders the accessible Echo Canvas application shell", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { level: 1, name: "Echo Canvas" }),
  ).toBeVisible();
  await expect(page.getByTestId("app-shell")).toBeVisible();
});

test("keeps an explicit Classic route while the Hybrid lab is gated", async ({ page }) => {
  await page.goto("/lab");
  await expect(page.getByTestId("hybrid-lab")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Hybrid 3D Lab" })).toBeVisible();
  await expect(page.getByText(/not yet enabled/i)).toBeVisible();

  await page.getByRole("link", { name: "Open Classic 2.5D" }).click();
  await expect(page).toHaveURL(/\/classic$/);
  await expect(page.getByTestId("app-shell")).toBeVisible();
});
