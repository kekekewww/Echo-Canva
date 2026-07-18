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
  const plan = page.getByTestId("hybrid-plan-editor");
  const planRadio = page.getByTestId("hybrid-plan-radio");
  await expect(plan).toBeVisible();
  await planRadio.press("ArrowLeft");
  await planRadio.press("ArrowUp");
  await expect(planRadio).toHaveAttribute("data-position", "8.9,4.1");
  await expect(page.getByLabel("Radio plan X")).toHaveValue("8.9");
  await expect(page.getByLabel("Radio plan Z")).toHaveValue("4.1");

  const planBox = await plan.locator("svg").boundingBox();
  const radioCoreBox = await planRadio.locator(".hybrid-plan-source-core").boundingBox();
  if (!planBox || !radioCoreBox) throw new Error("Hybrid plan markers need a rendered bounding box.");
  await page.mouse.move(radioCoreBox.x + radioCoreBox.width / 2, radioCoreBox.y + radioCoreBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(planBox.x + planBox.width * (8 / 12), planBox.y + planBox.height * (4 / 8));
  await page.mouse.up();
  await expect(planRadio).toHaveAttribute("data-position", "8.0,4.0");

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

  await page.getByRole("link", { name: "Open Classic 2.5D" }).click();
  await expect(page).toHaveURL(/\/classic$/);
  await expect(page.getByTestId("app-shell")).toBeVisible();
});
