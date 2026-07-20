import { describe, expect, it } from "vitest";

import {
  DEFAULT_VIEWPORT_CAMERA,
  clampViewportCamera,
  frameViewportPoints,
  northViewportAngleDeg,
  projectViewportDepth,
  projectViewportPoint,
  unprojectViewportPointAtHeight,
  zoomViewportCameraAtPoint,
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
    expect(clampViewportCamera({ yawDeg: -45, pitchDeg: 100, zoom: 4, panX: 32, panY: -18 })).toEqual({
      yawDeg: 315,
      pitchDeg: 85,
      zoom: 4,
      panX: 32,
      panY: -18,
    });
    expect(clampViewportCamera({ yawDeg: 45, pitchDeg: -100, zoom: 1, panX: 0, panY: 0 })).toMatchObject({
      pitchDeg: -85,
    });
  });

  it("applies screen-space pan while preserving fixed-height round trips", () => {
    const camera = { ...DEFAULT_VIEWPORT_CAMERA, panX: 72, panY: -35 };
    const original = { x: 8.4, y: 1.7, z: 2.1 };
    const unpanned = projectViewportPoint(original, DEFAULT_VIEWPORT_CAMERA);
    const panned = projectViewportPoint(original, camera);
    const recovered = unprojectViewportPointAtHeight(panned, original.y, camera);

    expect(panned.x - unpanned.x).toBeCloseTo(72, 10);
    expect(panned.y - unpanned.y).toBeCloseTo(-35, 10);
    expect(recovered.x).toBeCloseTo(original.x, 10);
    expect(recovered.z).toBeCloseTo(original.z, 10);
  });

  it("keeps the projected anchor fixed during wheel zoom", () => {
    const anchor = { x: 810, y: 245 };
    const point = unprojectViewportPointAtHeight(anchor, 1.2, DEFAULT_VIEWPORT_CAMERA);
    const zoomed = zoomViewportCameraAtPoint(DEFAULT_VIEWPORT_CAMERA, anchor, 1.8);
    const projected = projectViewportPoint(point, zoomed);

    expect(projected.x).toBeCloseTo(anchor.x, 10);
    expect(projected.y).toBeCloseTo(anchor.y, 10);
  });

  it("frames a 50 metre scene inside the viewport padding", () => {
    const points = [
      { x: 0, y: 0, z: 0 },
      { x: 50, y: 0, z: 0 },
      { x: 50, y: 12, z: 50 },
      { x: 0, y: 12, z: 50 },
    ];
    const framed = frameViewportPoints(points, DEFAULT_VIEWPORT_CAMERA, 56);

    for (const point of points) {
      const projected = projectViewportPoint(point, framed);
      expect(projected.x).toBeGreaterThanOrEqual(56 - 1e-8);
      expect(projected.x).toBeLessThanOrEqual(1144 + 1e-8);
      expect(projected.y).toBeGreaterThanOrEqual(56 - 1e-8);
      expect(projected.y).toBeLessThanOrEqual(664 + 1e-8);
    }
  });

  it("provides a finite screen-space bearing for declared +Z north", () => {
    expect(Number.isFinite(northViewportAngleDeg(DEFAULT_VIEWPORT_CAMERA))).toBe(true);
  });

  it("orders orthographic surfaces by camera-space depth and reverses after a half orbit", () => {
    const near = { x: 6, y: 1, z: 6 };
    const far = { x: 6, y: 1, z: 2 };
    const forwardCamera = { yawDeg: 0, pitchDeg: 30, zoom: 1, panX: 0, panY: 0 };
    const reverseCamera = { ...forwardCamera, yawDeg: 180 };

    expect(projectViewportDepth(near, forwardCamera)).toBeGreaterThan(projectViewportDepth(far, forwardCamera));
    expect(projectViewportDepth(near, reverseCamera)).toBeLessThan(projectViewportDepth(far, reverseCamera));
  });

  it("keeps fixed-height dragging finite through a horizon-level camera view", () => {
    const recovered = unprojectViewportPointAtHeight(
      { x: 650, y: 330 },
      1.4,
      { yawDeg: 90, pitchDeg: 0, zoom: 1, panX: 0, panY: 0 },
    );

    expect(recovered).toSatisfy((point) => Number.isFinite(point.x) && Number.isFinite(point.z));
  });
});
