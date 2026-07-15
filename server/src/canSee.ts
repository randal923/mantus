export interface ViewRange {
  x: number;
  y: number;
}

export function canSee(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
  range: ViewRange,
): boolean {
  return (
    a.z === b.z &&
    Math.abs(a.x - b.x) <= range.x &&
    Math.abs(a.y - b.y) <= range.y
  );
}
