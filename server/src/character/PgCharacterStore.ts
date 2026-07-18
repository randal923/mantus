import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { CharacterError } from "./CharacterError";
import type {
  Character,
  CharacterSaveSnapshot,
  CharacterSummary,
} from "./Character";
import type { CharacterStore } from "./CharacterStore";
import type { StarterSet } from "../item/StarterSet";
import type { CharacterSkill } from "../progression/CharacterSkill";
import { assertValidCharacterSaveSnapshot } from "../progression/assertValidCharacterSaveSnapshot";

interface CharacterRow {
  id: string;
  account_id: string;
  display_name: string;
  normalized_name: string;
  vocation: Character["vocation"];
  level: number;
  experience: string;
  magic_level: number;
  mana_spent: string;
  health: number;
  mana: number;
  soul: number;
  progression_definition_version: number;
  position_x: number;
  position_y: number;
  position_z: number;
  direction: Character["direction"];
  outfit_look_type: Character["outfit"]["lookType"];
  outfit_head: number;
  outfit_body: number;
  outfit_legs: number;
  outfit_feet: number;
  outfit_addons: number;
  town_id: number;
  created_at: Date;
  updated_at: Date;
  last_login_at: Date | null;
  version: number;
}

interface LoadedCharacterRow extends CharacterRow {
  skills: Array<{
    skill: CharacterSkill["skill"];
    level: number;
    tries: string;
  }>;
  progression_event_ids: string[];
  storage_values: Record<string, unknown>;
}

const CHARACTER_COLUMNS = `
  id, account_id, display_name, normalized_name, vocation, level,
  experience, magic_level, mana_spent, health, mana, soul,
  progression_definition_version,
  position_x, position_y, position_z, direction, outfit_look_type,
  outfit_head, outfit_body, outfit_legs, outfit_feet, outfit_addons,
  town_id, created_at, updated_at, last_login_at, version`;

export class PgCharacterStore implements CharacterStore {
  constructor(private readonly pool: Pool) {}

  async listByAccountId(accountId: string): Promise<CharacterSummary[]> {
    const result = await this.pool.query<CharacterRow>(
      `SELECT ${CHARACTER_COLUMNS}
       FROM characters
       WHERE account_id = $1
       ORDER BY last_login_at DESC NULLS LAST, created_at ASC`,
      [accountId],
    );
    return result.rows.map((row) => ({
      id: row.id,
      displayName: row.display_name,
      vocation: row.vocation,
      level: row.level,
      outfit: {
        lookType: row.outfit_look_type,
        head: row.outfit_head,
        body: row.outfit_body,
        legs: row.outfit_legs,
        feet: row.outfit_feet,
        addons: row.outfit_addons,
      },
      lastLoginAt: row.last_login_at,
    }));
  }

  async create(
    character: Character,
    maxCharacters: number,
    starterSet: StarterSet,
  ): Promise<Character> {
    if (character.progressionEventIds.length > 0) {
      throw new Error("new character cannot have progression events");
    }
    assertValidCharacterSaveSnapshot({
      characterId: character.id,
      expectedVersion: character.version,
      vocation: character.vocation,
      progressionDefinitionVersion: character.progressionDefinitionVersion,
      level: character.level,
      experience: character.experience,
      magicLevel: character.magicLevel,
      manaSpent: character.manaSpent,
      health: character.health,
      mana: character.mana,
      soul: character.soul,
      skills: character.skills,
      progressionEvents: [],
      positionX: character.positionX,
      positionY: character.positionY,
      positionZ: character.positionZ,
      direction: character.direction,
      outfit: character.outfit,
    });
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await this.lockAccount(client, character.accountId);
      const count = await client.query<{ count: string }>(
        "SELECT count(*) FROM characters WHERE account_id = $1",
        [character.accountId],
      );
      if (Number(count.rows[0]?.count ?? maxCharacters) >= maxCharacters) {
        throw new CharacterError("limit-reached");
      }
      const result = await client.query<CharacterRow>(
        `INSERT INTO characters (
           id, account_id, display_name, normalized_name, vocation, level,
           experience, magic_level, mana_spent, health, mana, soul,
           progression_definition_version,
           position_x, position_y, position_z, direction, outfit_look_type,
           outfit_head, outfit_body, outfit_legs, outfit_feet, outfit_addons,
           town_id, created_at, updated_at, last_login_at, version
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
           $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26,
           $27, $28
         )
         RETURNING ${CHARACTER_COLUMNS}`,
        [
          character.id,
          character.accountId,
          character.displayName,
          character.normalizedName,
          character.vocation,
          character.level,
          character.experience.toString(),
          character.magicLevel,
          character.manaSpent.toString(),
          character.health,
          character.mana,
          character.soul,
          character.progressionDefinitionVersion,
          character.positionX,
          character.positionY,
          character.positionZ,
          character.direction,
          character.outfit.lookType,
          character.outfit.head,
          character.outfit.body,
          character.outfit.legs,
          character.outfit.feet,
          character.outfit.addons,
          character.townId,
          character.createdAt,
          character.updatedAt,
          character.lastLoginAt,
          character.version,
        ],
      );
      const row = result.rows[0];
      if (!row) throw new Error("character insert returned no row");
      await this.insertSkills(client, character.id, character.skills);
      await this.insertStarterSet(client, character.id, starterSet);
      await client.query("COMMIT");
      return this.toCharacter(row, character.skills, [], {});
    } catch (cause) {
      await client.query("ROLLBACK");
      if (this.isNormalizedNameConflict(cause)) {
        throw new CharacterError("name-taken");
      }
      throw cause;
    } finally {
      client.release();
    }
  }

  async findByIdForAccount(
    accountId: string,
    characterId: string,
  ): Promise<Character | null> {
    const result = await this.pool.query<LoadedCharacterRow>(
      `SELECT ${CHARACTER_COLUMNS},
         coalesce(
           (
             SELECT json_agg(
               json_build_object(
                 'skill', skill,
                 'level', level,
                 'tries', tries::text
               )
               ORDER BY skill
             )
             FROM character_skills
             WHERE character_id = characters.id
           ),
           '[]'::json
         ) AS skills,
         coalesce(
           (
             SELECT array_agg(event_id ORDER BY occurred_at, event_id)
             FROM progression_events
             WHERE character_id = characters.id
           ),
           ARRAY[]::varchar[]
         ) AS progression_event_ids,
         coalesce(
           (
             SELECT jsonb_object_agg(storage_key, storage_value)
             FROM character_storages
             WHERE character_id = characters.id
           ),
           '{}'::jsonb
         ) AS storage_values
       FROM characters
       WHERE id = $1 AND account_id = $2`,
      [characterId, accountId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return this.toCharacter(
      row,
      row.skills.map((skill) => ({
        skill: skill.skill,
        level: skill.level,
        tries: Number(skill.tries),
      })),
      row.progression_event_ids,
      this.parseStorageValues(row.storage_values),
    );
  }

  async recordLogin(
    accountId: string,
    characterId: string,
    loggedInAt: Date,
  ): Promise<void> {
    const result = await this.pool.query(
      `UPDATE characters
       SET last_login_at = $3
       WHERE id = $1 AND account_id = $2`,
      [characterId, accountId, loggedInAt],
    );
    if (result.rowCount !== 1) throw new CharacterError("not-found");
  }

  async saveSnapshot(snapshot: CharacterSaveSnapshot): Promise<number> {
    assertValidCharacterSaveSnapshot(snapshot);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<{ version: number }>(
        `UPDATE characters
         SET level = $3, experience = $4, magic_level = $5, mana_spent = $6,
             health = $7, mana = $8, soul = $9, position_x = $10,
             position_y = $11, position_z = $12, direction = $13,
             outfit_look_type = $14, outfit_head = $15, outfit_body = $16,
             outfit_legs = $17, outfit_feet = $18, outfit_addons = $19,
             updated_at = now(), version = version + 1
         WHERE id = $1 AND version = $2
           AND vocation = $20 AND progression_definition_version = $21
         RETURNING version`,
        [
          snapshot.characterId,
          snapshot.expectedVersion,
          snapshot.level,
          snapshot.experience.toString(),
          snapshot.magicLevel,
          snapshot.manaSpent.toString(),
          snapshot.health,
          snapshot.mana,
          snapshot.soul,
          snapshot.positionX,
          snapshot.positionY,
          snapshot.positionZ,
          snapshot.direction,
          snapshot.outfit.lookType,
          snapshot.outfit.head,
          snapshot.outfit.body,
          snapshot.outfit.legs,
          snapshot.outfit.feet,
          snapshot.outfit.addons,
          snapshot.vocation,
          snapshot.progressionDefinitionVersion,
        ],
      );
      const version = result.rows[0]?.version;
      if (!version) throw new CharacterError("version-conflict");
      for (const skill of snapshot.skills) {
        const updated = await client.query(
          `UPDATE character_skills
           SET level = $3, tries = $4
           WHERE character_id = $1 AND skill = $2`,
          [
            snapshot.characterId,
            skill.skill,
            skill.level,
            skill.tries.toString(),
          ],
        );
        if (updated.rowCount !== 1) {
          throw new Error(`character skill ${skill.skill} was not found`);
        }
      }
      for (const event of snapshot.progressionEvents) {
        const inserted = await client.query(
          `INSERT INTO progression_events (
             character_id, event_id, event_type
           ) VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING`,
          [snapshot.characterId, event.id, event.type],
        );
        if (inserted.rowCount !== 1) {
          throw new CharacterError("version-conflict");
        }
      }
      await client.query("COMMIT");
      return version;
    } catch (cause) {
      await client.query("ROLLBACK");
      throw cause;
    } finally {
      client.release();
    }
  }

  private async lockAccount(
    client: PoolClient,
    accountId: string,
  ): Promise<void> {
    const account = await client.query(
      "SELECT id FROM accounts WHERE id = $1 FOR UPDATE",
      [accountId],
    );
    if (account.rowCount !== 1) throw new Error("character account not found");
  }

  private async insertStarterSet(
    client: PoolClient,
    characterId: string,
    starterSet: StarterSet,
  ): Promise<void> {
    let backpackId: string | undefined;
    for (const item of starterSet.equipment) {
      const itemId = randomUUID();
      await client.query(
        `INSERT INTO items (
           id, item_type_id, count, location_type, character_id, equipment_slot
         ) VALUES ($1, $2, $3, 'equipment', $4, $5)`,
        [itemId, item.typeId, item.count ?? 1, characterId, item.slot],
      );
      await this.auditStarterItem(
        client,
        characterId,
        itemId,
        item.typeId,
        item.count ?? 1,
      );
      if (item.slot === "backpack") backpackId = itemId;
    }
    if (!backpackId && starterSet.backpackContents.length > 0) {
      throw new Error("starter supplies require an equipped backpack");
    }
    for (const [slot, item] of starterSet.backpackContents.entries()) {
      const itemId = randomUUID();
      await client.query(
        `INSERT INTO items (
           id, item_type_id, count, location_type, container_id, slot_index
         ) VALUES ($1, $2, $3, 'container', $4, $5)`,
        [itemId, item.typeId, item.count, backpackId, slot],
      );
      await this.auditStarterItem(
        client,
        characterId,
        itemId,
        item.typeId,
        item.count,
      );
    }
  }

  private async insertSkills(
    client: PoolClient,
    characterId: string,
    skills: ReadonlyArray<CharacterSkill>,
  ): Promise<void> {
    for (const skill of skills) {
      await client.query(
        `INSERT INTO character_skills (character_id, skill, level, tries)
         VALUES ($1, $2, $3, $4)`,
        [characterId, skill.skill, skill.level, skill.tries.toString()],
      );
    }
  }

  private async auditStarterItem(
    client: PoolClient,
    characterId: string,
    itemId: string,
    itemTypeId: number,
    count: number,
  ): Promise<void> {
    await client.query(
      `INSERT INTO audit_log (
         event_type, character_id, item_id, details
       ) VALUES (
         'item-created', $1, $2, jsonb_build_object(
           'reason', 'starter-set', 'itemTypeId', $3::integer, 'count', $4::integer
         )
       )`,
      [characterId, itemId, itemTypeId, count],
    );
  }

  private isNormalizedNameConflict(cause: unknown): boolean {
    if (!cause || typeof cause !== "object") return false;
    return (
      "code" in cause &&
      cause.code === "23505" &&
      "constraint" in cause &&
      cause.constraint === "characters_normalized_name_key"
    );
  }

  private toCharacter(
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
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastLoginAt: row.last_login_at,
      version: row.version,
    };
  }

  private parseStorageValues(value: unknown): Record<string, number> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("character storage values are invalid");
    }
    const parsed: Record<string, number> = {};
    for (const [key, storageValue] of Object.entries(value)) {
      if (
        key.length < 1 ||
        key.length > 192 ||
        typeof storageValue !== "number" ||
        !Number.isInteger(storageValue) ||
        storageValue < -2_147_483_648 ||
        storageValue > 2_147_483_647
      ) {
        throw new Error("character storage value is invalid");
      }
      parsed[key] = storageValue;
    }
    return parsed;
  }
}
