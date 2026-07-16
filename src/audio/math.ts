const MIN_LINEAR_AMPLITUDE = 1e-8;

export type DistanceAttenuationOptions = Readonly<{
  referenceDistanceM?: number;
  rolloffFactor?: number;
  maxDistanceM?: number;
}>;

export function clampFinite(
  value: number,
  minimum: number,
  maximum: number,
  fallback: number,
): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, value));
}

export function dbToLinear(db: number): number {
  const finiteDb = clampFinite(db, -160, 24, 0);
  return 10 ** (finiteDb / 20);
}

export function linearToDb(linear: number): number {
  const finiteLinear = clampFinite(linear, MIN_LINEAR_AMPLITUDE, 16, 1);
  return 20 * Math.log10(finiteLinear);
}

export function distanceAttenuation(
  distanceM: number,
  options: DistanceAttenuationOptions = {},
): number {
  const referenceDistanceM = clampFinite(options.referenceDistanceM ?? 1, 0.1, 50, 1);
  const rolloffFactor = clampFinite(options.rolloffFactor ?? 1, 0, 4, 1);
  const maxDistanceM = clampFinite(options.maxDistanceM ?? 50, referenceDistanceM, 50, 50);
  const distance = clampFinite(distanceM, 0, maxDistanceM, referenceDistanceM);
  return referenceDistanceM /
    (referenceDistanceM + rolloffFactor * Math.max(distance - referenceDistanceM, 0));
}

export function equalPowerCrossfade(mix: number): Readonly<{
  raw: number;
  simulated: number;
}> {
  const finiteMix = clampFinite(mix, 0, 1, 0);
  const angle = finiteMix * Math.PI * 0.5;
  return {
    raw: Math.abs(finiteMix - 1) < Number.EPSILON ? 0 : Math.cos(angle),
    simulated: finiteMix < Number.EPSILON ? 0 : Math.sin(angle),
  };
}
