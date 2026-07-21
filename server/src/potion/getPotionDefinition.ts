import type { StarterVocation } from "@tibia/protocol";

export interface PotionDefinition {
  readonly health?: readonly [minimum: number, maximum: number];
  readonly mana?: readonly [minimum: number, maximum: number];
  readonly level?: number;
  readonly vocations?: ReadonlyArray<StarterVocation>;
  readonly flaskTypeId: number;
}

const POTIONS: Readonly<Record<number, PotionDefinition>> = {
  236: {
    health: [250, 350],
    level: 50,
    vocations: ["Paladin", "Knight", "Monk"],
    flaskTypeId: 283,
  },
  237: { mana: [115, 185], level: 50, flaskTypeId: 283 },
  238: {
    mana: [150, 250],
    level: 80,
    vocations: ["Sorcerer", "Druid", "Paladin", "Monk"],
    flaskTypeId: 284,
  },
  239: {
    health: [425, 575],
    level: 80,
    vocations: ["Knight"],
    flaskTypeId: 284,
  },
  266: { health: [125, 175], flaskTypeId: 285 },
  268: { mana: [75, 125], flaskTypeId: 285 },
  7642: {
    health: [250, 350],
    mana: [100, 200],
    level: 80,
    vocations: ["Paladin", "Monk"],
    flaskTypeId: 284,
  },
  7643: {
    health: [650, 850],
    level: 130,
    vocations: ["Knight"],
    flaskTypeId: 284,
  },
  7876: { health: [60, 90], flaskTypeId: 285 },
  23373: {
    mana: [425, 575],
    level: 130,
    vocations: ["Sorcerer", "Druid"],
    flaskTypeId: 284,
  },
  23374: {
    health: [420, 580],
    mana: [250, 350],
    level: 130,
    vocations: ["Paladin", "Monk"],
    flaskTypeId: 284,
  },
  23375: {
    health: [875, 1125],
    level: 200,
    vocations: ["Knight"],
    flaskTypeId: 284,
  },
};

export function getPotionDefinition(
  itemTypeId: number,
): PotionDefinition | undefined {
  return POTIONS[itemTypeId];
}
