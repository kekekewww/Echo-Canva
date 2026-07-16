import { describe, expect, it } from "vitest";

import playwrightConfig from "../../playwright.config";

describe("Playwright release server", () => {
  it("never reuses an existing server for the production acceptance suite", () => {
    expect(playwrightConfig.webServer).toMatchObject({ reuseExistingServer: false });
  });
});
