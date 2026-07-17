export const MIN_ACOUSTIC_UPDATE_HZ = 10;
export const MAX_ACOUSTIC_UPDATE_HZ = 15;

export function acousticUpdateIntervalMs(requestedHz: number): number {
  const updateHz = Math.min(Math.max(requestedHz, MIN_ACOUSTIC_UPDATE_HZ), MAX_ACOUSTIC_UPDATE_HZ);
  return 1000 / updateHz;
}
