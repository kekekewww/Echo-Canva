import { expect, test } from "@playwright/test";

test("preserves and downloads an unreadable project cache", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("echo-canvas:project:classic:v1", "{unreadable-cache");
  });
  await page.goto("/classic");
  await expect(page.getByText("Project cache recovery", { exact: true })).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download unread cache" }).click();
  expect((await download).suggestedFilename()).toBe("echo-canvas-classic-2d5d-unread-cache.txt");
  await expect(page.getByTestId("classic-workspace-viewport")).toContainText("Concrete Partition");
});

test("continues in memory and exposes a persistent warning when browser storage is unavailable", async ({ page }) => {
  await page.addInitScript(() => {
    (window as Window & { __echoCanvasSimulateStorageFailure?: boolean }).__echoCanvasSimulateStorageFailure = true;
    Object.defineProperty(window, "indexedDB", { configurable: true, get: () => { throw new Error("indexedDB denied"); } });
  });
  await page.goto("/classic");
  await expect(page.getByText("Memory-only warning", { exact: true })).toBeVisible();
  const x = page.getByRole("textbox", { name: "X position" });
  await x.fill("4");
  await x.press("Enter");
  await expect(x).toHaveValue("4");
});

test("keeps authoring available when Workers cannot start", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "Worker", {
      configurable: true,
      value: class UnavailableWorker { constructor() { throw new Error("worker denied"); } },
    });
  });
  await page.goto("/lab");
  await expect(page.locator(".workspace-statusbar")).toContainText("Fallback");
  const x = page.getByRole("textbox", { name: "X position" });
  await x.fill("4.2");
  await x.press("Enter");
  await expect(x).toHaveValue("4.2");
});

test("preserves scene edits and offers Retry after audio startup fails", async ({ page }) => {
  await page.addInitScript(() => {
    const unavailable = class UnavailableAudioContext { constructor() { throw new Error("audio denied"); } };
    Object.defineProperty(window, "AudioContext", { configurable: true, value: unavailable });
    Object.defineProperty(window, "webkitAudioContext", { configurable: true, value: unavailable });
  });
  await page.goto("/classic");
  const x = page.getByRole("textbox", { name: "X position" });
  await x.fill("4.4");
  await x.press("Enter");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.locator(".workspace-error")).toContainText("audio denied");
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  await expect(x).toHaveValue("4.4");
});
