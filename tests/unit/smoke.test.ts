import { describe, expect, it } from "vitest";

import { APP_NAME } from "@/domain/app-meta";

describe("application metadata", () => {
  it("uses the stable product name", () => {
    expect(APP_NAME).toBe("Echo Canvas");
  });
});
