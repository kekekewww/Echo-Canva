import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test("adds and activates listeners and enforces the source workflow", async ({ page }) => {
  await page.goto("/lab");
  await page.getByTestId("add-object").evaluate((element) => (element as HTMLButtonElement).click());
  await page.getByTestId("add-listener").click();
  await expect(page.getByRole("complementary", { name: "Scene Outliner" }).getByRole("button", { name: "Listener 2 Active" })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Scene Outliner" }).getByText("Active")).toHaveCount(1);

  await page.getByTestId("add-object").evaluate((element) => (element as HTMLButtonElement).click());
  await page.getByTestId("add-source").click();
  await expect(page.getByRole("dialog", { name: "Choose source audio" })).toBeVisible();
  await page.getByRole("button", { name: "Voice loop" }).click();
  await expect(page.getByRole("complementary", { name: "Scene Outliner" }).getByRole("button", { name: "Voice loop" })).toBeVisible();
  await expect(page.locator('[data-testid^="hybrid-viewport-source-"]')).toHaveCount(3);
});

test("exports, imports, and safely rejects scene JSON", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Import / export").click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export scene JSON" }).click();
  const path = await (await downloadPromise).path();
  if (!path) throw new Error("No exported scene path.");
  const json = await readFile(path, "utf8");
  expect(JSON.parse(json)).toMatchObject({ schemaVersion: "1.0" });
  await page.getByLabel("Scene preset").selectOption("hard-room");
  await page.getByLabel("Import scene JSON").setInputFiles({ name: "scene.json", mimeType: "application/json", buffer: Buffer.from(json) });
  await expect(page.getByRole("status")).toContainText("imported");
  await page.getByLabel("Import scene JSON").setInputFiles({ name: "bad.json", mimeType: "application/json", buffer: Buffer.from("{") });
  await expect(page.getByRole("status")).toContainText("rejected");
});

test("compiles and applies a validated AI candidate", async ({ page }) => {
  await page.route("**/api/scene/compile", async (route) => {
    const body = await route.request().postDataJSON() as { baseScene: object };
    await route.fulfill({ json: { ok: true, scene: { ...body.baseScene, name: "AI Studio" }, model: "gpt-5.6", repairAttempted: false, warnings: [] } });
  });
  await page.goto("/");
  await page.getByText("AI scene tools").click();
  await page.getByLabel("Describe a scene").fill("A compact treated studio");
  await page.getByRole("button", { name: "Generate scene" }).click();
  await expect(page.getByRole("button", { name: "Apply AI Studio" })).toBeVisible();
  await page.getByRole("button", { name: "Apply AI Studio" }).click();
  await expect(page.getByTestId("classic-workspace-viewport")).toContainText("AI Studio");
});
