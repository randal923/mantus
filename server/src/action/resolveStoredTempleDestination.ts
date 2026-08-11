import type { Position } from "@tibia/protocol";
import { ADVENTURERS_STONE_TEMPLES } from "./adventurersStoneTables";

/**
 * The Adventurers Guild return trip: Canary sends the player to the temple of
 * the town they came from (`Storage.Quest.U9_80.AdventurersGuild.Stone`),
 * falling back to their own town's temple when that storage is unset. The
 * world spawn temple stands in when the map has no temple for either town.
 */
export function resolveStoredTempleDestination(input: {
  /** Stored town id from the outbound trip; -1 when unset. */
  storedTownId: number;
  homeTownId: number;
  fallbackTemple: Position;
}): Position {
  return (
    ADVENTURERS_STONE_TEMPLES.find(
      (entry) => entry.townId === input.storedTownId,
    )?.temple ??
    ADVENTURERS_STONE_TEMPLES.find((entry) => entry.townId === input.homeTownId)
      ?.temple ??
    input.fallbackTemple
  );
}
