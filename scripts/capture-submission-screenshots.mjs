import { mkdir } from "node:fs/promises";

import { chromium } from "@playwright/test";

const baseUrl = process.env.ECHO_CANVAS_DEMO_URL ?? "https://echo-canva.vercel.app";
const outputDirectory = "artifacts/release/screenshots";

await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });

try {
  const classic = await context.newPage();
  await classic.goto(`${baseUrl}/classic`, { waitUntil: "networkidle" });
  await classic.screenshot({ path: `${outputDirectory}/public-classic.png` });

  const hybrid = await context.newPage();
  await hybrid.goto(`${baseUrl}/lab`, { waitUntil: "networkidle" });
  await hybrid.screenshot({ path: `${outputDirectory}/public-hybrid.png` });

  const aiTools = await context.newPage();
  await aiTools.goto(`${baseUrl}/classic`, { waitUntil: "networkidle" });
  await aiTools.getByText("AI scene tools", { exact: true }).click();
  await aiTools.locator("textarea").fill(
    "A compact concrete passage with an open east doorway, rain outside, and a radio behind a partition.",
  );
  await aiTools.screenshot({ path: `${outputDirectory}/public-ai-tools.png` });
} finally {
  await browser.close();
}
