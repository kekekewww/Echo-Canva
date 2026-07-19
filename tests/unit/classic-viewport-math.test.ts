import { describe, expect, it } from "vitest";

import {
  clampClassicCamera,
  frameClassicBounds,
  projectClassicPoint,
  unprojectClassicPoint,
  zoomClassicCameraAtPoint,
} from "@/components/workspace/classic-viewport-math";

const WORLD = { minX: 0, minY: 0, width: 12, height: 8 } as const;
const VIEWPORT = { minX: 54, minY: 36, width: 792, height: 528 } as const;
const CAMERA = { yawDeg: 0, pitchDeg: 90, zoom: 1.35, panX: 68, panY: -31 } as const;

describe("Classic viewport math", () => {
  it("round-trips world coordinates through pan and zoom", () => {
    const original = { x: 8.25, y: 2.4 };
    const projected = projectClassicPoint(original, WORLD, VIEWPORT, CAMERA);
    const recovered = unprojectClassicPoint(projected, WORLD, VIEWPORT, CAMERA);

    expect(recovered.x).toBeCloseTo(original.x, 10);
    expect(recovered.y).toBeCloseTo(original.y, 10);
  });

  it("keeps the world point under the cursor fixed during zoom", () => {
    const anchor = { x: 720, y: 180 };
    const worldPoint = unprojectClassicPoint(anchor, WORLD, VIEWPORT, CAMERA);
    const zoomed = zoomClassicCameraAtPoint(CAMERA, anchor, VIEWPORT, 2.1);

    expect(projectClassicPoint(worldPoint, WORLD, VIEWPORT, zoomed).x).toBeCloseTo(anchor.x, 10);
    expect(projectClassicPoint(worldPoint, WORLD, VIEWPORT, zoomed).y).toBeCloseTo(anchor.y, 10);
  });

  it("frames projected points inside a padded viewport", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 12, y: 0 },
      { x: 12, y: 8 },
      { x: 0, y: 8 },
      { x: 14, y: 4 },
    ];
    const framed = frameClassicBounds(points, WORLD, VIEWPORT, CAMERA, 28);

    for (const point of points) {
      const screen = projectClassicPoint(point, WORLD, VIEWPORT, framed);
      expect(screen.x).toBeGreaterThanOrEqual(VIEWPORT.minX + 28 - 1e-8);
      expect(screen.x).toBeLessThanOrEqual(VIEWPORT.minX + VIEWPORT.width - 28 + 1e-8);
      expect(screen.y).toBeGreaterThanOrEqual(VIEWPORT.minY + 28 - 1e-8);
      expect(screen.y).toBeLessThanOrEqual(VIEWPORT.minY + VIEWPORT.height - 28 + 1e-8);
    }
  });

  it("rejects non-finite camera values", () => {
    expect(() => clampClassicCamera({ ...CAMERA, panX: Number.NaN })).toThrow(/finite/i);
  });
});
