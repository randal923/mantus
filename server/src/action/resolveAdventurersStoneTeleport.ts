import type { Position } from "@tibia/protocol";
import {
  ADVENTURERS_STONE_TEMPLES,
  GUILD_AREA,
  GUILD_ARRIVAL,
} from "./adventurersStoneTables";

export type AdventurersStoneDecision =
  | { kind: "refuse" }
  | { kind: "to-guild"; townId: number; destination: Position }
  | { kind: "to-temple"; destination: Position };

const inRange = (p: Position, from: Position, to: Position): boolean =>
  p.x >= from.x && p.x <= to.x &&
  p.y >= from.y && p.y <= to.y &&
  p.z >= from.z && p.z <= to.z;

/**
 * Canary's adventurer's stone rule: only usable on a protection-zone tile
 * that is not inside a house, never while pz-locked. Inside a city temple
 * box it teleports to the Adventurers Guild, remembering the town for the
 * way back; inside the guild it returns to the remembered temple (falling
 * back to the character's home town, then the world spawn temple).
 */
export function resolveAdventurersStoneTeleport(input: {
  position: Position;
  inProtectionZone: boolean;
  inHouse: boolean;
  pzLocked: boolean;
  /** Stored town id from the outbound trip; -1 when unset. */
  storedTownId: number;
  homeTownId: number;
  fallbackTemple: Position;
}): AdventurersStoneDecision {
  if (!input.inProtectionZone || input.inHouse || input.pzLocked) {
    return { kind: "refuse" };
  }

  const temple = ADVENTURERS_STONE_TEMPLES.find((entry) =>
    inRange(input.position, entry.from, entry.to),
  );
  if (temple) {
    return { kind: "to-guild", townId: temple.townId, destination: GUILD_ARRIVAL };
  }

  if (inRange(input.position, GUILD_AREA.from, GUILD_AREA.to)) {
    const destination =
      ADVENTURERS_STONE_TEMPLES.find((entry) => entry.townId === input.storedTownId)?.temple ??
      ADVENTURERS_STONE_TEMPLES.find((entry) => entry.townId === input.homeTownId)?.temple ??
      input.fallbackTemple;
    return { kind: "to-temple", destination };
  }

  return { kind: "refuse" };
}
