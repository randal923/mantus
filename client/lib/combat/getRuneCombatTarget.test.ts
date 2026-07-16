import { describe, expect, it } from "vitest";
import type {
  CreatureState,
  SpellCatalogEntry,
} from "@tibia/protocol";
import { getRuneCombatTarget } from "./getRuneCombatTarget";

const RUNE = {
  id: "avalanche-rune",
  origin: "rune",
  runeItemTypeId: 3161,
  name: "avalanche rune",
  words: null,
  damageType: "ice",
  effectId: 42,
  manaCost: 0,
  soulCost: 0,
  requiredLevel: 30,
  requiredMagicLevel: 4,
  needWeapon: false,
  cooldownMs: 2_000,
  cooldownGroups: ["spell:avalanche-rune", "group:attack"],
  targetKind: "position",
} as const satisfies SpellCatalogEntry;

describe("getRuneCombatTarget", () => {
  it("uses the selected creature position for area runes", () => {
    const creature = {
      id: "target",
      position: { x: 8, y: 9, z: 7 },
    } as CreatureState;

    expect(
      getRuneCombatTarget(
        RUNE,
        creature.id,
        [creature],
        { x: 1, y: 1, z: 7 },
      ),
    ).toEqual({ kind: "position", position: creature.position });
  });

  it("falls back to the player's tile when no ground target is selected", () => {
    expect(
      getRuneCombatTarget(
        RUNE,
        null,
        [],
        { x: 1, y: 1, z: 7 },
      ),
    ).toEqual({
      kind: "position",
      position: { x: 1, y: 1, z: 7 },
    });
  });
});
