import type { AudioParamLike } from "@/audio/types";

export const PARAMETER_SMOOTHING_SECONDS = 0.08;
export const MODE_CROSSFADE_SECONDS = 0.05;

export function smoothParameter(
  parameter: AudioParamLike,
  target: number,
  now: number,
  timeConstant = PARAMETER_SMOOTHING_SECONDS,
): void {
  parameter.setTargetAtTime(target, now, timeConstant);
}
