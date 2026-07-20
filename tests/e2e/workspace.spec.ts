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

test("persists compact Undo history across refresh", async ({ page }) => {
  await page.goto("/classic");
  const x = page.getByRole("textbox", { name: "X position" });
  const original = await x.inputValue();
  await x.fill("4.25");
  await x.press("Enter");
  await page.waitForTimeout(200);
  await page.reload();
  await expect(x).toHaveValue("4.25");
  await page.getByTitle("Undo (Ctrl+Z)").click();
  await expect(x).toHaveValue(original);
});

test("coalesces continuous numeric scrubbing into one Undo command", async ({ page }) => {
  await page.goto("/classic");
  const x = page.getByRole("textbox", { name: "X position" });
  const original = await x.inputValue();
  const scrub = page.getByRole("button", { name: "Drag to adjust X position" });
  const box = await scrub.boundingBox();
  if (!box) throw new Error("Numeric scrub control is not visible.");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 25, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect(x).not.toHaveValue(original);
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => {
    const raw = localStorage.getItem("echo-canvas:project:classic:v1");
    return raw ? (JSON.parse(raw) as { past: unknown[] }).past.length : -1;
  })).toBe(1);
  await page.getByTitle("Undo (Ctrl+Z)").click();
  await expect(x).toHaveValue(original);
  await page.waitForTimeout(200);
  const persistedCommands = await page.evaluate(() => {
    const raw = localStorage.getItem("echo-canvas:project:classic:v1");
    return raw ? (JSON.parse(raw) as { past: unknown[] }).past.length : -1;
  });
  expect(persistedCommands).toBe(0);
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
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(page.getByRole("alertdialog", { name: "Reset active project" })).toBeVisible();
  await page.getByRole("button", { name: "Reset project" }).click();
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

test("Classic viewport supports pan navigation, Home and Frame All", async ({ page }) => {
  await page.goto("/classic");
  const viewport = page.getByTestId("scene-canvas");
  const source = viewport.locator('[data-testid^="source-"]').first();
  const sourcePosition = await source.getAttribute("data-position");
  const box = await viewport.boundingBox();
  if (!box) throw new Error("Classic viewport is not visible.");

  await expect(viewport).toHaveAttribute("data-camera", /.+/);
  const initialCamera = await viewport.getAttribute("data-camera");
  await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.5);
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(box.x + box.width * 0.66, box.y + box.height * 0.58, { steps: 4 });
  await page.mouse.up({ button: "middle" });
  await expect(viewport).not.toHaveAttribute("data-camera", initialCamera ?? "");
  await expect(source).toHaveAttribute("data-position", sourcePosition ?? "");

  const middlePanCamera = await viewport.getAttribute("data-camera");
  await page.keyboard.down("Shift");
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.28, box.y + box.height * 0.26, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.up("Shift");
  await expect(viewport).not.toHaveAttribute("data-camera", middlePanCamera ?? "");

  const scroll = await page.evaluate(() => scrollY);
  await viewport.hover();
  await page.mouse.wheel(0, -120);
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(scroll);

  await page.getByRole("button", { name: "Home", exact: true }).click();
  await expect(viewport).toHaveAttribute("data-camera", /,1\.00,0\.0,0\.0$/);
  await page.getByRole("button", { name: "Frame All", exact: true }).click();
  await expect(viewport).not.toHaveAttribute("data-camera", initialCamera ?? "");
  const framedCamera = await viewport.getAttribute("data-camera");
  await page.waitForTimeout(180);
  await page.reload();
  await expect(viewport).toHaveAttribute("data-camera", framedCamera ?? "");
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

test("Hybrid viewport adds pan navigation without stealing object height editing", async ({ page }) => {
  await page.goto("/lab");
  const viewport = page.getByTestId("hybrid-spatial-viewport");
  const svg = viewport.locator("svg.hybrid-viewport-svg");
  const source = viewport.locator('[data-testid^="hybrid-viewport-source-"]').first();
  const sourceBeforePan = await source.getAttribute("data-position");
  const sourceBox = await source.boundingBox();
  if (!sourceBox) throw new Error("Hybrid source is not visible.");

  const initialCamera = await viewport.getAttribute("data-camera");
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(sourceBox.x + sourceBox.width / 2 + 70, sourceBox.y + sourceBox.height / 2 + 35, { steps: 4 });
  await page.mouse.up({ button: "middle" });
  await expect(viewport).not.toHaveAttribute("data-camera", initialCamera ?? "");
  await expect(source).toHaveAttribute("data-position", sourceBeforePan ?? "");

  const afterMiddlePan = await viewport.getAttribute("data-camera");
  const svgBox = await svg.boundingBox();
  if (!svgBox) throw new Error("Hybrid SVG is not visible.");
  await page.keyboard.down("Shift");
  await page.mouse.move(svgBox.x + svgBox.width * 0.18, svgBox.y + svgBox.height * 0.18);
  await page.mouse.down();
  await page.mouse.move(svgBox.x + svgBox.width * 0.27, svgBox.y + svgBox.height * 0.24, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.up("Shift");
  await expect(viewport).not.toHaveAttribute("data-camera", afterMiddlePan ?? "");

  const sourceBeforeHeight = await source.getAttribute("data-position");
  const movedSourceBox = await source.boundingBox();
  if (!movedSourceBox) throw new Error("Panned Hybrid source is not visible.");
  await page.keyboard.down("Shift");
  await page.mouse.move(movedSourceBox.x + movedSourceBox.width / 2, movedSourceBox.y + movedSourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(movedSourceBox.x + movedSourceBox.width / 2, movedSourceBox.y + movedSourceBox.height / 2 - 35, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.up("Shift");
  await expect(source).not.toHaveAttribute("data-position", sourceBeforeHeight ?? "");

  await page.getByRole("button", { name: "Home", exact: true }).click();
  await expect(viewport).toHaveAttribute("data-camera", /,1\.00,0\.0,0\.0$/);
  await page.getByRole("button", { name: "Frame All", exact: true }).click();
  await expect(viewport).not.toHaveAttribute("data-camera", initialCamera ?? "");
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

test("keeps the viewport primary and exposes modal drawers on narrow screens", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 800 });
  await page.goto("/lab");
  await expect(page.getByTestId("hybrid-spatial-viewport")).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Scene Outliner" })).toHaveCount(0);
  await page.getByRole("button", { name: "Scene", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Scene Outliner" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Scene Outliner" })).toHaveCount(0);
  await page.getByRole("button", { name: "Inspector", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Inspector" })).toBeVisible();
});

test("survives the full entity-limit project within Worker and interaction budgets", async ({ page }) => {
  await page.goto("/lab");
  await page.getByLabel("Scene preset").selectOption("stress-100-walls");
  await page.waitForTimeout(250);
  const stressCache = await page.evaluate(() => {
    type Point = { x: number; y: number };
    type Wall = { id: string; a: Point; b: Point; thicknessM: number };
    type Source = { id: string; name: string; clipId: string; sourceType: "point"; position: Point; gainDb: number; loop: boolean };
    type Listener = { id: string; name: string; position: { x: number; y: number; z: number }; headingDeg: number; enabled: boolean };
    type Present = {
      revision: number;
      scene: { revision: number; walls: Wall[]; portals: unknown[]; sources: Source[] };
      listeners: Listener[];
      activeListenerId: string;
      selection: { type: string; id: string };
      sourceHeightsM: Record<string, number>;
      portal3dById: Record<string, { bottomM: number; topM: number; thicknessM: number }>;
    };
    const key = "echo-canvas:project:hybrid:v1";
    const raw = localStorage.getItem(key);
    if (!raw) throw new Error("Hybrid cache was not created.");
    const cache = JSON.parse(raw) as { present: Present; past: unknown[]; future: unknown[] };
    const project = cache.present;
    const host = project.scene.walls.find(({ id }) => id === "stress_boundary_north");
    const baseSource = project.scene.sources[0];
    if (!host || !baseSource) throw new Error("Stress fixture is incomplete.");
    project.listeners = Array.from({ length: 8 }, (_, index) => ({
      id: `stress_listener_${index}`,
      name: `Stress Listener ${index + 1}`,
      position: { x: 1 + index, y: 1.5, z: 1 + (index % 4) },
      headingDeg: index * 15,
      enabled: true,
    }));
    project.activeListenerId = project.listeners[0]!.id;
    project.selection = { type: "listener", id: project.activeListenerId };
    project.scene.sources = Array.from({ length: 4 }, (_, index) => ({
      ...baseSource,
      id: `stress_source_${index}`,
      name: `Stress Source ${index + 1}`,
      position: { x: 8 + index * 0.7, y: 6 + index * 0.35 },
    }));
    project.sourceHeightsM = Object.fromEntries(project.scene.sources.map(({ id }, index) => [id, 1 + index * 0.4]));
    project.scene.portals = Array.from({ length: 8 }, (_, index) => ({
      id: `stress_portal_${index}`,
      wallId: host.id,
      center: { x: 0.8 + index * 1.45, y: 0 },
      widthM: 0.6,
      heightM: 2,
      open: index % 2 === 0,
      lossDb: 3,
    }));
    project.portal3dById = Object.fromEntries(project.scene.portals.map((portal, index) => [`stress_portal_${index}`, {
      bottomM: 0,
      topM: 2,
      thicknessM: 0.12,
    }]));
    project.revision += 1;
    project.scene.revision = project.revision;
    cache.past = [];
    cache.future = [];
    return JSON.stringify(cache);
  });
  await page.addInitScript(({ cache }) => {
    const marker = "echo-canvas:stress-cache-installed";
    if (sessionStorage.getItem(marker)) return;
    localStorage.setItem("echo-canvas:project:hybrid:v1", cache);
    sessionStorage.setItem(marker, "1");
  }, { cache: stressCache });
  await page.reload();

  const outliner = page.getByRole("complementary", { name: "Scene Outliner" });
  await expect(outliner.locator(".kind-wall")).toHaveCount(100);
  await expect(outliner.locator(".kind-portal")).toHaveCount(8);
  await expect(outliner.locator(".kind-source")).toHaveCount(4);
  await expect(outliner.locator(".kind-listener")).toHaveCount(8);
  await page.getByTestId("add-object").click();
  await expect(page.getByTestId("add-listener")).toBeDisabled();
  await expect(page.getByTestId("add-source")).toBeDisabled();
  await expect(page.getByTestId("add-wall")).toBeDisabled();
  await expect(page.getByTestId("add-portal")).toBeDisabled();
  await expect(page.getByRole("dialog", { name: "Add object" })).toContainText("Limit: 100 walls");
  await page.getByRole("dialog", { name: "Add object" }).getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByTestId("unified-workspace")).toHaveAttribute("data-audio-contexts", "1");
  await expect(page.getByTestId("unified-workspace")).toHaveAttribute("data-audio-graphs", "4");
  await expect.poll(async () => page.locator(".workspace-statusbar").getAttribute("data-worker-compute-ms"))
    .not.toBe("");
  const expectedWorkerCount = await page.evaluate(() => {
    const sourceCount = 4;
    const hardwareConcurrency = navigator.hardwareConcurrency;
    const capacity = !Number.isFinite(hardwareConcurrency) || hardwareConcurrency <= 0
      ? 1
      : Math.min(4, Math.max(1, Math.floor(hardwareConcurrency) - 2));
    return Math.min(sourceCount, capacity);
  });
  const statusbar = page.locator(".workspace-statusbar");
  await expect(statusbar).toHaveAttribute("data-worker-count", String(expectedWorkerCount));
  if (expectedWorkerCount >= 2) {
    expect(Number(await statusbar.getAttribute("data-worker-count"))).toBeGreaterThanOrEqual(2);
  }

  for (let index = 0; index < 3; index += 1) {
    await outliner.locator(".kind-listener").nth(index).click();
    await page.waitForTimeout(120);
  }
  await page.evaluate(() => {
    const state = window as Window & {
      __echoLongTasks?: number[];
      __echoLongTaskObserver?: PerformanceObserver;
      __echoLongTaskObserverActive?: boolean;
    };
    state.__echoLongTasks = [];
    state.__echoLongTaskObserverActive = true;
    state.__echoLongTaskObserver = new PerformanceObserver((list) => {
      state.__echoLongTasks?.push(...list.getEntries().map(({ duration }) => duration));
    });
    state.__echoLongTaskObserver.observe({ type: "longtask", buffered: false });
  });
  const timings: number[] = [];
  for (let index = 0; index < 24; index += 1) {
    await outliner.locator(".kind-listener").nth(index % 8).click();
    await page.waitForTimeout(120);
    const value = Number(await page.locator(".workspace-statusbar").getAttribute("data-worker-compute-ms"));
    if (Number.isFinite(value)) timings.push(value);
  }
  expect(await page.evaluate(() => (
    window as Window & { __echoLongTaskObserverActive?: boolean }
  ).__echoLongTaskObserverActive)).toBe(true);
  const longTasks = await page.evaluate(() => {
    const state = window as Window & {
      __echoLongTasks?: number[];
      __echoLongTaskObserver?: PerformanceObserver;
      __echoLongTaskObserverActive?: boolean;
    };
    state.__echoLongTasks?.push(...(state.__echoLongTaskObserver?.takeRecords().map(({ duration }) => duration) ?? []));
    state.__echoLongTaskObserver?.disconnect();
    state.__echoLongTaskObserverActive = false;
    return state.__echoLongTasks ?? [];
  });
  const sorted = timings.toSorted((a, b) => a - b);
  expect(sorted.length).toBeGreaterThan(0);
  expect(sorted[Math.ceil(sorted.length * 0.95) - 1]).toBeLessThan(12);
  expect(longTasks.every((duration) => duration <= 50)).toBe(true);

  await page.getByRole("button", { name: "2.5D", exact: true }).click();
  await page.getByRole("button", { name: "3D", exact: true }).click();
  await expect(page.getByTestId("unified-workspace")).toHaveAttribute("data-audio-contexts", "1");
  await expect(page.getByTestId("unified-workspace")).toHaveAttribute("data-audio-graphs", "4");
  for (let refresh = 0; refresh < 2; refresh += 1) {
    await page.reload();
    await expect(outliner.locator(".kind-wall")).toHaveCount(100);
    await expect(outliner.locator(".kind-portal")).toHaveCount(8);
    await expect(outliner.locator(".kind-source")).toHaveCount(4);
    await expect(outliner.locator(".kind-listener")).toHaveCount(8);
  }
});
