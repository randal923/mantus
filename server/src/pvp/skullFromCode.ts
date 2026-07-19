import type { SkullState } from "./SkullState";

const CODES: Record<number, SkullState> = {
  0: "none",
  1: "white",
  2: "red",
  3: "black",
};

/** Maps the characters.skull smallint to its typed state (invalid → none). */
export function skullFromCode(code: number): SkullState {
  return CODES[code] ?? "none";
}
