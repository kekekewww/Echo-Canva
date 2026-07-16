import type { Vec2 } from "@/domain/scene/types";

export type Rect = Readonly<{
  minX: number;
  minY: number;
  width: number;
  height: number;
}>;

function assertRect(rect: Rect, label: string): void {
  if (
    !Number.isFinite(rect.minX) ||
    !Number.isFinite(rect.minY) ||
    !Number.isFinite(rect.width) ||
    !Number.isFinite(rect.height) ||
    rect.width <= 0 ||
    rect.height <= 0
  ) {
    throw new RangeError(`${label} must be finite with positive dimensions`);
  }
}

export function worldToSvg(
  point: Readonly<Vec2>,
  worldBounds: Rect,
  viewport: Rect,
): Vec2 {
  assertRect(worldBounds, "World bounds");
  assertRect(viewport, "SVG viewport");

  return {
    x:
      viewport.minX +
      ((point.x - worldBounds.minX) / worldBounds.width) * viewport.width,
    y:
      viewport.minY +
      (1 - (point.y - worldBounds.minY) / worldBounds.height) * viewport.height,
  };
}

export function svgToWorld(
  point: Readonly<Vec2>,
  worldBounds: Rect,
  viewport: Rect,
): Vec2 {
  assertRect(worldBounds, "World bounds");
  assertRect(viewport, "SVG viewport");

  return {
    x:
      worldBounds.minX +
      ((point.x - viewport.minX) / viewport.width) * worldBounds.width,
    y:
      worldBounds.minY +
      (1 - (point.y - viewport.minY) / viewport.height) * worldBounds.height,
  };
}
