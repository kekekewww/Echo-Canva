import type { SecondOrderReflection3D } from "@/acoustics/hybrid3d/second-order";

export type SecondOrderCandidateMetrics = Readonly<{
  referencePathCount: number;
  candidatePathCount: number;
  truePositiveCount: number;
  recall: number;
  precision: number;
  delayRmseMs: number;
  retainedMidEnergyRatio: number;
}>;

function midEnergy(path: SecondOrderReflection3D): number {
  return 10 ** (path.estimatedMidGainDb / 10);
}

/** Compares deterministic candidate IDs and delays against the exhaustive test oracle. */
export function evaluateSecondOrderCandidate(
  reference: readonly SecondOrderReflection3D[],
  candidate: readonly SecondOrderReflection3D[],
): SecondOrderCandidateMetrics {
  const referenceById = new Map(reference.map((path) => [path.id, path]));
  const truePositives = candidate.flatMap((path) => {
    const oracle = referenceById.get(path.id);
    return oracle ? [{ candidate: path, reference: oracle }] : [];
  });
  const squaredDelayError = truePositives.reduce(
    (sum, { candidate: path, reference: oracle }) => sum + (path.delayMs - oracle.delayMs) ** 2,
    0,
  );
  const referenceEnergy = reference.reduce((sum, path) => sum + midEnergy(path), 0);
  const retainedEnergy = truePositives.reduce((sum, { reference: path }) => sum + midEnergy(path), 0);

  return {
    referencePathCount: reference.length,
    candidatePathCount: candidate.length,
    truePositiveCount: truePositives.length,
    recall: reference.length === 0 ? 1 : truePositives.length / reference.length,
    precision: candidate.length === 0 ? (reference.length === 0 ? 1 : 0) : truePositives.length / candidate.length,
    delayRmseMs: truePositives.length === 0 ? 0 : Math.sqrt(squaredDelayError / truePositives.length),
    retainedMidEnergyRatio: referenceEnergy <= 0 ? 1 : retainedEnergy / referenceEnergy,
  };
}
