import type { MonsterType } from "../creature/MonsterType";

/**
 * A minimal valid MonsterType for tests, in the spirit of `makeNpcType`: every
 * field has a default so a test that only cares about placement or AI does not
 * have to restate the whole model.
 */
export function makeMonsterType(
  overrides: Partial<MonsterType> & { id: string },
): MonsterType {
  return {
    name: overrides.id,
    description: overrides.id,
    outfit: { lookType: 21, head: 0, body: 0, legs: 0, feet: 0, addons: 0 },
    health: 20,
    maxHealth: 20,
    speed: 67,
    manaCost: 0,
    changeTarget: { intervalMs: 4_000, chance: 0 },
    light: { intensity: 0, color: 0 },
    experience: 5,
    corpseItemTypeId: 5964,
    race: "blood",
    faction: "default",
    enemyFactions: [],
    flags: {
      attackable: true,
      hostile: false,
      pushable: true,
      summonable: false,
      convinceable: false,
      illusionable: false,
      canPushItems: false,
      canPushCreatures: false,
      targetDistance: 1,
      runHealth: 5,
      staticAttackChance: 95,
      healthHidden: false,
      canWalkOnEnergy: false,
      canWalkOnFire: false,
      canWalkOnPoison: false,
      isBlockable: true,
      rewardBoss: false,
    },
    targetStrategy: { nearest: 100, health: 0, damage: 0, random: 0 },
    attacks: [],
    defenses: [],
    elements: {},
    immunities: [],
    reflects: {},
    heals: {},
    events: [],
    callbacks: [],
    maxSummons: 0,
    summons: [],
    voices: [],
    loot: [],
    ...overrides,
  };
}
