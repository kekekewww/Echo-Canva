import { expect, test } from "@playwright/test";

test("shows matched direct and first-order 3D paths with presentation controls", async ({ page }) => {
  await page.goto("/lab");
  const overlay = page.getByTestId("hybrid-path-overlay");
  await expect(overlay).toBeVisible();
  await expect(overlay.locator('[data-path-kind="reflection"]')).not.toHaveCount(0);
  await expect(overlay.locator('[data-source-id="radio"]')).not.toHaveCount(0);
  await expect(overlay.locator('[data-source-id="rain"]')).toHaveCount(0);
  await page.getByRole("button", { name: "All paths" }).click();
  await expect(overlay.locator('[data-source-id="rain"]')).not.toHaveCount(0);
  await page.getByRole("button", { name: "Paths", exact: true }).click();
  await expect(overlay).toHaveCount(0);
  await page.getByRole("button", { name: "Paths", exact: true }).click();
  await expect(overlay).toBeVisible();
  await page.getByTestId("hybrid-spatial-viewport").getByRole("button", { name: "Ceiling" }).click();
  await expect(page.locator(".hybrid-viewport-ceiling")).toHaveCount(0);
  await expect(overlay).toBeVisible();
});

test("keeps the production audio render gate finite and continuous", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => typeof window.__echoCanvasRenderGateCValidation === "function");
  const result = await page.evaluate(() => window.__echoCanvasRenderGateCValidation!());
  expect(result.available).toBe(true);
  expect(result.finite).toBe(true);
  expect(result.transitionMaxStepRatio).toBeLessThanOrEqual(0.01);
});
