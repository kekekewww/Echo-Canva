export type HybridAtmosphere = Readonly<{
  temperatureC: number;
  relativeHumidity: number;
  pressurePa: number;
}>;

export type MediumSegment = Readonly<{
  distanceM: number;
  atmosphere: HybridAtmosphere;
}>;

export const DEFAULT_HYBRID_ATMOSPHERE: HybridAtmosphere = Object.freeze({
  temperatureC: 20,
  relativeHumidity: 0.5,
  pressurePa: 101325,
});

const REFERENCE_TEMPERATURE_K = 293.15;
const TRIPLE_POINT_TEMPERATURE_K = 273.16;
const REFERENCE_PRESSURE_PA = 101325;

function assertAtmosphere(atmosphere: HybridAtmosphere): void {
  if (!Number.isFinite(atmosphere.temperatureC) || atmosphere.temperatureC < -20 || atmosphere.temperatureC > 50) {
    throw new Error("Hybrid atmosphere temperature must be finite and from -20 to 50 Celsius.");
  }
  if (!Number.isFinite(atmosphere.relativeHumidity) || atmosphere.relativeHumidity < 0 || atmosphere.relativeHumidity > 1) {
    throw new Error("Hybrid atmosphere relative humidity must be finite and from 0 to 1.");
  }
  if (!Number.isFinite(atmosphere.pressurePa) || atmosphere.pressurePa < 80000 || atmosphere.pressurePa > 110000) {
    throw new Error("Hybrid atmosphere pressure must be finite and from 80000 to 110000 Pa.");
  }
}

function assertFrequency(frequencyHz: number): void {
  if (!Number.isFinite(frequencyHz) || frequencyHz < 20 || frequencyHz > 20000) {
    throw new Error("Hybrid atmosphere frequency must be finite and from 20 to 20000 Hz.");
  }
}

function assertDistance(distanceM: number): void {
  if (!Number.isFinite(distanceM) || distanceM < 0 || distanceM > 10000) {
    throw new Error("Hybrid medium distance must be finite and from 0 to 10000 m.");
  }
}

/** Approximate dry-air speed of sound used for data-only Hybrid propagation experiments. */
export function speedOfSoundForAtmosphere(atmosphere: HybridAtmosphere): number {
  assertAtmosphere(atmosphere);
  return 331.3 + 0.606 * atmosphere.temperatureC;
}

/** Time of flight derived from the local temperature-based sound-speed approximation. */
export function atmosphereTimeOfFlightSeconds(distanceM: number, atmosphere: HybridAtmosphere): number {
  assertDistance(distanceM);
  return distanceM / speedOfSoundForAtmosphere(atmosphere);
}

/** Adds piecewise medium travel time without changing the Classic 343 m/s propagation constant. */
export function segmentedAtmosphereTimeOfFlightSeconds(segments: readonly MediumSegment[]): number {
  return segments.reduce(
    (total, segment) => total + atmosphereTimeOfFlightSeconds(segment.distanceM, segment.atmosphere),
    0,
  );
}

/**
 * ISO 9613-1 style atmospheric absorption coefficient in dB/m.
 * Inputs are restricted to the documented Hybrid experiment envelope above.
 */
export function airAbsorptionDbPerMeter(frequencyHz: number, atmosphere: HybridAtmosphere): number {
  assertFrequency(frequencyHz);
  assertAtmosphere(atmosphere);
  const temperatureK = atmosphere.temperatureC + 273.15;
  const temperatureRatio = temperatureK / REFERENCE_TEMPERATURE_K;
  const pressureRatio = atmosphere.pressurePa / REFERENCE_PRESSURE_PA;
  const saturationPressure = REFERENCE_PRESSURE_PA * 10 ** (
    -6.8346 * (TRIPLE_POINT_TEMPERATURE_K / temperatureK) ** 1.261 + 4.6151
  );
  const humidityMolarConcentration = atmosphere.relativeHumidity * saturationPressure / atmosphere.pressurePa;
  const oxygenRelaxationHz = pressureRatio * (
    24 + 40400 * humidityMolarConcentration * (0.02 + humidityMolarConcentration) /
      (0.391 + humidityMolarConcentration)
  );
  const nitrogenRelaxationHz = pressureRatio * temperatureRatio ** -0.5 * (
    9 + 280 * humidityMolarConcentration * Math.exp(-4.17 * (temperatureRatio ** (-1 / 3) - 1))
  );
  const frequencySquared = frequencyHz ** 2;
  return 8.686 * frequencySquared * (
    1.84e-11 * (1 / pressureRatio) * Math.sqrt(temperatureRatio) +
    temperatureRatio ** -2.5 * (
      0.01275 * Math.exp(-2239.1 / temperatureK) /
        (oxygenRelaxationHz + frequencySquared / oxygenRelaxationHz) +
      0.1068 * Math.exp(-3352 / temperatureK) /
        (nitrogenRelaxationHz + frequencySquared / nitrogenRelaxationHz)
    )
  );
}

export function airAbsorptionLossDb(
  distanceM: number,
  frequencyHz: number,
  atmosphere: HybridAtmosphere,
): number {
  assertDistance(distanceM);
  return distanceM * airAbsorptionDbPerMeter(frequencyHz, atmosphere);
}
