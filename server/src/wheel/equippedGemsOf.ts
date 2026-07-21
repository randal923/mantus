import type { RevealedGem } from "@tibia/protocol";
import type { GemCharacterData } from "./GemStore";

/** Resolves the equipped gem ids of a loaded snapshot to their gem records. */
export function equippedGemsOf(data: GemCharacterData): RevealedGem[] {
  return Object.values(data.equipped)
    .map((gemId) => data.revealed.find((gem) => gem.id === gemId))
    .filter((gem): gem is RevealedGem => gem !== undefined);
}
