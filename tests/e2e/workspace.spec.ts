import { expect, test } from "@playwright/test";

test("renders one modelling workspace on every route", async ({ page }) => {
  for (const [route, mode] of [["/", "classic-2d5d"], ["/classic", "classic-2d5d"], ["/lab", "hybrid-3d"]] as const) {
    await page.goto(route);
    const workspace = page.getByTestId("unified-workspace");
    await expect(workspace).toBeVisible();
    await expect(workspace).toHaveAttribute("data-mode", mode);
    await expect(page.getByRole("complementary", { name: "Scene Outliner" })).toBeVisible();
    await expect(page.getByRole("complementary", { name: "Inspector" })).toBeVisible();
  }
});

test("preserves independent mode state across switches and refresh", async ({ page }) => {
  await page.goto("/");
  const x = page.getByRole("textbox", { name: "X position" });
  await x.fill("2.25 m");
  await x.press("Enter");
  await page.getByRole("button", { name: "3D", exact: true }).click();
  await expect(x).toHaveValue("3");
  await x.fill("4.5");
  await x.press("Enter");
  await page.getByRole("button", { name: "2.5D", exact: true }).click();
  await expect(x).toHaveValue("2.25");
  await page.reload();
  await expect(x).toHaveValue("2.25");
  await page.getByRole("button", { name: "3D", exact: true }).click();
  await expect(x).toHaveValue("4.5");
});

test("keeps one AudioContext and toolbar audition state while switching modes", async ({ page }) => {
  await page.goto("/");
  const workspace = page.getByTestId("unified-workspace");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeVisible();
  await expect(workspace).toHaveAttribute("data-audio-contexts", "1");
  const initialGraphs = await workspace.getAttribute("data-audio-graphs");

  await page.getByRole("button", { name: "3D", exact: true }).click();

  await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeVisible();
  await expect(workspace).toHaveAttribute("data-audio-contexts", "1");
  await expect(workspace).toHaveAttribute("data-audio-graphs", initialGraphs ?? "2");
  await page.getByRole("button", { name: "Raw", exact: true }).click();
  await expect(page.getByRole("button", { name: "Simulated", exact: true })).toBeVisible();
});

test("resets only the active mode and can undo reset", async ({ page }) => {
  await page.goto("/lab");
  const x = page.getByRole("textbox", { name: "X position" });
  await x.fill("5");
  await x.press("Enter");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(x).toHaveValue("3");
  await page.getByTitle("Undo (Ctrl+Z)").click();
  await expect(x).toHaveValue("5");
});

test("contains wheel zoom inside the 3D viewport and reports no page errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/lab");
  const viewport = page.getByTestId("hybrid-spatial-viewport");
  const before = await viewport.getAttribute("data-camera");
  const scroll = await page.evaluate(() => scrollY);
  await viewport.hover();
  await page.mouse.wheel(0, 120);
  await expect(viewport).not.toHaveAttribute("data-camera", before ?? "");
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(scroll);
  expect(errors).toEqual([]);
});

test("restores each mode camera and overlay preferences after switching and refresh", async ({ page }) => {
  await page.goto("/lab");
  const viewport = page.getByTestId("hybrid-spatial-viewport");
  await viewport.hover();
  await page.mouse.wheel(0, -120);
  const camera = await viewport.getAttribute("data-camera");
  await page.getByRole("button", { name: "Paths", exact: true }).click();

  await page.getByRole("button", { name: "2.5D", exact: true }).click();
  await page.getByRole("button", { name: "3D", exact: true }).click();
  await expect(viewport).toHaveAttribute("data-camera", camera ?? "");
  await expect(page.getByRole("button", { name: "Paths", exact: true })).toHaveAttribute("aria-pressed", "false");

  await page.reload();
  await expect(viewport).toHaveAttribute("data-camera", camera ?? "");
  await expect(page.getByRole("button", { name: "Paths", exact: true })).toHaveAttribute("aria-pressed", "false");
});

test("restores the 100-wall project and keeps Outliner selection within the interaction budget", async ({ page }) => {
  await page.goto("/classic");
  await page.getByLabel("Scene preset").selectOption("stress-100-walls");
  const outliner = page.getByRole("complementary", { name: "Scene Outliner" });
  await expect(outliner.locator(".outliner-row.kind-wall")).toHaveCount(100);

  const durationMs = await page.evaluate(async () => {
    const button = [...document.querySelectorAll<HTMLButtonElement>('.workspace-outliner button')]
      .find((candidate) => candidate.textContent?.includes("stress 50"));
    if (!button) throw new Error("Stress wall was not rendered.");
    const rendered = new Promise<void>((resolve) => {
      const observer = new MutationObserver(() => {
        if (button.getAttribute("aria-pressed") === "true") {
          observer.disconnect();
          resolve();
        }
      });
      observer.observe(button, { attributes: true, attributeFilter: ["aria-pressed"] });
    });
    const start = performance.now();
    button.click();
    await rendered;
    return performance.now() - start;
  });
  expect(durationMs).toBeLessThan(50);

  await page.reload();
  await expect(outliner.locator(".outliner-row.kind-wall")).toHaveCount(100);
});
