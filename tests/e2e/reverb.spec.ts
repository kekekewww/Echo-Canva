import { expect, test } from "@playwright/test";

async function roomMetrics(page: import("@playwright/test").Page) {
  const metrics = page.getByTestId("room-acoustic-diagnostics");
  await expect(metrics).toBeVisible();
  return metrics;
}

test("reverb diagnostics distinguish hard and treated rooms without overstating the model", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("Scene preset").selectOption("hard-room");
  await expect(page.getByRole("heading", { name: "Hard Room" })).toBeVisible();

  const hardMetrics = await roomMetrics(page);
  await expect(hardMetrics).toHaveAttribute("data-frame-revision", /^\d+$/);
  await expect(hardMetrics.getByText("Estimated Eyring RT60", { exact: true })).toBeVisible();
  await expect(hardMetrics.getByText("Low", { exact: true })).toBeVisible();
  await expect(hardMetrics.getByText("Mid", { exact: true })).toBeVisible();
  await expect(hardMetrics.getByText("High", { exact: true })).toBeVisible();
  await expect(hardMetrics.getByText("First-order early reflections", { exact: true })).toBeVisible();
  await expect(page.getByTestId("early-reflection-path")).toHaveCount(4);
  const hardRevision = await hardMetrics.getAttribute("data-frame-revision");
  const hardMid = Number(await hardMetrics.getAttribute("data-rt60-mid"));

  await page.getByLabel("Scene preset").selectOption("treated-room");
  await expect(page.getByRole("heading", { name: "Treated Room" })).toBeVisible();
  const treatedMetrics = await roomMetrics(page);
  await expect(treatedMetrics).toHaveAttribute("data-frame-revision", /^\d+$/);
  await expect(treatedMetrics).not.toHaveAttribute("data-frame-revision", hardRevision!);
  await expect(treatedMetrics.getByText("First-order early reflections", { exact: true })).toBeVisible();
  await expect(page.getByTestId("early-reflection-path")).toHaveCount(4);

  const treatedMid = Number(await treatedMetrics.getAttribute("data-rt60-mid"));
  expect(hardMid).toBeGreaterThan(treatedMid);
  await expect(page.getByText("Interactive acoustic approximation", { exact: true })).toBeVisible();
  await expect(page.getByText(/not an architectural-acoustics measurement/i)).toBeVisible();
});
