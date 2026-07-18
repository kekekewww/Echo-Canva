import { distanceAttenuation, linearToDb } from "@/audio/math";

import { intersectRayBvh, type PatchBvh } from "@/acoustics/hybrid3d/bvh";
import { materialForHybridReflection, reflectionAmplitude } from "@/acoustics/hybrid3d/material-energy";
import { physicalSurfaceId, reflectionLegIsVisible } from "@/acoustics/hybrid3d/reflections";
import {
  length3,
  normalize3,
  subtract3,
  SOUND_SPEED_MPS,
  type Vec3,
} from "@/acoustics/hybrid3d/geometry";

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

export type ReceiverConnection3D = Readonly<{
  id: string;
  sampleIndex: number;
  surfaceId: string;
  point: Vec3;
  pathLengthM: number;
  delayMs: number;
  arrivalDirection: Vec3;
  estimatedMidGainDb: number;
}>;

export type ProgressiveReceiverSnapshot = Readonly<{
  sceneSignature: string | null;
  frameCount: number;
  sampledDirectionCount: number;
  connectionCount: number;
  accumulatedMidEnergy: number;
}>;

export function fibonacciSphereDirections(count: number, rotationRadians = 0): readonly Vec3[] {
  if (!Number.isInteger(count) || count <= 0 || count > 8192) {
    throw new Error("Fibonacci sphere count must be an integer from 1 to 8192.");
  }
  return Array.from({ length: count }, (_, index) => {
    const y = 1 - (2 * (index + 0.5)) / count;
    const radius = Math.sqrt(Math.max(0, 1 - y * y));
    const azimuth = GOLDEN_ANGLE * index + rotationRadians;
    return { x: Math.cos(azimuth) * radius, y, z: Math.sin(azimuth) * radius };
  });
}

/** Low-discrepancy frame rotation for progressive receiver-connection accumulation. */
export function fibonacciProgressiveDirections(
  count: number,
  frameIndex: number,
): readonly Vec3[] {
  if (!Number.isInteger(frameIndex) || frameIndex < 0) {
    throw new Error("Fibonacci progressive frame index must be a non-negative integer.");
  }
  return fibonacciSphereDirections(count, frameIndex * GOLDEN_ANGLE);
}

/**
 * Single-bounce receiver connections for diffuse/late-energy experiments.
 * They are not a replacement for P3's deterministic specular Image Source paths.
 */
export function traceReceiverConnections3D(
  source: Vec3,
  listener: Vec3,
  directions: readonly Vec3[],
  bvh: PatchBvh,
  maxDistanceM = 50,
): readonly ReceiverConnection3D[] {
  const connections: ReceiverConnection3D[] = [];
  for (let index = 0; index < directions.length; index += 1) {
    const direction = directions[index]!;
    const hit = intersectRayBvh(source, direction, bvh, maxDistanceM)[0];
    if (!hit) continue;
    const patch = bvh.patches.find(({ id }) => id === hit.patchId);
    if (!patch) continue;
    const surfaceId = physicalSurfaceId(patch);
    const toListener = subtract3(listener, hit.point);
    const listenerDistanceM = length3(toListener);
    if (listenerDistanceM <= 1e-8 || !reflectionLegIsVisible(hit.point, listener, bvh, [surfaceId])) {
      continue;
    }
    const pathLengthM = hit.distanceM + listenerDistanceM;
    const material = materialForHybridReflection(patch.materialId);
    const diffuseWeight = 0.1 + material.scattering * 0.9;
    const amplitude = reflectionAmplitude(material, "mid") * diffuseWeight * distanceAttenuation(pathLengthM);
    connections.push({
      id: `receiver:${index}:${surfaceId}`,
      sampleIndex: index,
      surfaceId,
      point: hit.point,
      pathLengthM,
      delayMs: (pathLengthM / SOUND_SPEED_MPS) * 1000,
      arrivalDirection: normalize3(subtract3(hit.point, listener)),
      estimatedMidGainDb: linearToDb(amplitude),
    });
  }
  return connections;
}

/** Progressive, deterministic late-energy accumulator reset by scene signature. */
export class ProgressiveReceiverAccumulator {
  private sceneSignature: string | null = null;
  private frameCount = 0;
  private sampledDirectionCount = 0;
  private connectionCount = 0;
  private accumulatedMidEnergy = 0;

  add(
    sceneSignature: string,
    sampledDirectionCount: number,
    connections: readonly ReceiverConnection3D[],
  ): ProgressiveReceiverSnapshot {
    if (sceneSignature !== this.sceneSignature) this.reset(sceneSignature);
    this.frameCount += 1;
    this.sampledDirectionCount += sampledDirectionCount;
    this.connectionCount += connections.length;
    this.accumulatedMidEnergy += connections.reduce(
      (sum, connection) => sum + 10 ** (connection.estimatedMidGainDb / 10),
      0,
    );
    return this.snapshot();
  }

  reset(sceneSignature: string | null = null): void {
    this.sceneSignature = sceneSignature;
    this.frameCount = 0;
    this.sampledDirectionCount = 0;
    this.connectionCount = 0;
    this.accumulatedMidEnergy = 0;
  }

  snapshot(): ProgressiveReceiverSnapshot {
    return {
      sceneSignature: this.sceneSignature,
      frameCount: this.frameCount,
      sampledDirectionCount: this.sampledDirectionCount,
      connectionCount: this.connectionCount,
      accumulatedMidEnergy: this.accumulatedMidEnergy,
    };
  }
}
