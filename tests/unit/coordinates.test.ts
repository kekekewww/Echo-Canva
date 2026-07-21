import { describe, expect, it } from "vitest";

import { clientPointToSvg, svgToWorld, worldToSvg } from "@/domain/editor/coordinates";

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

  it("removes vertical letterboxing for a 3:2 viewBox in a narrow 22rem-high rect", () => {
    const renderedRect = { minX: 10, minY: 20, width: 320, height: 352 };
    const viewBox = { minX: 0, minY: 0, width: 900, height: 600 };

    const top = clientPointToSvg({ x: 170, y: 89.3333333333 }, renderedRect, viewBox);
    const bottom = clientPointToSvg({ x: 170, y: 302.6666666667 }, renderedRect, viewBox);

    expect(top.x).toBeCloseTo(450, 10);
    expect(top.y).toBeCloseTo(0, 8);
    expect(bottom.x).toBeCloseTo(450, 10);
    expect(bottom.y).toBeCloseTo(600, 8);
  });

  it("removes horizontal pillarboxing for preserveAspectRatio meet", () => {
    const renderedRect = { minX: 20, minY: 30, width: 1200, height: 600 };
    const viewBox = { minX: 0, minY: 0, width: 900, height: 600 };

    const left = clientPointToSvg({ x: 170, y: 330 }, renderedRect, viewBox);
    const right = clientPointToSvg({ x: 1070, y: 330 }, renderedRect, viewBox);

    expect(left).toEqual({ x: 0, y: 300 });
    expect(right).toEqual({ x: 900, y: 300 });
  });
});
