export function classicSourcePoolCapacity(hardwareConcurrency: number | undefined): number {
  if (!Number.isFinite(hardwareConcurrency) || (hardwareConcurrency ?? 0) <= 0) return 1;
  return Math.min(4, Math.max(1, Math.floor(hardwareConcurrency!) - 2));
}
