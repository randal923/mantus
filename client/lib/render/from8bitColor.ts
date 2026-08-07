/**
 * Decodes Tibia's 8-bit light palette — a 6x6x6 color cube in steps of 51 —
 * into RGB. Index 0 and anything outside the cube decode to black (no
 * light), matching OTClient's Color::from8bit. 215 is white, the world
 * light; 206 the warm torch yellow.
 */
export function from8bitColor(
  color: number,
): readonly [number, number, number] {
  if (color <= 0 || color >= 216) return [0, 0, 0];
  return [
    (Math.floor(color / 36) % 6) * 51,
    (Math.floor(color / 6) % 6) * 51,
    (color % 6) * 51,
  ];
}
