import type { Band3, Vec2 } from "@/domain/scene/types";

import { distance, dot, subtract } from "@/acoustics/geometry";
import type { DirectTrace, OcclusionEstimate, WallCrossing } from "@/acoustics/types";
import { MATERIALS } from "@/domain/materials/registry";

export const MAX_DIRECT_LOSS_DB = 24;
export const MIN_CUTOFF_HZ = 700;
export const MAX_CUTOFF_HZ = 20_000;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function addBands(a: Band3, b: Band3): Band3 {
  return {
    low: a.low + b.low,
    mid: a.mid + b.mid,
    high: a.high + b.high,
  };
}

function wallNormal(wall: WallCrossing["wall"]): Vec2 {
  const direction = subtract(wall.b, wall.a);
  const length = distance(wall.a, wall.b);

  return { x: -direction.y / length, y: direction.x / length };
}

function lossForCrossing(crossing: WallCrossing, direction: Vec2): Band3 {
  const material = MATERIALS.find((candidate) => candidate.id === crossing.wall.materialId);

  if (material === undefined) {
    throw new Error(`Unknown acoustic material: ${crossing.wall.materialId}`);
  }

  const incidence = Math.abs(dot(direction, wallNormal(crossing.wall)));
  const effectiveThicknessM = crossing.wall.thicknessM / Math.max(incidence, 0.25);
  const thicknessAdjustmentDb =
    6 * Math.log2(effectiveThicknessM / material.referenceThicknessM);

  return {
    low: Math.max(0, material.transmissionLossDb.low + thicknessAdjustmentDb),
    mid: Math.max(0, material.transmissionLossDb.mid + thicknessAdjustmentDb),
    high: Math.max(0, material.transmissionLossDb.high + thicknessAdjustmentDb),
  };
}

function directUnitDirection(trace: DirectTrace): Vec2 {
  const source = trace.polyline[0];
  const listener = trace.polyline.at(-1);

  if (source === undefined || listener === undefined) {
    throw new Error("A direct trace must contain source and listener points");
  }

  const pathLength = distance(source, listener);

  if (pathLength === 0) {
    return { x: 0, y: 0 };
  }

  const direction = subtract(listener, source);
  return { x: direction.x / pathLength, y: direction.y / pathLength };
}

export function estimateDirectOcclusion(trace: DirectTrace): OcclusionEstimate {
  if (trace.visible) {
    return {
      dryGainDb: 0,
      lowpassHz: MAX_CUTOFF_HZ,
      occluderWallIds: [],
      transmissionLossDb: { low: 0, mid: 0, high: 0 },
    };
  }

  const direction = directUnitDirection(trace);
  const transmissionLossDb = trace.crossings.reduce<Band3>(
    (total, crossing) => addBands(total, lossForCrossing(crossing, direction)),
    { low: 0, mid: 0, high: 0 },
  );
  const highObstruction = clamp(transmissionLossDb.high / 36, 0, 1);
  const cappedMidLossDb = Math.min(transmissionLossDb.mid, MAX_DIRECT_LOSS_DB);
  const lowpassHz =
    MIN_CUTOFF_HZ * (MAX_CUTOFF_HZ / MIN_CUTOFF_HZ) ** (1 - highObstruction);

  return {
    dryGainDb: cappedMidLossDb === 0 ? 0 : -cappedMidLossDb,
    lowpassHz,
    occluderWallIds: trace.crossings.map((crossing) => crossing.wallId),
    transmissionLossDb,
  };
}
