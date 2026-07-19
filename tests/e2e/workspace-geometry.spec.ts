import { expect, test } from "@playwright/test";

test("disables and re-enables a wall without deleting its Outliner record", async ({ page }) => {
  await page.goto("/lab");
  await page.getByRole("button", { name: "partition center", exact: true }).click();
  await expect(page.getByTestId("hybrid-viewport-partition-a")).toBeVisible();
  await page.getByRole("button", { name: "Disable" }).click();
  await expect(page.getByTestId("hybrid-viewport-partition-a")).toHaveCount(0);
  const row = page.getByRole("button", { name: /partition center.*Off/ });
  await expect(row).toBeVisible();
  await row.click();
  await page.getByRole("button", { name: "Enable" }).click();
  await expect(page.getByTestId("hybrid-viewport-partition-a")).toBeVisible();
});

test("edits room dimensions and protects the floor", async ({ page }) => {
  await page.goto("/lab");
  await page.getByRole("button", { name: "Floor" }).click();
  await page.getByRole("textbox", { name: "Width" }).fill("10");
  await page.getByRole("textbox", { name: "Width" }).press("Enter");
  await page.getByRole("textbox", { name: "Height" }).fill("4");
  await page.getByRole("textbox", { name: "Height" }).press("Enter");
  await expect(page.getByRole("textbox", { name: "Width" })).toHaveValue("10");
  await expect(page.getByRole("textbox", { name: "Height" })).toHaveValue("4");
  await expect(page.getByRole("button", { name: "Disable" })).toHaveCount(0);
});

test("supports exact numeric input, arrows, and Escape cancel", async ({ page }) => {
  await page.goto("/");
  const x = page.getByRole("textbox", { name: "X position" });
  await x.fill("2.75 m");
  await x.press("Enter");
  await expect(x).toHaveValue("2.75");
  await x.press("ArrowUp");
  await expect(x).toHaveValue("2.85");
  await x.fill("9");
  await x.press("Escape");
  await expect(x).toHaveValue("2.85");
});

test("renders newly authored finite walls and hosted portals in the 3D viewport", async ({ page }) => {
  await page.goto("/lab");
  await page.getByTestId("add-object").click();
  await page.getByTestId("add-wall").click();
  await expect(page.locator('polygon[aria-label^="Select wall "]')).not.toHaveCount(0);
  await expect(page.getByTestId("hybrid-viewport-partition-a")).toBeVisible();

  await page.getByTestId("add-object").click();
  await page.getByTestId("add-portal").click();
  await expect(page.locator('[data-testid^="hybrid-viewport-portal-portal_"]')).toBeVisible();
  const bottom = page.getByRole("textbox", { name: "Bottom" });
  await bottom.fill("0.5");
  await bottom.press("Enter");
  await expect(bottom).toHaveValue("0.5");
});
