import type { Character } from "./Character";
import type { CharacterRow } from "./CharacterRow";
import type { CharacterSkill } from "../progression/CharacterSkill";
import { parseActionBar } from "./parseActionBar";
import { parsePotionActionBar } from "./parsePotionActionBar";
import { skullFromCode } from "../pvp/skullFromCode";

export function toCharacter(
  row: CharacterRow,
  skills: ReadonlyArray<CharacterSkill>,
  progressionEventIds: ReadonlyArray<string>,
  storageValues: Readonly<Record<string, number>>,
): Character {
  return {
    id: row.id,
    accountId: row.account_id,
    displayName: row.display_name,
    normalizedName: row.normalized_name,
    vocation: row.vocation,
    level: row.level,
    experience: BigInt(row.experience),
    magicLevel: row.magic_level,
    manaSpent: BigInt(row.mana_spent),
    health: row.health,
    mana: row.mana,
    soul: row.soul,
    skills,
    progressionDefinitionVersion: row.progression_definition_version,
    progressionEventIds,
    storageValues,
    positionX: row.position_x,
    positionY: row.position_y,
    positionZ: row.position_z,
    direction: row.direction,
    outfit: {
      lookType: row.outfit_look_type,
      head: row.outfit_head,
      body: row.outfit_body,
      legs: row.outfit_legs,
      feet: row.outfit_feet,
      addons: row.outfit_addons,
    },
    townId: row.town_id,
    actionBar: parseActionBar(row.action_bar),
    potionActionBar: parsePotionActionBar(row.potion_action_bar),
    skull: skullFromCode(row.skull),
    skullExpiresAt: row.skull_expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastLoginAt: row.last_login_at,
    version: row.version,
  };
}
