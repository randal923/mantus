import { Pool, type PoolClient } from "pg";
import { CharacterError } from "./CharacterError";
import type {
  Character,
  CharacterSaveSnapshot,
  CharacterSummary,
} from "./Character";
import type { CharacterStore } from "./CharacterStore";

interface CharacterRow {
  id: string;
  account_id: string;
  display_name: string;
  normalized_name: string;
  vocation: Character["vocation"];
  level: number;
  experience: string;
  health: number;
  max_health: number;
  mana: number;
  max_mana: number;
  capacity: number;
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

const CHARACTER_COLUMNS = `
  id, account_id, display_name, normalized_name, vocation, level,
  experience, health, max_health, mana, max_mana, capacity,
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
    return result.rows.map((row) => this.toSummary(row));
  }

  async create(
    character: Character,
    maxCharacters: number,
  ): Promise<Character> {
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
           experience, health, max_health, mana, max_mana, capacity,
           position_x, position_y, position_z, direction, outfit_look_type,
           outfit_head, outfit_body, outfit_legs, outfit_feet, outfit_addons,
           town_id, created_at, updated_at, last_login_at, version
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
           $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27
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
          character.health,
          character.maxHealth,
          character.mana,
          character.maxMana,
          character.capacity,
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
      await client.query("COMMIT");
      return this.toCharacter(row);
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

  async loadForLogin(
    accountId: string,
    characterId: string,
    loggedInAt: Date,
  ): Promise<Character | null> {
    const result = await this.pool.query<CharacterRow>(
      `UPDATE characters
       SET last_login_at = $3, updated_at = $3, version = version + 1
       WHERE id = $1 AND account_id = $2
       RETURNING ${CHARACTER_COLUMNS}`,
      [characterId, accountId, loggedInAt],
    );
    const row = result.rows[0];
    return row ? this.toCharacter(row) : null;
  }

  async saveSnapshot(snapshot: CharacterSaveSnapshot): Promise<number> {
    const result = await this.pool.query<{ version: number }>(
      `UPDATE characters
       SET level = $3, experience = $4, health = $5, max_health = $6,
           mana = $7, max_mana = $8, capacity = $9, position_x = $10,
           position_y = $11, position_z = $12, direction = $13,
           outfit_look_type = $14, outfit_head = $15, outfit_body = $16,
           outfit_legs = $17, outfit_feet = $18, outfit_addons = $19,
           updated_at = now(), version = version + 1
       WHERE id = $1 AND version = $2
       RETURNING version`,
      [
        snapshot.characterId,
        snapshot.expectedVersion,
        snapshot.level,
        snapshot.experience.toString(),
        snapshot.health,
        snapshot.maxHealth,
        snapshot.mana,
        snapshot.maxMana,
        snapshot.capacity,
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
      ],
    );
    const version = result.rows[0]?.version;
    if (!version) throw new CharacterError("version-conflict");
    return version;
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

  private isNormalizedNameConflict(cause: unknown): boolean {
    if (!cause || typeof cause !== "object") return false;
    return (
      "code" in cause &&
      cause.code === "23505" &&
      "constraint" in cause &&
      cause.constraint === "characters_normalized_name_key"
    );
  }

  private toSummary(row: CharacterRow): CharacterSummary {
    const character = this.toCharacter(row);
    return {
      id: character.id,
      displayName: character.displayName,
      vocation: character.vocation,
      level: character.level,
      outfit: character.outfit,
      lastLoginAt: character.lastLoginAt,
    };
  }

  private toCharacter(row: CharacterRow): Character {
    return {
      id: row.id,
      accountId: row.account_id,
      displayName: row.display_name,
      normalizedName: row.normalized_name,
      vocation: row.vocation,
      level: row.level,
      experience: BigInt(row.experience),
      health: row.health,
      maxHealth: row.max_health,
      mana: row.mana,
      maxMana: row.max_mana,
      capacity: row.capacity,
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
}
