import { describe, expect, it } from "vitest";

import {
  parseNumericInput,
  scrubbedNumericValue,
} from "@/components/workspace/NumericScrubField";

describe("NumericScrubField", () => {
  it("parses exact values with optional unit suffixes", () => {
    expect(parseNumericInput("2.75 m", "m")).toBe(2.75);
    expect(parseNumericInput("-30°", "°")).toBe(-30);
    expect(parseNumericInput("noise", "m")).toBeNull();
  });

  it("clamps typed values to the configured range", () => {
    expect(parseNumericInput("80 m", "m", 0, 50)).toBe(50);
    expect(parseNumericInput("-3 m", "m", 0, 50)).toBe(0);
  });

  it("supports normal, Shift-fine, and Ctrl-snapped scrubbing", () => {
    expect(scrubbedNumericValue(2, 10, { step: 0.1, fineStep: 0.01 })).toBe(3);
    expect(scrubbedNumericValue(2, 10, { step: 0.1, fineStep: 0.01, shiftKey: true })).toBe(2.1);
    expect(scrubbedNumericValue(2.03, 10, { step: 0.1, fineStep: 0.01, ctrlKey: true })).toBe(3);
  });
});
