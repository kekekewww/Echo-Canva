import type { Vec2 } from "@/domain/scene/types";

export const EPSILON = 1e-8;
export const MIN_WALL_LENGTH_M = 0.1;
export const MAX_ROOM_DIMENSION_M = 50;
export const PORTAL_ATTACHMENT_TOLERANCE_M = 0.01;

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function cross(a: Vec2, b: Vec2, c: Vec2): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function pointOnSegment(point: Vec2, a: Vec2, b: Vec2, tolerance = EPSILON): boolean {
  const segmentLength = distance(a, b);
  if (segmentLength <= EPSILON) {
    return distance(point, a) <= tolerance;
  }

  const perpendicularDistance = Math.abs(cross(a, b, point)) / segmentLength;
  const dot =
    (point.x - a.x) * (point.x - b.x) + (point.y - a.y) * (point.y - b.y);

  return perpendicularDistance <= tolerance && dot <= tolerance * segmentLength;
}

function segmentsIntersect(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);

  if (
    ((abC > EPSILON && abD < -EPSILON) || (abC < -EPSILON && abD > EPSILON)) &&
    ((cdA > EPSILON && cdB < -EPSILON) || (cdA < -EPSILON && cdB > EPSILON))
  ) {
    return true;
  }

  return (
    (Math.abs(abC) <= EPSILON && pointOnSegment(c, a, b)) ||
    (Math.abs(abD) <= EPSILON && pointOnSegment(d, a, b)) ||
    (Math.abs(cdA) <= EPSILON && pointOnSegment(a, c, d)) ||
    (Math.abs(cdB) <= EPSILON && pointOnSegment(b, c, d))
  );
}

export function isSimplePolygon(polygon: readonly Vec2[]): boolean {
  if (polygon.length < 3) {
    return false;
  }

  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index]!;
    const b = polygon[(index + 1) % polygon.length]!;
    if (distance(a, b) <= EPSILON) {
      return false;
    }

    for (let other = index + 1; other < polygon.length; other += 1) {
      const adjacent =
        other === index + 1 || (index === 0 && other === polygon.length - 1);
      if (adjacent) {
        continue;
      }

      const c = polygon[other]!;
      const d = polygon[(other + 1) % polygon.length]!;
      if (segmentsIntersect(a, b, c, d)) {
        return false;
      }
    }
  }

  let twiceArea = 0;
  for (let index = 0; index < polygon.length; index += 1) {
    const point = polygon[index]!;
    const next = polygon[(index + 1) % polygon.length]!;
    twiceArea += point.x * next.y - next.x * point.y;
  }

  return Math.abs(twiceArea) > EPSILON;
}

export function pointInPolygon(point: Vec2, polygon: readonly Vec2[]): boolean {
  let inside = false;

  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const a = polygon[previous]!;
    const b = polygon[index]!;

    if (pointOnSegment(point, a, b)) {
      return true;
    }

    if (
      (a.y > point.y) !== (b.y > point.y) &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    ) {
      inside = !inside;
    }
  }

  return inside;
}

export function roomDimensions(polygon: readonly Vec2[]): { width: number; height: number } {
  const xs = polygon.map((point) => point.x);
  const ys = polygon.map((point) => point.y);

  return {
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}

export function portalFitsWall(
  center: Vec2,
  widthM: number,
  wallA: Vec2,
  wallB: Vec2,
): boolean {
  const wallLength = distance(wallA, wallB);
  if (wallLength <= EPSILON) {
    return false;
  }

  const wallX = wallB.x - wallA.x;
  const wallY = wallB.y - wallA.y;
  const projectionParameter =
    ((center.x - wallA.x) * wallX + (center.y - wallA.y) * wallY) /
    (wallLength * wallLength);
  const projectedCenter = {
    x: wallA.x + projectionParameter * wallX,
    y: wallA.y + projectionParameter * wallY,
  };
  const perpendicularDistance = distance(center, projectedCenter);

  if (perpendicularDistance > PORTAL_ATTACHMENT_TOLERANCE_M + EPSILON) {
    return false;
  }

  const projectedDistanceFromA = projectionParameter * wallLength;
  const projectedDistanceFromB = wallLength - projectedDistanceFromA;
  const halfWidth = widthM / 2;

  return (
    projectedDistanceFromA + EPSILON >= halfWidth &&
    projectedDistanceFromB + EPSILON >= halfWidth &&
    widthM <= wallLength + EPSILON
  );
}
