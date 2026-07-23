import { Pool } from "pg";
import {
  DEFAULT_AUTO_POTION_SETTINGS,
  type ActionBar,
  type AutoPotionSettings,
  type PotionActionBar,
} from "@tibia/protocol";
import { CharacterError } from "./CharacterError";
import type {
  Character,
  CharacterSaveSnapshot,
  CharacterSummary,
} from "./Character";
import type { CharacterRow } from "./CharacterRow";
import type { LoadedCharacterRow } from "./LoadedCharacterRow";
import type { CharacterStore } from "./CharacterStore";
import type { StarterSet } from "../item/StarterSet";
import { assertValidCharacterSaveSnapshot } from "../progression/assertValidCharacterSaveSnapshot";
import { skullToCode } from "../pvp/skullToCode";
import { insertCharacterSkills } from "./insertCharacterSkills";
import { insertStarterSet } from "./insertStarterSet";
import { isNormalizedNameConflict } from "./isNormalizedNameConflict";
import { lockAccount } from "./lockAccount";
import { parseStorageValues } from "./parseStorageValues";
import { toCharacter } from "./toCharacter";
import { countCharactersQuery } from "./sql/countCharactersQuery";
import { findByIdForAccountQuery } from "./sql/findByIdForAccountQuery";
import { insertCharacterQuery } from "./sql/insertCharacterQuery";
import { insertProgressionEventQuery } from "./sql/insertProgressionEventQuery";
import { listByAccountQuery } from "./sql/listByAccountQuery";
import { recordLoginQuery } from "./sql/recordLoginQuery";
import { updateCharacterSkillQuery } from "./sql/updateCharacterSkillQuery";
import { updateCharacterSnapshotQuery } from "./sql/updateCharacterSnapshotQuery";

export class PgCharacterStore implements CharacterStore {
  constructor(private readonly pool: Pool) {}

  async listByAccountId(accountId: string): Promise<CharacterSummary[]> {
    const result = await this.pool.query<CharacterRow>(listByAccountQuery, [
      accountId,
    ]);
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
      storageValues: character.storageValues,
      positionX: character.positionX,
      positionY: character.positionY,
      positionZ: character.positionZ,
      direction: character.direction,
      outfit: character.outfit,
      skull: character.skull,
      skullExpiresAt: character.skullExpiresAt,
    });
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await lockAccount(client, character.accountId);
      const count = await client.query<{ count: string }>(
        countCharactersQuery,
        [character.accountId],
      );
      if (Number(count.rows[0]?.count ?? maxCharacters) >= maxCharacters) {
        throw new CharacterError("limit-reached");
      }
      const result = await client.query<CharacterRow>(insertCharacterQuery, [
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
      ]);
      const row = result.rows[0];
      if (!row) throw new Error("character insert returned no row");
      await insertCharacterSkills(client, character.id, character.skills);
      await insertStarterSet(client, character.id, starterSet);
      await client.query("COMMIT");
      return toCharacter(row, character.skills, [], {});
    } catch (cause) {
      await client.query("ROLLBACK");
      if (isNormalizedNameConflict(cause)) {
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
      findByIdForAccountQuery,
      [characterId, accountId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return toCharacter(
      row,
      row.skills.map((skill) => ({
        skill: skill.skill,
        level: skill.level,
        tries: Number(skill.tries),
      })),
      row.progression_event_ids,
      parseStorageValues(row.storage_values),
    );
  }

  async recordLogin(
    accountId: string,
    characterId: string,
    loggedInAt: Date,
  ): Promise<void> {
    const result = await this.pool.query(recordLoginQuery, [
      characterId,
      accountId,
      loggedInAt,
    ]);
    if (result.rowCount !== 1) throw new CharacterError("not-found");
  }

  async updateActionBar(
    characterId: string,
    actionBar: ActionBar,
  ): Promise<void> {
    const result = await this.pool.query(
      `UPDATE characters
       SET action_bar = $2::jsonb
       WHERE id = $1`,
      [characterId, JSON.stringify(actionBar)],
    );
    if (result.rowCount !== 1) {
      throw new Error("character action bar update failed");
    }
  }

  async updatePotionActionBar(
    characterId: string,
    potionActionBar: PotionActionBar,
  ): Promise<void> {
    const result = await this.pool.query(
      `UPDATE characters
       SET potion_action_bar = jsonb_build_object(
         'slots',
         $2::jsonb,
         'autoPotionSettings',
         CASE
           WHEN jsonb_typeof(potion_action_bar) = 'object'
             THEN COALESCE(
               potion_action_bar->'autoPotionSettings',
               $3::jsonb
             )
           ELSE $3::jsonb
         END
       )
       WHERE id = $1`,
      [
        characterId,
        JSON.stringify(potionActionBar),
        JSON.stringify(DEFAULT_AUTO_POTION_SETTINGS),
      ],
    );
    if (result.rowCount !== 1) {
      throw new Error("character potion action bar update failed");
    }
  }

  async updateAutoPotionSettings(
    characterId: string,
    settings: AutoPotionSettings,
  ): Promise<void> {
    const result = await this.pool.query(
      `UPDATE characters
       SET potion_action_bar = jsonb_build_object(
         'slots',
         CASE
           WHEN jsonb_typeof(potion_action_bar) = 'array'
             THEN potion_action_bar
           ELSE COALESCE(potion_action_bar->'slots', '[]'::jsonb)
         END,
         'autoPotionSettings',
         $2::jsonb
       )
       WHERE id = $1`,
      [characterId, JSON.stringify(settings)],
    );
    if (result.rowCount !== 1) {
      throw new Error("character auto potion settings update failed");
    }
  }

  async saveSnapshot(snapshot: CharacterSaveSnapshot): Promise<number> {
    assertValidCharacterSaveSnapshot(snapshot);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<{ version: number }>(
        updateCharacterSnapshotQuery,
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
          skullToCode(snapshot.skull),
          snapshot.skullExpiresAt,
        ],
      );
      const version = result.rows[0]?.version;
      if (!version) throw new CharacterError("version-conflict");
      for (const skill of snapshot.skills) {
        const updated = await client.query(updateCharacterSkillQuery, [
          snapshot.characterId,
          skill.skill,
          skill.level,
          skill.tries.toString(),
        ]);
        if (updated.rowCount !== 1) {
          throw new Error(`character skill ${skill.skill} was not found`);
        }
      }
      for (const event of snapshot.progressionEvents) {
        const inserted = await client.query(insertProgressionEventQuery, [
          snapshot.characterId,
          event.id,
          event.type,
        ]);
        if (inserted.rowCount !== 1) {
          throw new CharacterError("version-conflict");
        }
      }
      await client.query(
        "DELETE FROM character_storages WHERE character_id = $1",
        [snapshot.characterId],
      );
      for (const [key, value] of Object.entries(snapshot.storageValues)) {
        await client.query(
          `INSERT INTO character_storages (
             character_id, storage_key, storage_value
           ) VALUES ($1, $2, $3)`,
          [snapshot.characterId, key, value],
        );
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
}
