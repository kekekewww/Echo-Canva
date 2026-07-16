import type { AudioParamLike } from "@/audio/types";
import { equalPowerCrossfade } from "@/audio/math";

export const PARAMETER_SMOOTHING_SECONDS = 0.08;
export const MODE_CROSSFADE_SECONDS = 0.08;

const MODE_CROSSFADE_SAMPLE_COUNT = 33;

export function smoothParameter(
  parameter: AudioParamLike,
  target: number,
  now: number,
  timeConstant = PARAMETER_SMOOTHING_SECONDS,
): void {
  parameter.setTargetAtTime(target, now, timeConstant);
}

export function scheduleEqualPowerCrossfade(
  raw: AudioParamLike,
  simulated: AudioParamLike,
  fromMix: number,
  toMix: number,
  now: number,
): void {
  const rawCurve = new Float32Array(MODE_CROSSFADE_SAMPLE_COUNT);
  const simulatedCurve = new Float32Array(MODE_CROSSFADE_SAMPLE_COUNT);

  for (let index = 0; index < MODE_CROSSFADE_SAMPLE_COUNT; index += 1) {
    const progress = index / (MODE_CROSSFADE_SAMPLE_COUNT - 1);
    const mix = fromMix + (toMix - fromMix) * progress;
    const coefficients = equalPowerCrossfade(mix);
    rawCurve[index] = coefficients.raw;
    simulatedCurve[index] = coefficients.simulated;
  }

  raw.cancelScheduledValues(now);
  simulated.cancelScheduledValues(now);
  raw.setValueCurveAtTime(rawCurve, now, MODE_CROSSFADE_SECONDS);
  simulated.setValueCurveAtTime(simulatedCurve, now, MODE_CROSSFADE_SECONDS);
}
