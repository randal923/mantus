import type { CharacterVocation } from "@tibia/protocol";
import { getVocation } from "./getVocation";

export interface DerivedStatModifier {
  readonly maxHealth?: number;
  readonly maxMana?: number;
  readonly capacity?: number;
  readonly speed?: number;
}

export interface DerivedCharacterStats {
  readonly maxHealth: number;
  readonly maxMana: number;
  readonly capacity: number;
  readonly speed: number;
}

const BASE_HEALTH = 150;
const BASE_MANA = 55;
const BASE_CAPACITY = 400;

export function deriveCharacterStats(options: {
  vocation: CharacterVocation;
  definitionVersion: number;
  level: number;
  equipment?: ReadonlyArray<DerivedStatModifier>;
  conditions?: ReadonlyArray<DerivedStatModifier>;
}): DerivedCharacterStats {
  if (!Number.isInteger(options.level) || options.level < 1) {
    throw new Error("character level is out of range");
  }
  const vocation = getVocation(
    options.vocation,
    options.definitionVersion,
  );
  const modifiers = [
    ...(options.equipment ?? []),
    ...(options.conditions ?? []),
  ];
  const bonus = modifiers.reduce<Required<DerivedStatModifier>>(
    (total, modifier) => ({
      maxHealth: total.maxHealth + (modifier.maxHealth ?? 0),
      maxMana: total.maxMana + (modifier.maxMana ?? 0),
      capacity: total.capacity + (modifier.capacity ?? 0),
      speed: total.speed + (modifier.speed ?? 0),
    }),
    { maxHealth: 0, maxMana: 0, capacity: 0, speed: 0 },
  );
  const gainedLevels = options.level - 1;
  return {
    maxHealth: Math.max(
      1,
      BASE_HEALTH + vocation.gains.health * gainedLevels + bonus.maxHealth,
    ),
    maxMana: Math.max(
      0,
      BASE_MANA + vocation.gains.mana * gainedLevels + bonus.maxMana,
    ),
    capacity: Math.max(
      0,
      BASE_CAPACITY +
        vocation.gains.capacity * gainedLevels +
        bonus.capacity,
    ),
    speed: Math.max(
      10,
      vocation.baseSpeed + gainedLevels + bonus.speed,
    ),
  };
}
