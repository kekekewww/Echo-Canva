import { expect, test } from "@playwright/test";

type RenderValidation = Readonly<{
  available: boolean;
  finite: boolean;
  peak: number;
  estimatedRt60Seconds: number;
  targetRt60Seconds: number;
  transitionMaxStep: number;
  transitionPeak: number;
}>;

declare global {
  interface Window {
    __echoCanvasRenderGateCValidation?: () => Promise<RenderValidation>;
  }
}

test("browser renders a finite, decay-controlled reverb and a continuous Raw/Simulated transition", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(
    () => typeof window.__echoCanvasRenderGateCValidation === "function",
  );

  const result = await page.evaluate(async () => {
    const probe = window.__echoCanvasRenderGateCValidation;
    if (!probe) throw new Error("Gate C browser audio-render validation probe is unavailable.");
    return probe();
  });

  expect(result.available).toBe(true);
  expect(result.finite).toBe(true);
  expect(result.peak).toBeGreaterThan(0);
  expect(result.peak).toBeLessThanOrEqual(1);
  expect(result.estimatedRt60Seconds).toBeGreaterThan(0);
  expect(result.estimatedRt60Seconds).toBeGreaterThanOrEqual(result.targetRt60Seconds * 0.8);
  expect(result.estimatedRt60Seconds).toBeLessThanOrEqual(result.targetRt60Seconds * 1.2);
  expect(result.transitionPeak).toBeGreaterThan(0);
  expect(result.transitionPeak).toBeLessThanOrEqual(1);
  expect(result.transitionMaxStep).toBeLessThan(0.1);
});
