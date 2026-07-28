import type { CharacterSex } from "@tibia/protocol";

/** Maps a character's sex to the characters.sex smallint (Canary PlayerSex_t). */
export function sexToCode(sex: CharacterSex): number {
  return sex === "female" ? 0 : 1;
}
