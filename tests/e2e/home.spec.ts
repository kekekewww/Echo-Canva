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
  await expect(radio).not.toHaveAttribute("data-azimuth", initialAzimuth ?? "");
  await expect(page.getByLabel("Radio plan X")).toHaveValue("11");
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
