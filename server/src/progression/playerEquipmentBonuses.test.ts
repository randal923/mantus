import { describe, expect, it } from "vitest";
import { playerCombatSkill } from "../combat/playerCombatSkill";
import type { PlayerImbuementEffects } from "../imbuement/playerImbuementEffects";
import type { Item } from "../item/Item";
import type { ItemType } from "../item/ItemType";
import { Player } from "../Player";
import { makeCharacter } from "../test/makeCharacter";
import { playerEquipmentBonuses } from "./playerEquipmentBonuses";

const NO_IMBUEMENTS = {
  skills: {},
  magicLevel: 0,
  speed: 0,
} as unknown as PlayerImbuementEffects;

const equip = (type: Partial<ItemType>) =>
  ({ item: {} as Item, type: type as ItemType });

const makePlayer = () =>
  new Player(makeCharacter("hero", "Hero"), { x: 0, y: 0, z: 7 }, 0);

describe("playerEquipmentBonuses", () => {
  it("sums the item speed attribute that drives walk speed", () => {
    const bonuses = playerEquipmentBonuses(
      [equip({ speed: 20 }), equip({ speed: 15 })],
      NO_IMBUEMENTS,
    );

    expect(bonuses.speed).toBe(35);
  });

  it("adds imbuement speed to the item attribute", () => {
    const bonuses = playerEquipmentBonuses([equip({ speed: 20 })], {
      ...NO_IMBUEMENTS,
      speed: 10,
    });

    expect(bonuses.speed).toBe(30);
  });

  it("reports the same skill delta the combat path applies", () => {
    const player = makePlayer();
    const equipment = [
      equip({ skillModifiers: { sword: 4 } }),
      equip({ skillModifiers: { shield: 2, dist: 3 } }),
    ];

    const bonuses = playerEquipmentBonuses(equipment, NO_IMBUEMENTS);

    expect(bonuses.skills).toEqual({ sword: 4, shielding: 2, distance: 3 });
    // The panel can never claim a bonus the swing does not use — including
    // the two skills whose catalog keys are aliased.
    for (const skill of ["sword", "shielding", "distance"] as const) {
      expect(player.skillLevel(skill) + (bonuses.skills[skill] ?? 0)).toBe(
        playerCombatSkill(player, equipment, skill, 0),
      );
    }
  });

  it("reports the magic-level points equipped gear grants", () => {
    const bonuses = playerEquipmentBonuses(
      [equip({ magicLevelPoints: 3 }), equip({ magicLevelPoints: 2 })],
      NO_IMBUEMENTS,
    );

    expect(bonuses.magicLevel).toBe(5);
  });

  it("reports nothing for a character wearing nothing", () => {
    expect(playerEquipmentBonuses([], NO_IMBUEMENTS)).toEqual({
      skills: {},
      magicLevel: 0,
      speed: 0,
    });
  });
});
