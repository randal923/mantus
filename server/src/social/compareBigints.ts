/** Ascending comparator for bigints; `a - b` is a bigint, not a sort number. */
export function compareBigints(left: bigint, right: bigint): number {
  if (left < right) return -1;
  return left > right ? 1 : 0;
}
