import type { Character } from "./Character";
import type { CharacterRow } from "./CharacterRow";
import type { CharacterSkill } from "../progression/CharacterSkill";
import { parseActionBar } from "./parseActionBar";
import { parseActionBotSettings } from "./parseActionBotSettings";
import { parseAimAtTargetSpells } from "./parseAimAtTargetSpells";
import { parseHuntingBotRoute } from "./parseHuntingBotRoute";
import { parseLootFilter } from "./parseLootFilter";
import { skullFromCode } from "../pvp/skullFromCode";
import { sexFromCode } from "./sexFromCode";

export function toCharacter(
  row: CharacterRow,
  skills: ReadonlyArray<CharacterSkill>,
  progressionEventIds: ReadonlyArray<string>,
  storageValues: Readonly<Record<string, number>>,
): Character {
  const actionBar = parseActionBar(row.action_bar, row.potion_action_bar);
  return {
    id: row.id,
    accountId: row.account_id,
    displayName: row.display_name,
    normalizedName: row.normalized_name,
    vocation: row.vocation,
    sex: sexFromCode(row.sex),
    level: row.level,
    experience: BigInt(row.experience),
    magicLevel: row.magic_level,
    manaSpent: BigInt(row.mana_spent),
    health: row.health,
    mana: row.mana,
    soul: row.soul,
    stamina: row.stamina,
    lastSeenAt: row.last_seen_at,
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
    actionBar,
    actionBotSettings: parseActionBotSettings(
      row.potion_action_bar,
      actionBar,
    ),
    lootFilter: parseLootFilter(row.loot_filter),
    huntingBotRoute: parseHuntingBotRoute(row.hunting_bot),
    aimAtTargetSpellIds: parseAimAtTargetSpells(row.aim_at_target_spells),
    skull: skullFromCode(row.skull),
    skullExpiresAt: row.skull_expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastLoginAt: row.last_login_at,
    namelocked: row.namelocked ?? false,
    mountId: row.mount_id ?? 0,
    version: row.version,
  };
}
