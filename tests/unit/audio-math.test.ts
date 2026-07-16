import { describe, expect, it } from "vitest";

import {
  clampFinite,
  dbToLinear,
  distanceAttenuation,
  equalPowerCrossfade,
  linearToDb,
} from "@/audio/math";

describe("audio math", () => {
  it("converts between decibels and linear amplitude", () => {
    expect(dbToLinear(0)).toBe(1);
    expect(dbToLinear(-6)).toBeCloseTo(0.501187, 6);
    expect(linearToDb(0.5)).toBeCloseTo(-6.0206, 4);
  });

  it("uses deterministic inverse-style manual distance attenuation", () => {
    expect(distanceAttenuation(0.25)).toBe(1);
    expect(distanceAttenuation(1)).toBe(1);
    expect(distanceAttenuation(2)).toBeCloseTo(0.5);
    expect(distanceAttenuation(10, { rolloffFactor: 0.5 })).toBeCloseTo(1 / 5.5);
  });

  it("clamps invalid and extreme values to finite bounds", () => {
    expect(clampFinite(Number.NaN, 0, 1, 0.25)).toBe(0.25);
    expect(clampFinite(Number.POSITIVE_INFINITY, 0, 1, 0.25)).toBe(0.25);
    expect(clampFinite(-10, 0, 1, 0.25)).toBe(0);
    expect(clampFinite(10, 0, 1, 0.25)).toBe(1);
    expect(distanceAttenuation(Number.NaN)).toBe(1);
  });

  it("returns equal-power raw and simulated crossfade coefficients", () => {
    expect(equalPowerCrossfade(0)).toEqual({ raw: 1, simulated: 0 });
    expect(equalPowerCrossfade(1)).toEqual({ raw: 0, simulated: 1 });

    const midpoint = equalPowerCrossfade(0.5);
    expect(midpoint.raw).toBeCloseTo(Math.SQRT1_2);
    expect(midpoint.simulated).toBeCloseTo(Math.SQRT1_2);
    expect(midpoint.raw ** 2 + midpoint.simulated ** 2).toBeCloseTo(1);
  });
});
