import { expect, test } from "@playwright/test";

test("authors basic acoustic shapes in Hybrid 3D", async ({ page }) => {
  await page.goto("/lab");
  await page.getByTestId("add-object").click();
  await page.getByTestId("add-box").click();

  await expect(page.getByRole("heading", { name: "Box", exact: true })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Scene Outliner" }).locator(".kind-primitive")).toHaveCount(1);
  await expect(page.locator('[data-testid^="hybrid-primitive-box_"]')).toBeVisible();

  const surfaceLayer = page.getByTestId("hybrid-geometry-surface-layer");
  await expect(surfaceLayer.locator('[data-surface-kind="wall"]')).not.toHaveCount(0);
  await expect(surfaceLayer.locator('[data-surface-kind="primitive"]')).not.toHaveCount(0);
  const depths = await surfaceLayer.locator("[data-surface-depth]").evaluateAll((nodes) =>
    nodes.map((node) => Number(node.getAttribute("data-surface-depth"))));
  expect(depths).toEqual([...depths].sort((left, right) => left - right));

  await page.getByRole("textbox", { name: "Width" }).fill("2.5 m");
  await page.getByRole("textbox", { name: "Width" }).press("Enter");
  await page.getByRole("textbox", { name: "Y position" }).fill("1.8 m");
  await page.getByRole("textbox", { name: "Y position" }).press("Enter");
  await page.getByRole("combobox", { name: "Primitive material" }).selectOption("acoustic_treatment");
  await expect(page.getByRole("textbox", { name: "Width" })).toHaveValue("2.5");
  await expect(page.getByRole("textbox", { name: "Y position" })).toHaveValue("1.8");

  await page.getByRole("button", { name: "Disable", exact: true }).click();
  await expect(page.locator('[data-testid^="hybrid-primitive-box_"]')).toHaveCount(0);
  await page.getByRole("button", { name: /Box 1.*Off/ }).click();
  await page.getByRole("button", { name: "Enable", exact: true }).click();
  await expect(page.locator('[data-testid^="hybrid-primitive-box_"]')).toBeVisible();
});

test("authors and restores faceted shapes in Classic 2.5D", async ({ page }) => {
  await page.goto("/classic");
  await page.getByTestId("add-object").click();
  await page.getByTestId("add-cylinder").click();
  await expect(page.locator('[data-testid^="classic-primitive-cylinder_"]')).toBeVisible();
  await expect(page.getByText("Faceted acoustic approximation", { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.locator('[data-testid^="classic-primitive-cylinder_"]')).toBeVisible();
  await page.getByRole("button", { name: "Cylinder 1", exact: true }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: "Delete primitive", exact: true }).click();
  await expect(page.locator('[data-testid^="classic-primitive-cylinder_"]')).toHaveCount(0);
});
