import type {
  BestiaryCreaturesStateMessage,
  BestiaryMonsterStateMessage,
  BosstiaryBossStateMessage,
  BosstiaryStateMessage,
  WikiItemSourcesStateMessage,
} from "@tibia/protocol";
import type { WikiItem } from "../lib/wiki/WikiItem";

const OUTFIT = {
  head: 0,
  body: 0,
  legs: 0,
  feet: 0,
  addons: 0,
} as const;

export const WIKI_CREATURES: BestiaryCreaturesStateMessage = {
  type: "bestiary-creatures-state",
  charmPoints: 40,
  entries: [
    { raceId: 34, name: "Dragon", className: "Dragon", outfit: { ...OUTFIT, lookType: 34 }, stage: 2, kills: 40 },
    { raceId: 22, name: "Cyclops", className: "Giant", outfit: { ...OUTFIT, lookType: 22 }, stage: 3, kills: 720 },
    { raceId: 16, name: "Bear", className: "Mammal", outfit: { ...OUTFIT, lookType: 16 }, stage: 0, kills: 0 },
    { raceId: 56, name: "Cave Rat", className: "Mammal", outfit: { ...OUTFIT, lookType: 56 }, stage: 2, kills: 55 },
    { raceId: 21, name: "Rat", className: "Mammal", outfit: { ...OUTFIT, lookType: 21 }, stage: 4, kills: 612 },
    { raceId: 27, name: "Wolf", className: "Mammal", outfit: { ...OUTFIT, lookType: 27 }, stage: 1, kills: 4 },
    { raceId: 18, name: "Ghoul", className: "Undead", outfit: { ...OUTFIT, lookType: 18 }, stage: 1, kills: 3 },
    { raceId: 35, name: "Demon", className: "Demon", outfit: { ...OUTFIT, lookType: 35 }, stage: 0, kills: 0 },
    { raceId: 5, name: "Orc", className: "Humanoid", outfit: { ...OUTFIT, lookType: 5 }, stage: 2, kills: 88 },
  ],
};

export const WIKI_MONSTER: BestiaryMonsterStateMessage = {
  type: "bestiary-monster-state",
  raceId: 21,
  name: "Rat",
  className: "Mammal",
  outfit: { ...OUTFIT, lookType: 21 },
  stage: 4,
  kills: 612,
  firstUnlock: 10,
  secondUnlock: 100,
  toKill: 250,
  stars: 1,
  occurrence: 0,
  charmPoints: 5,
  loot: [
    { itemTypeId: 3031, spriteId: 1704, name: "gold coin", rarity: 0 },
    { itemTypeId: 3607, spriteId: 2296, name: "cheese", rarity: 1 },
    { itemTypeId: 3577, spriteId: 2229, name: "meat", rarity: 1 },
    { itemTypeId: 2920, spriteId: 1521, name: "torch", rarity: 2 },
  ],
  stats: {
    maxHealth: 20,
    experience: 5,
    speed: 67,
    armor: 1,
    mitigation: 0.07,
  },
  resistances: [
    { element: "physical", percent: 100 },
    { element: "energy", percent: 100 },
    { element: "earth", percent: 80 },
    { element: "fire", percent: 100 },
    { element: "ice", percent: 110 },
    { element: "holy", percent: 80 },
    { element: "death", percent: 110 },
    { element: "healing", percent: 100 },
  ],
  locations: "Rookgaard and Mainland, in sewers and caves near towns.",
};

export const WIKI_BOSSES: BosstiaryStateMessage = {
  type: "bosstiary-state",
  bossPoints: 50,
  entries: [
    { raceId: 46, name: "Black Knight", outfit: { ...OUTFIT, lookType: 131 }, category: "bane", kills: 112 },
    { raceId: 205, name: "Demodras", outfit: { ...OUTFIT, lookType: 34 }, category: "bane", kills: 12 },
    { raceId: 477, name: "Ferumbras", outfit: { ...OUTFIT, lookType: 35 }, category: "nemesis", kills: 0 },
    { raceId: 478, name: "The Horned Fox", outfit: { ...OUTFIT, lookType: 22 }, category: "archfoe", kills: 7 },
  ],
};

export const WIKI_BOSS: BosstiaryBossStateMessage = {
  type: "bosstiary-boss-state",
  raceId: 477,
  name: "Ferumbras",
  outfit: { ...OUTFIT, lookType: 35 },
  category: "nemesis",
  kills: 3,
  loot: [
    { itemTypeId: 3031, spriteId: 1704, name: "gold coin", rarity: 0 },
    { itemTypeId: 3079, spriteId: 1577, name: "boots of haste", rarity: 3 },
    { itemTypeId: 3043, spriteId: 1749, name: "crystal coin", rarity: 4 },
  ],
  stats: {
    maxHealth: 150000,
    experience: 50000,
    speed: 350,
    armor: 90,
    mitigation: 3.25,
  },
  resistances: [
    { element: "physical", percent: 90 },
    { element: "energy", percent: 80 },
    { element: "earth", percent: 50 },
    { element: "fire", percent: 0 },
    { element: "ice", percent: 110 },
    { element: "holy", percent: 100 },
    { element: "death", percent: 70 },
    { element: "healing", percent: 100 },
  ],
};

export const WIKI_ITEM_SOURCES: WikiItemSourcesStateMessage = {
  type: "wiki-item-sources-state",
  itemTypeId: 3079,
  sources: [
    {
      scope: "bestiary",
      raceId: 34,
      name: "Dragon",
      outfit: { ...OUTFIT, lookType: 34 },
    },
    {
      scope: "bosstiary",
      raceId: 477,
      name: "Ferumbras",
      outfit: { ...OUTFIT, lookType: 35 },
    },
  ],
};

export const WIKI_ITEM: WikiItem = {
  id: 3079,
  name: "boots of haste",
  spriteId: 1577,
  weight: 750,
  description: "These enchanted boots make their wearer move faster.",
  primaryType: "boots",
  equipmentSlot: "boots",
  speed: 40,
  requirements: { level: 20, vocations: ["Knight", "Paladin", "Sorcerer", "Druid"] },
};
