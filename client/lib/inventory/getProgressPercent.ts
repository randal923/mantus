/**
 * Whole-number progress toward the next level (0–100). Floored so the bar
 * only reads 100 when the level-up is actually reached; a max of 0 means the
 * level is already capped.
 */
export function getProgressPercent(value: number, max: number): number {
  if (max <= 0) return 100;
  return Math.min(100, Math.floor((Math.max(0, value) / max) * 100));
}
