import type { SceneSpec, Vec2 } from "@/domain/scene/types";

import type { DirectTrace, SegmentHit, WallCrossing } from "@/acoustics/types";

export const ACOUSTIC_EPSILON = 1e-8;

export function cross(a: Vec2, b: Vec2): number {
  return a.x * b.y - a.y * b.x;
}

export function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}

export function subtract(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clampUnit(value: number): number {
  if (value < 0) {
    return 0;
  }

  if (value > 1) {
    return 1;
  }

  return value;
}

export function segmentIntersection(a: Vec2, b: Vec2, c: Vec2, d: Vec2): SegmentHit | null {
  const ray = subtract(b, a);
  const segment = subtract(d, c);
  const denominator = cross(ray, segment);

  if (Math.abs(denominator) <= ACOUSTIC_EPSILON) {
    return null;
  }

  const offset = subtract(c, a);
  const t = cross(offset, segment) / denominator;
  const u = cross(offset, ray) / denominator;

  if (
    t < -ACOUSTIC_EPSILON ||
    t > 1 + ACOUSTIC_EPSILON ||
    u < -ACOUSTIC_EPSILON ||
    u > 1 + ACOUSTIC_EPSILON
  ) {
    return null;
  }

  const finiteT = clampUnit(t);
  const finiteU = clampUnit(u);

  return {
    point: {
      x: a.x + ray.x * finiteT,
      y: a.y + ray.y * finiteT,
    },
    t: finiteT,
    u: finiteU,
  };
}

function isInteriorTraceHit(hit: SegmentHit): boolean {
  // A source/listener can sit exactly on its supporting room boundary. Those
  // endpoint contacts are finite geometry hits, but not intervening occluders.
  return hit.t > ACOUSTIC_EPSILON && hit.t < 1 - ACOUSTIC_EPSILON;
}

export function intersectSegmentWithWalls(
  source: Vec2,
  listener: Vec2,
  walls: readonly SceneSpec["walls"][number][],
): readonly WallCrossing[] {
  return walls
    .flatMap((wall) => {
      const hit = segmentIntersection(source, listener, wall.a, wall.b);

      if (hit === null || !isInteriorTraceHit(hit)) {
        return [];
      }

      return [{ ...hit, wallId: wall.id, wall }];
    })
    .sort((a, b) => {
      if (a.t !== b.t) {
        return a.t - b.t;
      }

      return a.wallId < b.wallId ? -1 : a.wallId > b.wallId ? 1 : 0;
    });
}

function liesStrictlyInsideOpenPortal(
  point: Vec2,
  wall: SceneSpec["walls"][number],
  scene: SceneSpec,
): boolean {
  const wallVector = subtract(wall.b, wall.a);
  const wallLength = Math.hypot(wallVector.x, wallVector.y);

  if (wallLength <= ACOUSTIC_EPSILON) {
    return false;
  }

  const wallDirection = {
    x: wallVector.x / wallLength,
    y: wallVector.y / wallLength,
  };

  return scene.portals.some((portal) => {
    if (!portal.open || portal.wallId !== wall.id || portal.widthM <= ACOUSTIC_EPSILON) {
      return false;
    }

    const relativeToCenter = subtract(point, portal.center);
    const distanceAlongWall = dot(relativeToCenter, wallDirection);
    const halfWidth = portal.widthM / 2;

    return (
      distanceAlongWall > -halfWidth && distanceAlongWall < halfWidth
    );
  });
}

export function traceDirectPath(source: Vec2, listener: Vec2, scene: SceneSpec): DirectTrace {
  const crossings = intersectSegmentWithWalls(source, listener, scene.walls).filter(
    (crossing) => !liesStrictlyInsideOpenPortal(crossing.point, crossing.wall, scene),
  );

  return {
    visible: crossings.length === 0,
    crossings,
    polyline: [source, ...crossings.map((crossing) => crossing.point), listener],
  };
}
