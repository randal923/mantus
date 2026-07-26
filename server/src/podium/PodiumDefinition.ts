import type { PodiumFamily } from "@tibia/protocol";

export interface PodiumDefinition {
  readonly family: PodiumFamily;
}

/**
 * Pinned Canary podium item ids (utils_definitions.hpp:692-694; tenacity pair
 * from items.xml:74906-74913). Renown displays owned outfits, vigour an
 * unlocked bosstiary boss, tenacity a completed bestiary race.
 */
export const PODIUM_DEFINITIONS: ReadonlyMap<number, PodiumDefinition> =
  new Map([
    [35_973, { family: "renown" }],
    [35_974, { family: "renown" }],
    [38_707, { family: "vigour" }],
    [42_367, { family: "tenacity" }],
    [42_368, { family: "tenacity" }],
  ]);
