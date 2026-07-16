import { describe, expect, it } from "vitest";

import { svgToWorld, worldToSvg } from "@/domain/editor/coordinates";

const worldBounds = { minX: 0, minY: 0, width: 12, height: 8 };
const viewport = { minX: 36, minY: 24, width: 828, height: 552 };

describe("editor coordinate transforms", () => {
  it("maps world corners into the padded SVG viewport with Y inverted", () => {
    expect(worldToSvg({ x: 0, y: 0 }, worldBounds, viewport)).toEqual({ x: 36, y: 576 });
    expect(worldToSvg({ x: 12, y: 8 }, worldBounds, viewport)).toEqual({ x: 864, y: 24 });
  });

  it.each([
    { x: 0, y: 0 },
    { x: 3.125, y: 6.75 },
    { x: 12, y: 8 },
  ])("round trips $x m, $y m within numeric tolerance", (point) => {
    const transformed = worldToSvg(point, worldBounds, viewport);
    const roundTrip = svgToWorld(transformed, worldBounds, viewport);

    expect(roundTrip.x).toBeCloseTo(point.x, 10);
    expect(roundTrip.y).toBeCloseTo(point.y, 10);
  });

  it("does not mutate input values", () => {
    const point = Object.freeze({ x: 3, y: 4 });

    worldToSvg(point, worldBounds, viewport);
    svgToWorld(point, worldBounds, viewport);

    expect(point).toEqual({ x: 3, y: 4 });
  });
});
