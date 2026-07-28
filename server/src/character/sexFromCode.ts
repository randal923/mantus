import type { CharacterSex } from "@tibia/protocol";

/**
 * Maps the characters.sex smallint to its typed value. Canary's PlayerSex_t:
 * 0 = female, 1 = male; anything else is treated as male, matching the column
 * default rather than inventing a third state.
 */
export function sexFromCode(code: number): CharacterSex {
  return code === 0 ? "female" : "male";
}
