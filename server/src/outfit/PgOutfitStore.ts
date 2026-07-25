import { OUTFIT_LIMITS } from "@tibia/protocol";
import type { Pool } from "pg";
import { runSerializableTransaction } from "../economy/runSerializableTransaction";
import type {
  OutfitSnapshot,
  OutfitStore,
} from "./OutfitStore";

const outfitRowsQuery = `
  SELECT look_type, addons FROM character_outfits
  WHERE character_id = $1
  ORDER BY look_type
  LIMIT $2`;

const mountRowsQuery = `
  SELECT mount_id FROM character_mounts
  WHERE character_id = $1
  ORDER BY mount_id
  LIMIT $2`;

/** Merges addon bits so re-granting an outfit never removes an addon. */
const grantOutfitQuery = `
  INSERT INTO character_outfits (character_id, look_type, addons)
  VALUES ($1, $2, $3)
  ON CONFLICT (character_id, look_type)
  DO UPDATE SET addons = character_outfits.addons | EXCLUDED.addons
  WHERE character_outfits.addons <> (character_outfits.addons | EXCLUDED.addons)`;

const grantMountQuery = `
  INSERT INTO character_mounts (character_id, mount_id)
  VALUES ($1, $2)
  ON CONFLICT DO NOTHING`;

const ownedOutfitQuery = `
  SELECT addons FROM character_outfits
  WHERE character_id = $1 AND look_type = $2`;

const ownedMountQuery = `
  SELECT 1 FROM character_mounts WHERE character_id = $1 AND mount_id = $2`;

const applySelectionQuery = `
  UPDATE characters SET
    outfit_look_type = $2,
    outfit_head = $3,
    outfit_body = $4,
    outfit_legs = $5,
    outfit_feet = $6,
    outfit_addons = $7,
    mount_id = $8,
    updated_at = now()
  WHERE id = $1`;

/**
 * Postgres outfit/mount entitlements. `select` re-reads ownership inside the
 * same transaction that writes the selection, so a look type or mount the
 * character stopped owning between intent and execution is refused, and a
 * forged id simply matches no row (charter rule 4).
 */
export class PgOutfitStore implements OutfitStore {
  constructor(private readonly pool: Pool) {}

  async loadSnapshot(characterId: string): Promise<OutfitSnapshot> {
    const outfits = await this.pool.query<{
      look_type: number;
      addons: number;
    }>(outfitRowsQuery, [characterId, OUTFIT_LIMITS.maxOutfits]);
    const mounts = await this.pool.query<{ mount_id: number }>(mountRowsQuery, [
      characterId,
      OUTFIT_LIMITS.maxMounts,
    ]);
    return {
      outfits: outfits.rows.map((row) => ({
        lookType: row.look_type,
        addons: row.addons,
      })),
      mounts: mounts.rows.map((row) => row.mount_id),
    };
  }

  async grantOutfit(input: {
    characterId: string;
    lookType: number;
    addons: number;
  }): Promise<{ granted: boolean }> {
    const granted = await this.pool.query(grantOutfitQuery, [
      input.characterId,
      input.lookType,
      input.addons,
    ]);
    return { granted: granted.rowCount === 1 };
  }

  async grantMount(input: {
    characterId: string;
    mountId: number;
  }): Promise<{ granted: boolean }> {
    const granted = await this.pool.query(grantMountQuery, [
      input.characterId,
      input.mountId,
    ]);
    return { granted: granted.rowCount === 1 };
  }

  async select(input: {
    characterId: string;
    lookType: number;
    head: number;
    body: number;
    legs: number;
    feet: number;
    addons: number;
    mountId: number;
  }): Promise<{ status: "ok" } | { status: "failed"; reason: "not-owned" }> {
    return runSerializableTransaction(this.pool, async (client) => {
      const owned = await client.query<{ addons: number }>(ownedOutfitQuery, [
        input.characterId,
        input.lookType,
      ]);
      const ownedAddons = owned.rows[0]?.addons;
      // Both the outfit and every requested addon bit must be owned.
      if (
        ownedAddons === undefined ||
        (input.addons & ~ownedAddons) !== 0
      ) {
        return { status: "failed" as const, reason: "not-owned" as const };
      }
      if (input.mountId !== 0) {
        const mount = await client.query(ownedMountQuery, [
          input.characterId,
          input.mountId,
        ]);
        if (!mount.rowCount) {
          return { status: "failed" as const, reason: "not-owned" as const };
        }
      }
      await client.query(applySelectionQuery, [
        input.characterId,
        input.lookType,
        input.head,
        input.body,
        input.legs,
        input.feet,
        input.addons,
        input.mountId,
      ]);
      return { status: "ok" as const };
    });
  }
}
