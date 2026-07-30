import type { Position } from "@tibia/protocol";

/**
 * The pattern cell a magic effect draws with, from `Effect::draw` in OTClient:
 * an effect varies by where it lands relative to the middle of the screen, so a
 * wide effect covering several tiles is not the same sprite repeated. The x axis
 * is mirrored (`1 - offset`), which is only well defined upstream for the one and
 * two-column effects Tibia actually ships — 193 of its 198 animated effects have
 * a single column, the other five have two.
 */
export function getEffectPattern(
  position: Position,
  center: Position | null,
  patternX: number,
  patternY: number,
): { x: number; y: number } {
  const offsetX = center ? position.x - center.x : 0;
  const offsetY = center ? position.y - center.y : 0;
  return {
    x: positiveModulo(1 - offsetX, patternX),
    y: positiveModulo(offsetY, patternY),
  };
}

function positiveModulo(value: number, modulus: number): number {
  if (modulus <= 1) return 0;
  return ((value % modulus) + modulus) % modulus;
}
