import type { StarterVocation } from "@tibia/protocol";
import { ADVENTURERS_STONE_TYPE_ID } from "./adventurersStoneTypeId";
import { BOUND_CONTAINER_TYPE_ID } from "./boundContainerTypeId";
import { ITEM_POUCH_TYPE_ID } from "./itemPouchTypeId";
import type { StarterSet } from "./StarterSet";

// Canary's mainland level-8 loadout (data/scripts/creaturescripts/player/
// send_first_items.lua), plus this game's bound container and common
// supplies. Every vocation weapon is equipped from the start: the wands and
// rods need level 6, which a level-8 character already meets.

const COMMON_EQUIPMENT = [
  { typeId: 3572, slot: "amulet" }, // scarf
  { typeId: 3552, slot: "boots" }, // leather boots
  { typeId: 2854, slot: "backpack" },
  { typeId: BOUND_CONTAINER_TYPE_ID, slot: "bound" },
] as const;

const COMMON_BOUND_CONTENTS = [
  { typeId: ITEM_POUCH_TYPE_ID, count: 1 },
  { typeId: ADVENTURERS_STONE_TYPE_ID, count: 1 },
] as const;

const COMMON_SUPPLIES = [
  { typeId: 3043, count: 5 }, // crystal coins
  { typeId: 266, count: 5 }, // health potions
  { typeId: 3577, count: 3 }, // meat
  { typeId: 3003, count: 1 }, // rope
  { typeId: 3457, count: 1 }, // shovel
] as const;

const MAGE_EQUIPMENT = [
  ...COMMON_EQUIPMENT,
  { typeId: 7992, slot: "helmet" }, // mage hat
  { typeId: 7991, slot: "armor" }, // magician's robe
  { typeId: 3362, slot: "legs" }, // studded legs
  { typeId: 3059, slot: "shield" }, // spellbook
] as const;

const BRASS_EQUIPMENT = [
  ...COMMON_EQUIPMENT,
  { typeId: 3354, slot: "helmet" }, // brass helmet
  { typeId: 3359, slot: "armor" }, // brass armor
  { typeId: 3372, slot: "legs" }, // brass legs
] as const;

const STARTER_SETS: Readonly<
  Record<StarterVocation, Omit<StarterSet, "boundContents">>
> = {
  Knight: {
    equipment: [
      ...BRASS_EQUIPMENT,
      { typeId: 7773, slot: "weapon" }, // steel axe
      { typeId: 3425, slot: "shield" }, // dwarven shield
    ],
    backpackContents: [
      ...COMMON_SUPPLIES,
      { typeId: 7774, count: 1 }, // jagged sword
      { typeId: 3327, count: 1 }, // daramian mace
    ],
  },
  Paladin: {
    equipment: [
      ...COMMON_EQUIPMENT,
      { typeId: 3374, slot: "helmet" }, // legion helmet
      { typeId: 3571, slot: "armor" }, // ranger's cloak
      { typeId: 8095, slot: "legs" }, // ranger legs
      { typeId: 3277, slot: "weapon", count: 5 }, // spears
      { typeId: 3425, slot: "shield" }, // dwarven shield
    ],
    backpackContents: [
      ...COMMON_SUPPLIES,
      { typeId: 3350, count: 1 }, // bow
      { typeId: 3447, count: 50 }, // arrows
    ],
  },
  Sorcerer: {
    equipment: [
      ...MAGE_EQUIPMENT,
      { typeId: 3074, slot: "weapon" }, // wand of vortex
    ],
    backpackContents: [
      ...COMMON_SUPPLIES,
      { typeId: 268, count: 10 }, // mana potions
    ],
  },
  Druid: {
    equipment: [
      ...MAGE_EQUIPMENT,
      { typeId: 3066, slot: "weapon" }, // snakebite rod
    ],
    backpackContents: [
      ...COMMON_SUPPLIES,
      { typeId: 268, count: 10 }, // mana potions
    ],
  },
  Monk: {
    equipment: [
      ...BRASS_EQUIPMENT,
      { typeId: 50171, slot: "weapon" }, // jo staff (two-handed)
    ],
    backpackContents: [
      ...COMMON_SUPPLIES,
      { typeId: 3425, count: 1 }, // dwarven shield
    ],
  },
};

export function getStarterSet(vocation: StarterVocation): StarterSet {
  return { ...STARTER_SETS[vocation], boundContents: COMMON_BOUND_CONTENTS };
}
