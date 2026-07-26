import { describe, expect, it } from "vitest";
import { EMPTY_WHEEL_BONUSES, type CharacterVocation } from "@tibia/protocol";
import type { Item } from "../item/Item";
import type { ItemType } from "../item/ItemType";
import { Player } from "../Player";
import { makeCharacter } from "../test/makeCharacter";
import { playerMitigation } from "./playerMitigation";

const PLAYER_ID = "00000000-0000-4000-8000-000000000031";

function makePlayer(vocation: CharacterVocation): Player {
  return new Player(
    { ...makeCharacter(PLAYER_ID, "Blocker"), vocation },
    { x: 1, y: 1, z: 7 },
    0,
  );
}

function makeType(overrides: Partial<ItemType>): ItemType {
  return {
    id: 1,
    clientId: 1,
    name: "test item",
    spriteId: 1,
    stackable: false,
    maxCount: 1,
    weight: 100,
    pickupable: true,
    movable: true,
    light: { intensity: 0, color: 0 },
    elevation: 0,
    render: {
      ground: false,
      groundBorder: false,
      onBottom: false,
      onTop: false,
      stackable: false,
      fluidContainer: false,
      splash: false,
      hangable: false,
      hookSouth: false,
      hookEast: false,
      lyingCorpse: false,
      animateAlways: false,
      topEffect: false,
    },
    ...overrides,
  };
}

function equipped(
  slot: "weapon" | "shield",
  type: ItemType,
): { item: Item; type: ItemType } {
  return {
    item: {
      id: `item-${slot}`,
      typeId: type.id,
      count: 1,
      attributes: {},
      version: 1,
      location: { kind: "equipment", characterId: PLAYER_ID, slot },
    },
    type,
  };
}

describe("playerMitigation", () => {
  // Values verified by hand against Canary's calculateMitigation
  // (player_wheel.cpp:4033-4086) with the pinned vocations.xml constants.
  it("combines shielding skill, shield defense, and fight mode", () => {
    const knight = makePlayer("Elite Knight");
    const shield = [equipped("shield", makeType({ defense: 30, weaponType: "shield" }))];
    // skill 10 x 1.3 + 2.05 x 30 = 74.5 -> ceil -> 0.75 %.
    expect(playerMitigation(knight, shield, "balanced")).toBeCloseTo(0.75);
    expect(playerMitigation(knight, shield, "offensive")).toBeCloseTo(0.6);
    expect(playerMitigation(knight, shield, "defensive")).toBeCloseTo(0.9);
  });

  it("multiplies by the wheel mitigation bonus", () => {
    const knight = makePlayer("Elite Knight");
    knight.setWheelBonuses({ ...EMPTY_WHEEL_BONUSES, mitigationPercent: 24 });
    const shield = [equipped("shield", makeType({ defense: 30, weaponType: "shield" }))];
    // 0.75 + 24 % of 0.75 = 0.93.
    expect(playerMitigation(knight, shield, "balanced")).toBeCloseTo(0.93);
  });

  it("uses the secondary factor for two-handed weapons", () => {
    const knight = makePlayer("Elite Knight");
    const weapon = [
      equipped(
        "weapon",
        makeType({ defense: 25, weaponType: "sword", slotType: "two-handed" }),
      ),
    ];
    // skill 10 x 1.3 + 1.25 x 25 = 44.25 -> ceil -> 0.45 %.
    expect(playerMitigation(knight, weapon, "balanced")).toBeCloseTo(0.45);
  });

  it("treats a spellbook as a distance-factor shield", () => {
    const sorcerer = makePlayer("Master Sorcerer");
    const loadout = [
      equipped("shield", makeType({ defense: 14, weaponType: "spellbook" })),
      equipped("weapon", makeType({ weaponType: "wand" })),
    ];
    // (10 x 1.26 + 2.0 x 14) x 1.2 = 48.72 -> ceil -> 0.49 %.
    expect(playerMitigation(sorcerer, loadout, "balanced")).toBeCloseTo(0.49);
  });
});
