import type { PatchBvh } from "@/acoustics/hybrid3d/bvh";
import type { Vec3 } from "@/acoustics/hybrid3d/geometry";
import {
  fibonacciProgressiveDirections,
  ProgressiveReceiverAccumulator,
  traceReceiverConnections3D,
  type ProgressiveReceiverSnapshot,
} from "@/acoustics/hybrid3d/receiver-connection";

const ENERGY_EPSILON = 1e-16;
const MAX_STATIONARY_FRAMES = 120;

export const RECEIVER_CONNECTION_SAMPLE_BUDGETS = [128, 512, 2048, 8192] as const;

export type ReceiverConnectionBenchmarkFrame = Readonly<{
  frameIndex: number;
  sampledDirectionCount: number;
  connectionCount: number;
  totalMidEnergy: number;
  midEnergyPerDirection: number;
}>;

export type ReceiverConnectionBenchmarkMetrics = Readonly<{
  frameCount: number;
  sampledDirectionCount: number;
  totalSampleCount: number;
  totalConnectionCount: number;
  connectionRate: number;
  meanMidEnergyPerDirection: number;
  frameEnergyCoefficientOfVariation: number;
  p95FrameToFrameEnergyDeltaDb: number;
}>;

export type ReceiverConnectionBenchmark = Readonly<{
  frames: readonly ReceiverConnectionBenchmarkFrame[];
  progressive: ProgressiveReceiverSnapshot;
  metrics: ReceiverConnectionBenchmarkMetrics;
}>;

export type ReceiverConnectionBenchmarkInput = Readonly<{
  sceneSignature: string;
  source: Vec3;
  listener: Vec3;
  bvh: PatchBvh;
  sampledDirectionCount: number;
  frameCount: number;
  maxDistanceM?: number;
  startFrameIndex?: number;
}>;

function requireFrameCount(frameCount: number): void {
  if (!Number.isInteger(frameCount) || frameCount <= 0 || frameCount > MAX_STATIONARY_FRAMES) {
    throw new Error(`Receiver connection frame count must be an integer from 1 to ${MAX_STATIONARY_FRAMES}.`);
  }
}

function connectionEnergy(connections: ReturnType<typeof traceReceiverConnections3D>): number {
  return connections.reduce(
    (total, connection) => total + 10 ** (connection.estimatedMidGainDb / 10),
    0,
  );
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function standardDeviation(values: readonly number[], expected: number): number {
  if (values.length === 0) return 0;
  return Math.sqrt(mean(values.map((value) => (value - expected) ** 2)));
}

function p95(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.max(0, Math.ceil(ordered.length * 0.95) - 1)]!;
}

function energyDeltaDb(previous: number, next: number): number {
  if (previous <= ENERGY_EPSILON && next <= ENERGY_EPSILON) return 0;
  return Math.abs(10 * Math.log10((next + ENERGY_EPSILON) / (previous + ENERGY_EPSILON)));
}

/**
 * Repeats deterministic progressive Fibonacci receiver connections for a stationary pose.
 *
 * `midEnergyPerDirection` normalizes energy by emitted directions rather than accepted
 * connections, so missed rays remain part of the convergence signal. This is a benchmark
 * for a future diffuse/late-field estimator; it does not render or replace P3 reflections.
 */
export function benchmarkReceiverConnectionStationary(
  input: ReceiverConnectionBenchmarkInput,
): ReceiverConnectionBenchmark {
  requireFrameCount(input.frameCount);
  const startFrameIndex = input.startFrameIndex ?? 0;
  if (!Number.isInteger(startFrameIndex) || startFrameIndex < 0) {
    throw new Error("Receiver connection start frame index must be a non-negative integer.");
  }

  const accumulator = new ProgressiveReceiverAccumulator();
  const frames: ReceiverConnectionBenchmarkFrame[] = [];
  for (let frameOffset = 0; frameOffset < input.frameCount; frameOffset += 1) {
    const frameIndex = startFrameIndex + frameOffset;
    const directions = fibonacciProgressiveDirections(input.sampledDirectionCount, frameIndex);
    const connections = traceReceiverConnections3D(
      input.source,
      input.listener,
      directions,
      input.bvh,
      input.maxDistanceM,
    );
    const totalMidEnergy = connectionEnergy(connections);
    accumulator.add(input.sceneSignature, directions.length, connections);
    frames.push({
      frameIndex,
      sampledDirectionCount: directions.length,
      connectionCount: connections.length,
      totalMidEnergy,
      midEnergyPerDirection: totalMidEnergy / directions.length,
    });
  }

  const energyPerDirection = frames.map(({ midEnergyPerDirection }) => midEnergyPerDirection);
  const meanMidEnergyPerDirection = mean(energyPerDirection);
  const energyStandardDeviation = standardDeviation(energyPerDirection, meanMidEnergyPerDirection);
  const frameToFrameDeltaDb = frames.slice(1).map((frame, index) =>
    energyDeltaDb(frames[index]!.midEnergyPerDirection, frame.midEnergyPerDirection),
  );
  const progressive = accumulator.snapshot();
  const totalSampleCount = frames.reduce((total, frame) => total + frame.sampledDirectionCount, 0);
  const totalConnectionCount = frames.reduce((total, frame) => total + frame.connectionCount, 0);

  return {
    frames,
    progressive,
    metrics: {
      frameCount: frames.length,
      sampledDirectionCount: input.sampledDirectionCount,
      totalSampleCount,
      totalConnectionCount,
      connectionRate: totalSampleCount === 0 ? 0 : totalConnectionCount / totalSampleCount,
      meanMidEnergyPerDirection,
      frameEnergyCoefficientOfVariation: meanMidEnergyPerDirection <= ENERGY_EPSILON
        ? 0
        : energyStandardDeviation / meanMidEnergyPerDirection,
      p95FrameToFrameEnergyDeltaDb: p95(frameToFrameDeltaDb),
    },
  };
}

/** Runs the fixed P5 sampling budgets against identical stationary geometry and poses. */
export function benchmarkReceiverConnectionBudgets(
  input: Omit<ReceiverConnectionBenchmarkInput, "sampledDirectionCount">,
  budgets: readonly number[] = RECEIVER_CONNECTION_SAMPLE_BUDGETS,
): readonly ReceiverConnectionBenchmark[] {
  if (budgets.length === 0) throw new Error("Receiver connection benchmark needs at least one sample budget.");
  return budgets.map((sampledDirectionCount) => benchmarkReceiverConnectionStationary({
    ...input,
    sampledDirectionCount,
  }));
}
