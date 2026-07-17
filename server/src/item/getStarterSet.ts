import type { StarterVocation } from "@tibia/protocol";
import type { StarterSet } from "./StarterSet";

const COMMON_EQUIPMENT = [
  { typeId: 3355, slot: "helmet" },
  { typeId: 3552, slot: "boots" },
  { typeId: 2854, slot: "backpack" },
] as const;

const COMMON_SUPPLIES = [
  { typeId: 3035, count: 50 },
  { typeId: 266, count: 5 },
  { typeId: 3577, count: 3 },
] as const;

const STARTER_SETS: Readonly<Record<StarterVocation, StarterSet>> = {
  Knight: {
    equipment: [
      ...COMMON_EQUIPMENT,
      { typeId: 3361, slot: "armor" },
      { typeId: 3362, slot: "legs" },
      { typeId: 3273, slot: "weapon" },
      { typeId: 3412, slot: "shield" },
    ],
    backpackContents: COMMON_SUPPLIES,
  },
  Paladin: {
    equipment: [
      ...COMMON_EQUIPMENT,
      { typeId: 3361, slot: "armor" },
      { typeId: 3362, slot: "legs" },
      { typeId: 3277, slot: "weapon", count: 5 },
      { typeId: 3412, slot: "shield" },
    ],
    backpackContents: [
      ...COMMON_SUPPLIES,
      { typeId: 268, count: 3 },
    ],
  },
  Sorcerer: {
    equipment: [
      ...COMMON_EQUIPMENT,
      { typeId: 3562, slot: "armor" },
      { typeId: 3559, slot: "legs" },
      { typeId: 3292, slot: "weapon" },
      { typeId: 3059, slot: "shield" },
    ],
    backpackContents: [
      ...COMMON_SUPPLIES,
      { typeId: 268, count: 5 },
      { typeId: 3074, count: 1 },
    ],
  },
  Druid: {
    equipment: [
      ...COMMON_EQUIPMENT,
      { typeId: 3562, slot: "armor" },
      { typeId: 3559, slot: "legs" },
      { typeId: 3293, slot: "weapon" },
      { typeId: 3059, slot: "shield" },
    ],
    backpackContents: [
      ...COMMON_SUPPLIES,
      { typeId: 268, count: 5 },
      { typeId: 3066, count: 1 },
    ],
  },
  Monk: {
    equipment: [
      ...COMMON_EQUIPMENT,
      { typeId: 50257, slot: "armor" },
      { typeId: 3362, slot: "legs" },
      { typeId: 3412, slot: "shield" },
    ],
    backpackContents: [
      ...COMMON_SUPPLIES,
      { typeId: 50181, count: 1 },
    ],
  },
};

export function getStarterSet(vocation: StarterVocation): StarterSet {
  return STARTER_SETS[vocation];
}
