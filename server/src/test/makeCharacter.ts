import {
  createDefaultActionBar,
  DEFAULT_ACTION_BOT_SETTINGS,
  DEFAULT_HUNTING_BOT_ROUTE,
  DEFAULT_LOOT_FILTER,
  MAX_STAMINA_MINUTES,
} from "@tibia/protocol";
import type { Character } from "../character/Character";
import { createInitialSkills } from "../progression/createInitialSkills";
import { deriveCharacterStats } from "../progression/deriveCharacterStats";
import { getVocation } from "../progression/getVocation";
import { PROGRESSION_DEFINITION_VERSION } from "../progression/progressionDefinitionVersion";

export function makeCharacter(id: string, displayName = id): Character {
  const now = new Date("2026-01-01T00:00:00.000Z");
  const stats = deriveCharacterStats({
    vocation: "Knight",
    definitionVersion: PROGRESSION_DEFINITION_VERSION,
    level: 1,
  });
  return {
    id,
    accountId: "account-id",
    displayName,
    normalizedName: displayName.toLowerCase(),
    vocation: "Knight",
    sex: "male",
    level: 1,
    experience: 0n,
    magicLevel: 0,
    manaSpent: 0n,
    health: stats.maxHealth,
    mana: stats.maxMana,
    soul: getVocation("Knight").maxSoul,
    stamina: MAX_STAMINA_MINUTES,
    lastSeenAt: null,
    skills: createInitialSkills(),
    progressionDefinitionVersion: PROGRESSION_DEFINITION_VERSION,
    progressionEventIds: [],
    storageValues: {},
    positionX: 0,
    positionY: 0,
    positionZ: 7,
    direction: "south",
    outfit: {
      lookType: 128,
      head: 78,
      body: 68,
      legs: 58,
      feet: 76,
      addons: 0,
    },
    townId: 1,
    actionBar: createDefaultActionBar(),
    actionBotSettings: { ...DEFAULT_ACTION_BOT_SETTINGS },
    lootFilter: { ...DEFAULT_LOOT_FILTER, ignoredItemTypeIds: [] },
    huntingBotRoute: { ...DEFAULT_HUNTING_BOT_ROUTE, waypoints: [] },
    aimAtTargetSpellIds: [],
    skull: "none",
    skullExpiresAt: null,
    createdAt: now,
    updatedAt: now,
    lastLoginAt: null,
    namelocked: false,
    mountId: 0,
    version: 1,
  };
}
