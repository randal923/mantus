export interface ViewRange {
  x: number;
  y: number;
}

export function canSee(
  a: { x: number; y: number },
  b: { x: number; y: number },
  range: ViewRange,
): boolean {
  return Math.abs(a.x - b.x) <= range.x && Math.abs(a.y - b.y) <= range.y;
}
