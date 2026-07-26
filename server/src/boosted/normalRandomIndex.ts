/**
 * Canary's `normal_random(min, max)` (tools.cpp:466-475): a normal draw with
 * mean 0.5 and sigma 0.25, rejected until it lands in [0, 1], then rounded
 * onto the inclusive range — the daily boosted creature is deliberately
 * biased toward the middle of the race-id-sorted list.
 */
export function normalRandomIndex(
  unit: () => number,
  minimum: number,
  maximum: number,
): number {
  const lower = Math.min(minimum, maximum);
  const upper = Math.max(minimum, maximum);
  let value: number;
  do {
    const a = Math.max(unit(), Number.EPSILON);
    const b = unit();
    const standard = Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * b);
    value = 0.5 + 0.25 * standard;
  } while (value < 0 || value > 1);
  return lower + Math.round(value * (upper - lower));
}
