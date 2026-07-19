import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import nextConfig from "../../next.config";

describe("development shell", () => {
  it("allows the loopback host used by the local test browser", () => {
    expect(nextConfig.allowedDevOrigins).toContain("127.0.0.1");
  });

  it("provides an application icon route", () => {
    expect(existsSync(resolve(process.cwd(), "src/app/icon.svg"))).toBe(true);
  });
});
