import { expect, test } from "@playwright/test";

test("adds Walls with two viewport points and requires that Wall for a Portal", async ({ page }) => {
  for (const mode of ["/classic", "/lab"] as const) {
    await page.goto(mode);
    const outliner = page.getByRole("complementary", { name: "Scene Outliner" });
    const before = await outliner.locator(".outliner-row.kind-wall").count();
    await page.getByTestId("add-object").click();
    await expect(page.getByTestId("add-portal")).toBeDisabled();
    await page.getByTestId("add-wall").click();
    await expect(page.getByRole("status")).toContainText("endpoint A");
    const surface = page.getByTestId(mode === "/classic" ? "wall-placement-surface" : "hybrid-wall-placement-surface");
    await surface.click({ position: { x: 280, y: 280 } });
    await expect(page.getByRole("status")).toContainText("endpoint B");
    await surface.click({ position: { x: 480, y: 320 } });
    await expect(outliner.locator(".outliner-row.kind-wall")).toHaveCount(before + 1);
    await page.getByTestId("add-object").click();
    await expect(page.getByTestId("add-portal")).toBeEnabled();
  }
});

test("Classic wall placement remains usable after viewport navigation", async ({ page }) => {
  await page.goto("/classic");
  const viewport = page.getByTestId("scene-canvas");
  const surface = page.getByTestId("wall-placement-surface");
  const outliner = page.getByRole("complementary", { name: "Scene Outliner" });
  const before = await outliner.locator(".outliner-row.kind-wall").count();
  await page.getByTestId("add-object").click();
  await page.getByTestId("add-wall").click();
  await expect(page.getByRole("status")).toContainText("endpoint A");

  const box = await viewport.boundingBox();
  if (!box) throw new Error("Classic viewport is not visible.");
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(box.x + box.width * 0.58, box.y + box.height * 0.56, { steps: 4 });
  await page.mouse.up({ button: "middle" });
  await viewport.hover();
  await page.mouse.wheel(0, -100);
  await expect(page.getByRole("status")).toContainText("endpoint A");

  await surface.click({ position: { x: 300, y: 260 } });
  await expect(page.getByRole("status")).toContainText("endpoint B");
  await surface.click({ position: { x: 480, y: 320 } });
  await expect(outliner.locator(".outliner-row.kind-wall")).toHaveCount(before + 1);
});

test("disables and re-enables a wall without deleting its Outliner record", async ({ page }) => {
  await page.goto("/lab");
  await page.getByRole("button", { name: "partition center", exact: true }).click();
  await expect(page.getByTestId("hybrid-viewport-partition-a")).toBeVisible();
  await expect(page.getByRole("button", { name: /Drag partition_door along its wall/ })).toBeVisible();
  await page.getByRole("button", { name: "Disable" }).click();
  await expect(page.getByTestId("hybrid-viewport-partition-a")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Drag partition_door along its wall/ })).toHaveCount(0);
  const row = page.getByRole("button", { name: /partition center.*Off/ });
  await expect(row).toBeVisible();
  await row.click();
  await page.getByRole("button", { name: "Enable" }).click();
  await expect(page.getByTestId("hybrid-viewport-partition-a")).toBeVisible();
  await expect(page.getByRole("button", { name: /Drag partition_door along its wall/ })).toBeVisible();
});

test("treats a disabled ceiling as an acoustic opening and restores it on Enable", async ({ page }) => {
  await page.goto("/lab");
  const status = page.locator(".workspace-statusbar");
  await expect(status).not.toContainText("RT60 —");
  const before = await status.textContent();
  await page.getByRole("complementary", { name: "Scene Outliner" }).getByRole("button", { name: "Ceiling", exact: true }).click();
  await page.getByRole("button", { name: "Disable", exact: true }).click();
  await expect(page.locator(".hybrid-viewport-ceiling")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Ceiling.*Off/ })).toBeVisible();
  await expect.poll(() => status.textContent()).not.toBe(before);
  await page.getByRole("button", { name: /Ceiling.*Off/ }).click();
  await page.getByRole("button", { name: "Enable", exact: true }).click();
  await expect(page.locator(".hybrid-viewport-ceiling")).toBeVisible();
});

test("edits room dimensions and protects the floor", async ({ page }) => {
  await page.goto("/lab");
  await page.getByRole("button", { name: "Room dimensions", exact: true }).click();
  await page.getByRole("textbox", { name: "Width" }).fill("10");
  await page.getByRole("textbox", { name: "Width" }).press("Enter");
  await page.getByRole("textbox", { name: "Height" }).fill("4");
  await page.getByRole("textbox", { name: "Height" }).press("Enter");
  await expect(page.getByRole("textbox", { name: "Width" })).toHaveValue("10");
  await expect(page.getByRole("textbox", { name: "Height" })).toHaveValue("4");
  await page.getByRole("button", { name: "Floor", exact: true }).click();
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
  await x.fill("99 m");
  await x.press("Enter");
  await expect(x).toHaveValue("2.85");
  await expect(page.getByText("Enter a value from 0 to 12 m.", { exact: true })).toBeVisible();
  await x.fill("9");
  await x.press("Escape");
  await expect(x).toHaveValue("2.85");
});

test("renders newly authored finite walls and hosted portals in the 3D viewport", async ({ page }) => {
  await page.goto("/lab");
  await page.getByTestId("add-object").click();
  await page.getByTestId("add-wall").click();
  const placement = page.getByTestId("hybrid-wall-placement-surface");
  await placement.click({ position: { x: 280, y: 280 } });
  await placement.click({ position: { x: 480, y: 320 } });
  await expect(page.locator("polygon.hybrid-viewport-wall-panel")).not.toHaveCount(0);
  await expect(page.getByTestId("hybrid-viewport-partition-a")).toBeVisible();

  await page.getByTestId("add-object").click();
  await page.getByTestId("add-portal").click();
  await expect(page.locator('[data-testid^="hybrid-viewport-portal-portal_"]')).toBeVisible();
  const bottom = page.getByRole("textbox", { name: "Bottom" });
  await bottom.fill("0.5");
  await bottom.press("Enter");
  await expect(bottom).toHaveValue("0.5");
});

test("precision-edits Wall endpoints and Portal offset without detaching hosted geometry", async ({ page }) => {
  await page.goto("/lab");
  const outliner = page.getByRole("complementary", { name: "Scene Outliner" });
  await outliner.getByRole("button", { name: "partition center", exact: true }).click();
  const endpointX = page.getByRole("textbox", { name: "Endpoint A X" });
  await endpointX.fill("5.5 m");
  await endpointX.press("Enter");
  await expect(endpointX).toHaveValue("5.5");

  await outliner.locator(".kind-portal").first().click();
  const offset = page.getByRole("textbox", { name: "Offset on Wall" });
  await offset.fill("2 m");
  await offset.press("Enter");
  await expect(offset).toHaveValue("2");
  await expect(page.getByRole("button", { name: /Drag partition_door along its wall/ })).toBeVisible();
  await page.waitForTimeout(200);
  await page.reload();
  await outliner.locator(".kind-portal").first().click();
  await expect(offset).toHaveValue("2");
});
