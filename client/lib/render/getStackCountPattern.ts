/**
 * The pattern cell Tibia draws a stack of `count` items with, ported from
 * `Item::updatePatterns` in OTClient: stackables whose appearance carries a 4×2
 * pattern grid use it for the stack size, which is why 100 gold coins are a pile
 * and one is a coin. It is also the pattern axis animated stackables — enchanted
 * gems, gold ingots — share with their phases.
 *
 * Callers must only apply it to a stackable appearance with `px === 4` and
 * `py === 2`; every other layout means something else entirely.
 */
export function getStackCountPattern(count: number): { x: number; y: number } {
  const size = Number.isFinite(count) ? Math.floor(count) : 0;
  if (size <= 0) return { x: 0, y: 0 };
  if (size < 5) return { x: size - 1, y: 0 };
  if (size < 10) return { x: 0, y: 1 };
  if (size < 25) return { x: 1, y: 1 };
  if (size < 50) return { x: 2, y: 1 };
  return { x: 3, y: 1 };
}
