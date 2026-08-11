import type { Position } from "@tibia/protocol";
import {
  ELEMENTAL_SHRINE_DESTINATIONS,
  ELEMENTAL_SHRINE_ENTRANCES,
  ELEMENTAL_SHRINE_EXITS,
  ELEMENTAL_SHRINE_LEVEL,
  ELEMENTAL_SHRINE_RETURNS,
} from "./elementalShrineTables";
import { positionKey } from "../positionKey";
import { resolveStoredTempleDestination } from "./resolveStoredTempleDestination";

export type ElementalShrineDecision =
  | { kind: "ignore" }
  /** Level too low: Canary pushes the stepper back where they came from. */
  | { kind: "refuse" }
  | { kind: "enter"; destination: Position; cityIndex: number }
  | { kind: "leave"; destination: Position };

const entrances = new Map(
  ELEMENTAL_SHRINE_ENTRANCES.map((entrance) => [
    positionKey(entrance.position),
    entrance,
  ]),
);
const exits = new Set(ELEMENTAL_SHRINE_EXITS.map(positionKey));

/**
 * Canary's shrine MoveEvents: a city flame demands level 30 and remembers the
 * city it sent the player from, and a shrine flame returns them to that city —
 * or to their own town's temple when nothing was remembered.
 */
export function resolveElementalShrineStep(input: {
  position: Position;
  level: number;
  /** Stored city index from the way in; -1 when unset. */
  storedCityIndex: number;
  homeTownId: number;
  fallbackTemple: Position;
}): ElementalShrineDecision {
  const key = positionKey(input.position);
  const entrance = entrances.get(key);
  if (entrance) {
    if (input.level < ELEMENTAL_SHRINE_LEVEL) return { kind: "refuse" };
    return {
      kind: "enter",
      destination: ELEMENTAL_SHRINE_DESTINATIONS[entrance.element],
      cityIndex: entrance.cityIndex,
    };
  }
  if (!exits.has(key)) return { kind: "ignore" };
  return {
    kind: "leave",
    destination:
      ELEMENTAL_SHRINE_RETURNS[input.storedCityIndex - 1] ??
      resolveStoredTempleDestination({
        storedTownId: -1,
        homeTownId: input.homeTownId,
        fallbackTemple: input.fallbackTemple,
      }),
  };
}
