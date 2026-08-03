/**
 * Whether a tooltip should sit under its target instead of over it: only when
 * it does not fit above and there is more room below. Depends solely on the
 * target's box and the bubble's height — never on where the bubble currently
 * is — so applying the answer can never change it and oscillate.
 */
export function fitsBelow(
  target: DOMRect,
  bubbleHeight: number,
  bounds: DOMRect,
  gap = 6,
): boolean {
  const above = target.top - bounds.top;
  const below = bounds.bottom - target.bottom;
  if (above >= bubbleHeight + gap) return false;
  return below > above;
}
