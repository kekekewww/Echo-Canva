import { expect, test } from "@playwright/test";

test("renders the accessible Echo Canvas application shell", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { level: 1, name: "Echo Canvas" }),
  ).toBeVisible();
  await expect(page.getByTestId("app-shell")).toBeVisible();
});

test("keeps an explicit Classic route while the Hybrid lab isolates its beta solver", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/lab");
  await expect(page.getByTestId("hybrid-lab")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Hybrid 3D Lab" })).toBeVisible();
  await expect(page.getByTestId("hybrid-direct-lab")).toBeVisible();
  const viewport = page.getByTestId("hybrid-spatial-viewport");
  const viewportRadio = page.getByTestId("hybrid-viewport-radio");
  await expect(viewport).toBeVisible();
  await expect(viewportRadio).toHaveAttribute("data-position", "9.0,1.3,4.0");
  const initialCamera = await viewport.getAttribute("data-camera");
  const viewportBox = await viewport.locator("svg").boundingBox();
  if (!viewportBox) throw new Error("Hybrid 3D viewport needs a rendered bounding box.");
  await page.mouse.move(viewportBox.x + 24, viewportBox.y + 24);
  await page.mouse.down();
  await page.mouse.move(viewportBox.x + 118, viewportBox.y + 68);
  await page.mouse.up();
  await expect(viewport).not.toHaveAttribute("data-camera", initialCamera ?? "");
  const cameraAfterOrbit = await viewport.getAttribute("data-camera");
  await viewport.hover();
  const pageScrollBeforeViewportWheel = await page.evaluate(() => window.scrollY);
  await page.mouse.wheel(0, 120);
  await expect(viewport).not.toHaveAttribute("data-camera", cameraAfterOrbit ?? "");
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(pageScrollBeforeViewportWheel);
  const viewportRadioCore = await viewportRadio.locator(".hybrid-viewport-source-core").boundingBox();
  if (!viewportRadioCore) throw new Error("Hybrid 3D source needs a rendered bounding box.");
  await page.mouse.move(viewportRadioCore.x + viewportRadioCore.width / 2, viewportRadioCore.y + viewportRadioCore.height / 2);
  await page.mouse.down();
  await page.mouse.move(viewportRadioCore.x - 50, viewportRadioCore.y + 25);
  await page.mouse.up();
  await expect(viewportRadio).not.toHaveAttribute("data-position", "9.0,1.3,4.0");

  await page.locator("summary", { hasText: "Open orthographic X/Z and Y reference maps" }).click();
  const plan = page.getByTestId("hybrid-plan-editor");
  const planRadio = page.getByTestId("hybrid-plan-radio");
  await expect(plan).toBeVisible();
  const planRadioPosition = await planRadio.getAttribute("data-position");
  if (!planRadioPosition) throw new Error("Hybrid plan radio needs a position.");
  const [planRadioX, planRadioZ] = planRadioPosition.split(",").map(Number);
  await planRadio.press("ArrowLeft");
  await planRadio.press("ArrowUp");
  await expect(planRadio).toHaveAttribute(
    "data-position",
    `${(planRadioX! - 0.1).toFixed(1)},${(planRadioZ! + 0.1).toFixed(1)}`,
  );
  await expect(page.getByLabel("Radio plan X")).toHaveValue((planRadioX! - 0.1).toFixed(1));
  await expect(page.getByLabel("Radio plan Z")).toHaveValue((planRadioZ! + 0.1).toFixed(1));

  const planBox = await plan.locator(".hybrid-plan-svg").boundingBox();
  const radioCoreBox = await planRadio.locator(".hybrid-plan-source-core").boundingBox();
  if (!planBox || !radioCoreBox) throw new Error("Hybrid plan markers need a rendered bounding box.");
  await page.mouse.move(radioCoreBox.x + radioCoreBox.width / 2, radioCoreBox.y + radioCoreBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(planBox.x + planBox.width * (8 / 12), planBox.y + planBox.height * (4 / 8));
  await page.mouse.up();
  await expect(planRadio).toHaveAttribute("data-position", "8.0,4.0");

  const heightEditor = page.getByTestId("hybrid-height-editor");
  const heightRadio = page.getByTestId("hybrid-height-radio");
  await expect(heightEditor).toBeVisible();
  await heightRadio.press("ArrowUp");
  await expect(heightRadio).toHaveAttribute("data-height", "1.4");
  await expect(page.getByLabel("Radio elevation")).toHaveValue("1.4");
  const heightBox = await heightEditor.locator("svg").boundingBox();
  const heightCoreBox = await heightRadio.locator(".hybrid-height-marker-core").boundingBox();
  if (!heightBox || !heightCoreBox) throw new Error("Hybrid elevation markers need a rendered bounding box.");
  await page.mouse.move(heightCoreBox.x + heightCoreBox.width / 2, heightCoreBox.y + heightCoreBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(heightCoreBox.x + heightCoreBox.width / 2, heightBox.y + heightBox.height * (89 / 260));
  await page.mouse.up();
  await expect(heightRadio).toHaveAttribute("data-height", "2.0");
  await expect(page.getByLabel("Radio elevation")).toHaveValue("2");

  const radio = page.getByTestId("direct-radio");
  await expect(radio).toHaveAttribute("data-route", "direct");
  await expect(radio).toHaveAttribute("data-audible-reflections", /[1-6]/);
  await page.getByRole("button", { name: "Disable 3D first-order reflections" }).click();
  await expect(page.getByTestId("hybrid-direct-lab").locator(".audio-control"))
    .toHaveAttribute("data-reflections-enabled", "false");
  await expect(radio).toHaveAttribute("data-audible-reflections", "0");
  await page.getByRole("button", { name: "Enable 3D first-order reflections" }).click();
  await expect(radio).toHaveAttribute("data-audible-reflections", /[1-6]/);
  const initialAzimuth = await radio.getAttribute("data-azimuth");
  await page.getByLabel("Radio plan X").fill("11");
  await expect(page.getByLabel("Radio plan X")).toHaveValue("11");
  await page.getByLabel("Radio plan Z").fill("5");
  await expect(radio).not.toHaveAttribute("data-azimuth", initialAzimuth ?? "");
  const initialElevation = await radio.getAttribute("data-elevation");
  await page.getByLabel("Radio elevation").fill("2.8");
  await expect.poll(() => pageErrors).toEqual([]);
  await expect(radio).not.toHaveAttribute("data-elevation", initialElevation ?? "");
  await page.getByRole("button", { name: "Close partition portal" }).click();
  await expect(radio).toHaveAttribute("data-route", "blocked");
  await expect(radio).toHaveAttribute("data-render-route", "blocked");
  await page.getByLabel("Radio plan Z").fill("1.5");
  await page.getByLabel("Radio elevation").fill("1.5");
  await page.getByLabel("Listener plan Z").fill("1.5");
  await page.getByRole("button", { name: "Open partition portal" }).click();
  await expect(radio).toHaveAttribute("data-route", "blocked");
  await expect(radio).toHaveAttribute("data-render-route", "portal");
  await expect(radio).toContainText("Audible route portal");
  await page.getByRole("button", { name: "Close partition portal" }).click();
  await expect(radio).toHaveAttribute("data-render-route", "blocked");

  const partitionControls = page.getByTestId("hybrid-partition-controls");
  const partitionEndpointA = page.getByTestId("hybrid-viewport-partition-a");
  const partitionEndpointAPosition = await partitionEndpointA.getAttribute("data-position");
  await partitionEndpointA.scrollIntoViewIfNeeded();
  const partitionEndpointABox = await partitionEndpointA.locator(".hybrid-viewport-partition-handle-core").boundingBox();
  if (!partitionEndpointABox) throw new Error("Partition endpoint A needs a rendered drag handle.");
  await page.mouse.move(partitionEndpointABox.x + partitionEndpointABox.width / 2, partitionEndpointABox.y + partitionEndpointABox.height / 2);
  await page.mouse.down();
  await page.mouse.move(partitionEndpointABox.x + 34, partitionEndpointABox.y + 18);
  await page.mouse.up();
  await expect(partitionEndpointA).not.toHaveAttribute("data-position", partitionEndpointAPosition ?? "");
  await expect.poll(() => pageErrors).toEqual([]);
  const endpointAAfterDrag = await partitionEndpointA.getAttribute("data-position");
  if (!endpointAAfterDrag) throw new Error("Partition endpoint A position should remain readable.");
  const [, endpointAZ] = endpointAAfterDrag.split(",");
  await page.getByLabel("Partition endpoint A X").fill("5");
  await expect(page.getByTestId("hybrid-viewport-partition-a")).toHaveAttribute("data-position", `5.0,${endpointAZ}`);
  await page.getByLabel("Partition material").selectOption("wood_medium");
  await expect(page.getByLabel("Partition material")).toHaveValue("wood_medium");
  await page.getByLabel("Portal width").fill("1.8");
  await expect(partitionControls).toContainText("Portal width: 1.80 m");
  const portalHandle = page.getByTestId("hybrid-viewport-portal-handle");
  const portalPosition = await portalHandle.getAttribute("data-position");
  await portalHandle.scrollIntoViewIfNeeded();
  const portalHandleBox = await portalHandle.locator(".hybrid-viewport-portal-handle-core").boundingBox();
  if (!portalHandleBox) throw new Error("Portal needs a rendered drag handle.");
  await page.mouse.move(portalHandleBox.x, portalHandleBox.y);
  await page.mouse.down();
  await page.mouse.move(portalHandleBox.x + 28, portalHandleBox.y - 18);
  await page.mouse.up();
  await expect(portalHandle).not.toHaveAttribute("data-position", portalPosition ?? "");

  const atmosphere = page.getByTestId("atmosphere-preview");
  const speed = atmosphere.locator("[data-speed-mps]");
  const initialSpeed = await speed.getAttribute("data-speed-mps");
  await page.getByLabel("Atmosphere temperature").fill("0");
  await expect(speed).not.toHaveAttribute("data-speed-mps", initialSpeed ?? "");
  await expect(page.getByLabel("Atmosphere temperature")).toHaveValue("0");
  const highFrequencyLoss = atmosphere.locator("[data-loss-4khz-db]");
  const initialHighFrequencyLoss = await highFrequencyLoss.getAttribute("data-loss-4khz-db");
  await page.getByLabel("Atmosphere relative humidity").fill("90");
  await expect(highFrequencyLoss).not.toHaveAttribute("data-loss-4khz-db", initialHighFrequencyLoss ?? "");
  await page.getByLabel("Atmosphere pressure").fill("900");
  await expect(page.getByLabel("Atmosphere pressure")).toHaveValue("900");
  await expect(atmosphere).toContainText("do not yet alter this Lab's HRTF");

  await page.getByRole("link", { name: "Open Classic 2.5D" }).click();
  await expect(page).toHaveURL(/\/classic$/);
  await expect(page.getByTestId("app-shell")).toBeVisible();
});
