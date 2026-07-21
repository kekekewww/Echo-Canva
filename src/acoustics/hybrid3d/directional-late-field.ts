import { dot3, length3, normalize3, scale3, type Vec3 } from "@/acoustics/hybrid3d/geometry";
import {
  fibonacciSphereDirections,
  type ReceiverConnection3D,
} from "@/acoustics/hybrid3d/receiver-connection";

const ENERGY_EPSILON = 1e-16;

export type DirectionalLateFieldOptions = Readonly<{
  directionCount?: 12 | 24;
  timeBinMs?: number;
  minimumDelayMs?: number;
  maximumDelayMs?: number;
}>;

export type DirectionalLateFieldCell = Readonly<{
  directionIndex: number;
  direction: Vec3;
  timeBinIndex: number;
  startDelayMs: number;
  endDelayMs: number;
  connectionCount: number;
  midEnergy: number;
}>;

export type DirectionalLateFieldHistogram = Readonly<{
  directionCount: 12 | 24;
  timeBinMs: number;
  minimumDelayMs: number;
  maximumDelayMs: number;
  inputConnectionCount: number;
  retainedConnectionCount: number;
  discardedConnectionCount: number;
  inputMidEnergy: number;
  retainedMidEnergy: number;
  directionalEnergyCentroid: Vec3 | null;
  cells: readonly DirectionalLateFieldCell[];
}>;

type ResolvedOptions = Required<DirectionalLateFieldOptions>;

function resolveOptions(options: DirectionalLateFieldOptions): ResolvedOptions {
  const directionCount = options.directionCount ?? 12;
  const timeBinMs = options.timeBinMs ?? 10;
  const minimumDelayMs = options.minimumDelayMs ?? 0;
  const maximumDelayMs = options.maximumDelayMs ?? 500;
  if (directionCount !== 12 && directionCount !== 24) {
    throw new Error("Directional late field direction count must be 12 or 24.");
  }
  if (!Number.isFinite(timeBinMs) || timeBinMs <= 0 || timeBinMs > 100) {
    throw new Error("Directional late field time bin must be finite and from 0 to 100 ms.");
  }
  if (!Number.isFinite(minimumDelayMs) || !Number.isFinite(maximumDelayMs) ||
    minimumDelayMs < 0 || maximumDelayMs <= minimumDelayMs || maximumDelayMs > 2000) {
    throw new Error("Directional late field delay range must be finite, ordered, and within 0 to 2000 ms.");
  }
  return { directionCount, timeBinMs, minimumDelayMs, maximumDelayMs };
}

function midEnergy(connection: ReceiverConnection3D): number {
  return 10 ** (connection.estimatedMidGainDb / 10);
}

function nearestDirectionIndex(direction: Vec3, directions: readonly Vec3[]): number {
  let index = 0;
  let bestDot = Number.NEGATIVE_INFINITY;
  for (let candidateIndex = 0; candidateIndex < directions.length; candidateIndex += 1) {
    const alignment = dot3(direction, directions[candidateIndex]!);
    if (alignment > bestDot) {
      bestDot = alignment;
      index = candidateIndex;
    }
  }
  return index;
}

/**
 * Deterministically bins P5 diffuse receiver connections by arrival direction and delay.
 * This is data for future virtual late-field sources, not a late-reverb renderer.
 */
export function buildDirectionalLateFieldHistogram(
  connections: readonly ReceiverConnection3D[],
  options: DirectionalLateFieldOptions = {},
): DirectionalLateFieldHistogram {
  const resolved = resolveOptions(options);
  const directions = fibonacciSphereDirections(resolved.directionCount);
  const buckets = new Map<string, { connectionCount: number; midEnergy: number }>();
  let retainedConnectionCount = 0;
  let inputMidEnergy = 0;
  let retainedMidEnergy = 0;
  let centroidSum: Vec3 = { x: 0, y: 0, z: 0 };

  for (const connection of connections) {
    const energy = midEnergy(connection);
    inputMidEnergy += energy;
    if (connection.delayMs < resolved.minimumDelayMs || connection.delayMs >= resolved.maximumDelayMs) {
      continue;
    }
    const directionIndex = nearestDirectionIndex(connection.arrivalDirection, directions);
    const timeBinIndex = Math.floor((connection.delayMs - resolved.minimumDelayMs) / resolved.timeBinMs);
    const key = `${directionIndex}:${timeBinIndex}`;
    const bucket = buckets.get(key) ?? { connectionCount: 0, midEnergy: 0 };
    bucket.connectionCount += 1;
    bucket.midEnergy += energy;
    buckets.set(key, bucket);
    retainedConnectionCount += 1;
    retainedMidEnergy += energy;
    centroidSum = {
      x: centroidSum.x + connection.arrivalDirection.x * energy,
      y: centroidSum.y + connection.arrivalDirection.y * energy,
      z: centroidSum.z + connection.arrivalDirection.z * energy,
    };
  }

  const cells = [...buckets.entries()].map(([key, bucket]) => {
    const [directionIndexText, timeBinIndexText] = key.split(":");
    const directionIndex = Number(directionIndexText);
    const timeBinIndex = Number(timeBinIndexText);
    const startDelayMs = resolved.minimumDelayMs + timeBinIndex * resolved.timeBinMs;
    return {
      directionIndex,
      direction: directions[directionIndex]!,
      timeBinIndex,
      startDelayMs,
      endDelayMs: Math.min(startDelayMs + resolved.timeBinMs, resolved.maximumDelayMs),
      connectionCount: bucket.connectionCount,
      midEnergy: bucket.midEnergy,
    };
  }).sort((left, right) =>
    left.timeBinIndex !== right.timeBinIndex
      ? left.timeBinIndex - right.timeBinIndex
      : left.directionIndex - right.directionIndex,
  );
  const centroidLength = length3(centroidSum);

  return {
    directionCount: resolved.directionCount,
    timeBinMs: resolved.timeBinMs,
    minimumDelayMs: resolved.minimumDelayMs,
    maximumDelayMs: resolved.maximumDelayMs,
    inputConnectionCount: connections.length,
    retainedConnectionCount,
    discardedConnectionCount: connections.length - retainedConnectionCount,
    inputMidEnergy,
    retainedMidEnergy,
    directionalEnergyCentroid: centroidLength <= ENERGY_EPSILON ? null : normalize3(scale3(centroidSum, 1 / centroidLength)),
    cells,
  };
}
