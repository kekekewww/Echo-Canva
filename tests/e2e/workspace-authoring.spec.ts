import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

import { CONCRETE_PARTITION_PRESET } from "@/domain/presets/concrete-partition";

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

test("edits a local source and relinks missing audio without moving it", async ({ page }) => {
  await page.goto("/lab");
  await page.getByTestId("add-object").click();
  await page.getByTestId("add-source").click();
  await page.getByLabel("Import WAV / MP3 / Ogg").setInputFiles("public/audio/voice-loop.wav");
  const sourceRow = page.getByRole("complementary", { name: "Scene Outliner" }).getByRole("button", { name: "voice-loop" });
  await sourceRow.click();
  const xBefore = await page.getByRole("textbox", { name: "X position" }).inputValue();
  await page.getByRole("textbox", { name: "Source name" }).fill("Narration");
  await page.getByRole("textbox", { name: "Source name" }).press("Enter");
  await page.getByRole("textbox", { name: "Source gain" }).fill("-3 dB");
  await page.getByRole("textbox", { name: "Source gain" }).press("Enter");
  await page.getByRole("checkbox", { name: "Loop source" }).uncheck();

  await page.getByRole("button", { name: "Remove local audio" }).click();
  await page.getByRole("button", { name: "Remove audio", exact: true }).click();
  await expect(page.getByText("Relink required", { exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "X position" })).toHaveValue(xBefore);

  await page.getByLabel("Relink audio").setInputFiles("public/audio/water-loop.wav");
  await expect(page.getByText("Relink required", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "X position" })).toHaveValue(xBefore);
  await page.reload();
  await expect(page.getByRole("complementary", { name: "Scene Outliner" }).getByRole("button", { name: "Narration" })).toBeVisible();
});

test("exports, imports, and safely rejects complete authoring JSON", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Import / export").click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export authoring JSON" }).click();
  const path = await (await downloadPromise).path();
  if (!path) throw new Error("No exported scene path.");
  const json = await readFile(path, "utf8");
  expect(JSON.parse(json)).toMatchObject({
    format: "echo-canvas-authoring-project",
    version: "1.0",
    project: { schemaVersion: "2.0", mode: "classic-2d5d", listeners: expect.any(Array) },
    localAssets: expect.any(Array),
  });
  await page.getByLabel("Scene preset").selectOption("hard-room");
  await page.getByLabel("Import authoring JSON").setInputFiles({ name: "scene.json", mimeType: "application/json", buffer: Buffer.from(json) });
  await expect(page.getByRole("status")).toContainText("imported");
  await page.getByLabel("Import authoring JSON").setInputFiles({ name: "bad.json", mimeType: "application/json", buffer: Buffer.from("{") });
  await expect(page.getByRole("status")).toContainText("rejected");
});

test("compiles and applies a validated AI candidate", async ({ page }) => {
  const apiKey = "sk-or-v1-browser-key-1234567890";
  let suppliedKey: string | undefined;
  await page.route("**/api/scene/compile", async (route) => {
    suppliedKey = route.request().headers()["x-echo-openrouter-key"];
    const body = await route.request().postDataJSON() as { baseScene: object };
    await route.fulfill({ json: { ok: true, scene: { ...body.baseScene, name: "AI Studio" }, model: "gpt-5.6", repairAttempted: false, warnings: [] } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByLabel("OpenRouter API key").fill(apiKey);
  await page.getByRole("button", { name: "Save for this tab" }).click();
  await expect(page.getByRole("dialog", { name: "Workspace settings" })).toContainText("Ready for this tab");
  await page.getByRole("button", { name: "Close settings" }).click();
  await page.getByText("AI scene tools").click();
  await page.getByLabel("Describe a scene").fill("A compact treated studio");
  await page.getByRole("button", { name: "Generate scene" }).click();
  await expect(page.getByRole("button", { name: "Apply AI Studio" })).toBeVisible();
  await page.getByRole("button", { name: "Apply AI Studio" }).click();
  await expect(page.getByTestId("classic-workspace-viewport")).toContainText("AI Studio");
  expect(suppliedKey).toBe(apiKey);

  await page.reload();
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByLabel("OpenRouter API key")).toHaveValue(apiKey);
  await page.getByRole("button", { name: "Forget key" }).click();
  await expect(page.getByRole("dialog", { name: "Workspace settings" })).toContainText("Not configured");
  await expect(page.evaluate(() => sessionStorage.getItem("echo-canvas:openrouter-api-key:v1"))).resolves.toBeNull();
});

test("applies a mode-aware AI candidate to Hybrid room and object heights", async ({ page }) => {
  let requestedMode: unknown;
  await page.route("**/api/scene/compile", async (route) => {
    const body = await route.request().postDataJSON() as { baseScene: { baseScene: typeof CONCRETE_PARTITION_PRESET }; targetMode?: unknown };
    requestedMode = body.targetMode;
    const scene = structuredClone(body.baseScene.baseScene);
    scene.name = "AI Gallery";
    scene.room.outerPolygon = [{ x: 0, y: 0 }, { x: 14, y: 0 }, { x: 14, y: 10 }, { x: 0, y: 10 }];
    scene.room.heightM = 4.5;
    scene.listener.position = { x: 5, y: 3 };
    scene.sources[0]!.position = { x: 10, y: 7 };
    await route.fulfill({ json: {
      ok: true,
      scene,
      spatial3d: {
        listenerHeightM: 1.7,
        sourceHeights: scene.sources.map(({ id }, index) => ({ sourceId: id, heightM: index === 0 ? 1.4 : 3.2 })),
        wallVerticalBounds: scene.walls.map(({ id }) => ({ wallId: id, bottomM: 0, topM: id === "partition_center" ? 3.2 : 4.5 })),
        portalVerticalBounds: scene.portals.map(({ id }) => ({ portalId: id, bottomM: 0, topM: 2, thicknessM: 0.3 })),
        primitives: [],
      },
      model: "openai/gpt-5.6-luna",
      repairAttempted: false,
      warnings: [],
    } });
  });

  await page.goto("/lab");
  await page.getByText("AI scene tools").click();
  await page.getByLabel("Describe a scene").fill("A 14 by 10 by 4.5 metre gallery");
  await page.getByRole("button", { name: "Generate scene" }).click();
  await page.getByRole("button", { name: "Apply AI Gallery" }).click();

  expect(requestedMode).toBe("hybrid-3d");
  await page.getByRole("complementary", { name: "Scene Outliner" }).getByRole("button", { name: "Room" }).click();
  await expect(page.getByRole("textbox", { name: "Width" })).toHaveValue("14");
  await expect(page.getByRole("textbox", { name: "Depth" })).toHaveValue("10");
  await expect(page.getByRole("textbox", { name: "Height" })).toHaveValue("4.5");
  await page.getByRole("complementary", { name: "Scene Outliner" }).getByRole("button", { name: "Radio" }).click();
  await expect(page.getByRole("textbox", { name: "Y position" })).toHaveValue("1.4");
});

test("confirms permanent deletes and clears all local project data in two steps", async ({ page }) => {
  await page.goto("/lab");
  const outliner = page.getByRole("complementary", { name: "Scene Outliner" });
  await outliner.getByRole("button", { name: "partition center", exact: true }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  const confirmation = page.getByRole("alertdialog", { name: "Confirm delete" });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole("button", { name: "Cancel" }).click();
  await expect(outliner.getByRole("button", { name: "partition center", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await confirmation.getByRole("button", { name: "Delete wall" }).click();
  await expect(outliner.getByRole("button", { name: "partition center", exact: true })).toHaveCount(0);
  await expect(outliner.locator(".kind-portal")).toHaveCount(0);

  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Clear all local data" }).click();
  await expect(page.getByRole("dialog", { name: "Workspace settings" })).toContainText("both local projects");
  await page.getByRole("button", { name: "Confirm clear all" }).click();
  await expect(outliner.getByRole("button", { name: "partition center", exact: true })).toBeVisible();
});
