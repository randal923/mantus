import { MINIMAP_LIMITS, type MinimapMarker } from "@tibia/protocol";
import type { Pool } from "pg";
import { runSerializableTransaction } from "../economy/runSerializableTransaction";

const markerRowsQuery = `
  SELECT position_x, position_y, position_z, icon, text
  FROM character_map_markers
  WHERE character_id = $1
  ORDER BY position_z, position_x, position_y
  LIMIT $2`;

const countMarkersQuery = `
  SELECT count(*)::int AS total FROM character_map_markers
  WHERE character_id = $1`;

const upsertMarkerQuery = `
  INSERT INTO character_map_markers (
    character_id, position_x, position_y, position_z, icon, text
  ) VALUES ($1, $2, $3, $4, $5, $6)
  ON CONFLICT (character_id, position_x, position_y, position_z)
  DO UPDATE SET icon = EXCLUDED.icon, text = EXCLUDED.text`;

const deleteMarkerQuery = `
  DELETE FROM character_map_markers
  WHERE character_id = $1
    AND position_x = $2 AND position_y = $3 AND position_z = $4`;

const existsMarkerQuery = `
  SELECT 1 FROM character_map_markers
  WHERE character_id = $1
    AND position_x = $2 AND position_y = $3 AND position_z = $4`;

/**
 * Postgres marker store. The cap is counted inside the same transaction that
 * writes, so concurrent placements cannot push a character past it; replacing
 * an existing tile never counts against the cap.
 */
export class PgMarkerStore {
  constructor(private readonly pool: Pool) {}

  async loadMarkers(
    characterId: string,
  ): Promise<ReadonlyArray<MinimapMarker>> {
    const result = await this.pool.query<{
      position_x: number;
      position_y: number;
      position_z: number;
      icon: number;
      text: string;
    }>(markerRowsQuery, [characterId, MINIMAP_LIMITS.maxMarkers]);
    return result.rows.map((row) => ({
      position: { x: row.position_x, y: row.position_y, z: row.position_z },
      icon: row.icon,
      text: row.text,
    }));
  }

  async setMarker(input: {
    characterId: string;
    marker: MinimapMarker;
    maxMarkers: number;
  }): Promise<{ status: "ok" } | { status: "failed"; reason: "list-full" }> {
    const { position } = input.marker;
    return runSerializableTransaction(this.pool, async (client) => {
      const existing = await client.query(existsMarkerQuery, [
        input.characterId,
        position.x,
        position.y,
        position.z,
      ]);
      if (!existing.rowCount) {
        const count = await client.query<{ total: number }>(countMarkersQuery, [
          input.characterId,
        ]);
        if ((count.rows[0]?.total ?? 0) >= input.maxMarkers) {
          return { status: "failed" as const, reason: "list-full" as const };
        }
      }
      await client.query(upsertMarkerQuery, [
        input.characterId,
        position.x,
        position.y,
        position.z,
        input.marker.icon,
        input.marker.text,
      ]);
      return { status: "ok" as const };
    });
  }

  async deleteMarker(input: {
    characterId: string;
    position: { x: number; y: number; z: number };
  }): Promise<void> {
    await this.pool.query(deleteMarkerQuery, [
      input.characterId,
      input.position.x,
      input.position.y,
      input.position.z,
    ]);
  }
}
