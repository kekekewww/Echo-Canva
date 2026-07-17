import { expect, test } from "@playwright/test";

test("a concrete partition becomes an occluded portal route when its door is open", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start Audio" }).click();
  await page.getByRole("button", { name: "Simulated" }).click();
  const listener = page.getByRole("button", { name: "Move listener" });
  await listener.focus();
  for (let step = 0; step < 20; step += 1) {
    await listener.press("ArrowDown");
  }
  const readout = page.getByRole("region", { name: "Acoustic preview status" });
  const metricValue = (label: string) =>
    readout.getByText(label, { exact: true }).locator("xpath=following-sibling::dd");

  await expect(readout.getByText("Route", { exact: true })).toBeVisible();
  await expect(readout.getByText("Portal route", { exact: true })).toBeVisible();
  await expect(readout.getByText("partition_center", { exact: true })).toBeVisible();
  await expect(metricValue("Effective distance")).toHaveText("6.61 m");
  await expect(metricValue("Direct gain")).toHaveText("-3.0 dB");
  await expect(metricValue("Low-pass")).toHaveText("18500 Hz");
  await expect(page.getByTestId("acoustic-route-overlay")).toHaveAttribute("data-source-id", "radio");
  await expect(page.getByTestId("acoustic-route-overlay")).toHaveAttribute("data-route-type", "portal");
  await expect(page.getByTestId("first-portal-route-marker")).toHaveAttribute("data-portal-id", "partition_door");
  await expect(page.getByTestId("wall-partition_center").locator(".wall-line")).toHaveClass(/is-occluder/);
  await expect(page.getByTestId("audio-diagnostics")).toHaveAttribute("data-acoustic-compute-source", "worker");
  await expect(page.getByTestId("audio-diagnostics")).toContainText(/Worker compute \d+\.\d ms/);
  await page.getByTestId("portal-partition_door").click();
  await page.getByRole("switch", { name: "Portal open" }).click();
  await expect(readout.getByText("Blocked fallback", { exact: true })).toBeVisible();
  await expect(page.getByTestId("wall-partition_center").locator(".wall-line")).toHaveClass(/is-occluder/);
  await expect(page.getByText(/portal-aware sound propagation/i)).toBeVisible();
});
