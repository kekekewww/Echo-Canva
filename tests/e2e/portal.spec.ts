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
  await expect(page.getByText("Route")).toBeVisible();
  await expect(page.getByText("Portal route")).toBeVisible();
  await expect(page.getByText(/partition_center/)).toBeVisible();
  await page.getByTestId("portal-partition_door").click();
  await page.getByRole("switch", { name: "Portal open" }).click();
  await expect(page.getByText("Blocked fallback")).toBeVisible();
  await expect(page.getByText(/portal-aware sound propagation/i)).toBeVisible();
});
