import { describe, expect, it } from "vitest";

import {
  DEFAULT_VIEWPORT_CAMERA,
  clampViewportCamera,
  northViewportAngleDeg,
  projectViewportPoint,
  unprojectViewportPointAtHeight,
} from "@/components/lab/viewport-math";

describe("Hybrid Lab viewport math", () => {
  it("round-trips a finite object position through the fixed-height drag plane", () => {
    const original = { x: 9.1, y: 1.3, z: 3.4 };
    const screen = projectViewportPoint(original, DEFAULT_VIEWPORT_CAMERA);
    const recovered = unprojectViewportPointAtHeight(screen, original.y, DEFAULT_VIEWPORT_CAMERA);

    expect(recovered.x).toBeCloseTo(original.x, 10);
    expect(recovered.y).toBe(original.y);
    expect(recovered.z).toBeCloseTo(original.z, 10);
  });

  it("clamps an orbit camera to the supported pitch and zoom envelope", () => {
    expect(clampViewportCamera({ yawDeg: -45, pitchDeg: 100, zoom: 4 })).toEqual({
      yawDeg: 315,
      pitchDeg: 85,
      zoom: 1.7,
    });
    expect(clampViewportCamera({ yawDeg: 45, pitchDeg: -100, zoom: 1 })).toMatchObject({
      pitchDeg: -85,
    });
  });

  it("provides a finite screen-space bearing for declared +Z north", () => {
    expect(Number.isFinite(northViewportAngleDeg(DEFAULT_VIEWPORT_CAMERA))).toBe(true);
  });

  it("keeps fixed-height dragging finite through a horizon-level camera view", () => {
    const recovered = unprojectViewportPointAtHeight(
      { x: 650, y: 330 },
      1.4,
      { yawDeg: 90, pitchDeg: 0, zoom: 1 },
    );

    expect(recovered).toSatisfy((point) => Number.isFinite(point.x) && Number.isFinite(point.z));
  });
});
