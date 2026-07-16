import { expect, test } from "@playwright/test";

test("audio lifecycle is explicit, persistent, and error-free", async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));
  await page.goto("/");

  const diagnostics = page.getByTestId("audio-diagnostics");
  await expect(diagnostics).toHaveAttribute("data-status", "idle");
  await expect(diagnostics).toHaveAttribute("data-context-creations", "0");
  await expect(page.getByText("Audio awaits an explicit gesture.")).toBeVisible();
  const readout = page.getByRole("region", { name: "Acoustic preview status" });
  await expect(readout.getByText("Raw source gain")).toBeVisible();
  await expect(readout.getByText("-3.0 dB")).toBeVisible();

  await page.getByRole("button", { name: "Start Audio" }).click();
  await expect(diagnostics).toHaveAttribute("data-status", "running");
  await expect(diagnostics).toHaveAttribute("data-context-creations", "1");
  await expect(diagnostics).toHaveAttribute("data-source-starts", "2");
  await expect(page.getByText(/Browser spatializer running/i)).toBeVisible();

  await page.getByRole("button", { name: "Simulated" }).click();
  await expect(diagnostics).toHaveAttribute("data-mode", "simulated");
  await expect(readout.getByText("Simulated direct gain")).toBeVisible();
  const applyCountBefore = Number(await diagnostics.getAttribute("data-apply-count"));
  await page.getByTestId("source-radio").focus();
  await page.getByTestId("source-radio").press("ArrowRight");
  await expect.poll(async () => Number(await diagnostics.getAttribute("data-apply-count")))
    .toBeGreaterThan(applyCountBefore);

  await page.getByRole("button", { name: "Stop Audio" }).click();
  await expect(diagnostics).toHaveAttribute("data-status", "suspended");
  await page.getByRole("button", { name: "Start Audio" }).click();
  await expect(diagnostics).toHaveAttribute("data-status", "running");
  await expect(diagnostics).toHaveAttribute("data-context-creations", "1");
  await expect(diagnostics).toHaveAttribute("data-source-starts", "2");
  await expect(page.getByText(/Audio error/i)).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});
