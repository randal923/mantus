import type { SkullState } from "./SkullState";

const CODES: Record<SkullState, number> = {
  none: 0,
  white: 1,
  red: 2,
  black: 3,
};

/** Maps a typed skull state to the characters.skull smallint. */
export function skullToCode(skull: SkullState): number {
  return CODES[skull];
}
