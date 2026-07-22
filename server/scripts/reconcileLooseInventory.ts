import { Client } from "pg";
import { loadItemCatalog } from "../src/item/loadItemCatalog";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is not set; add it to the root .env");
  process.exit(1);
}

const catalog = await loadItemCatalog();
const client = new Client({ connectionString: databaseUrl });
await client.connect();

try {
  await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
  const loose = await client.query<{
    id: string;
    item_type_id: number;
    count: number;
    character_id: string;
    slot_index: number;
    version: number;
  }>(`SELECT id, item_type_id, count, character_id, slot_index, version
      FROM items
      WHERE location_type = 'inventory'
      ORDER BY character_id, slot_index, id
      FOR UPDATE`);

  if (loose.rows.length === 0) {
    await client.query("COMMIT");
    console.log("no loose inventory items need reconciliation");
  } else {
    const characterIds = [
      ...new Set(loose.rows.map((row) => row.character_id)),
    ].sort();
    const lockedCharacters = await client.query<{ id: string }>(
      `SELECT id FROM characters
       WHERE id = ANY($1::uuid[])
       ORDER BY id
       FOR UPDATE`,
      [characterIds],
    );
    if (lockedCharacters.rows.length !== characterIds.length) {
      throw new Error("a loose item references a missing character");
    }

    for (const characterId of characterIds) {
      const backpackResult = await client.query<{
        id: string;
        item_type_id: number;
      }>(`SELECT id, item_type_id
          FROM items
          WHERE character_id = $1
            AND location_type = 'equipment'
            AND equipment_slot = 'backpack'
          FOR UPDATE`, [characterId]);
      const backpack = backpackResult.rows[0];
      if (!backpack) {
        throw new Error(
          `character ${characterId} has loose items but no equipped backpack`,
        );
      }
      const capacity = catalog.require(backpack.item_type_id).containerCapacity;
      if (capacity === undefined) {
        throw new Error(`character ${characterId} has an invalid backpack`);
      }
      const occupiedResult = await client.query<{ slot_index: number }>(
        `SELECT slot_index FROM items
         WHERE container_id = $1 AND location_type = 'container'
         ORDER BY slot_index
         FOR UPDATE`,
        [backpack.id],
      );
      const occupied = new Set(
        occupiedResult.rows.map((row) => row.slot_index),
      );
      const freeSlots = Array.from(
        { length: capacity },
        (_, slot) => slot,
      ).filter((slot) => !occupied.has(slot));
      const characterItems = loose.rows.filter(
        (row) => row.character_id === characterId,
      );
      if (freeSlots.length < characterItems.length) {
        throw new Error(
          `character ${characterId} needs ${characterItems.length} backpack slots but only ${freeSlots.length} are free`,
        );
      }
      for (const [index, row] of characterItems.entries()) {
        const slot = freeSlots[index];
        if (slot === undefined) throw new Error("reconciliation slot is missing");
        const moved = await client.query<{ version: number }>(
          `UPDATE items
           SET location_type = 'container', character_id = NULL,
               container_id = $2, slot_index = $3, equipment_slot = NULL,
               depot_id = NULL, world_map_name = NULL, world_x = NULL,
               world_y = NULL, world_z = NULL, world_stack_index = NULL,
               version = version + 1, updated_at = now()
           WHERE id = $1 AND character_id = $4
             AND location_type = 'inventory' AND version = $5
           RETURNING version`,
          [row.id, backpack.id, slot, characterId, row.version],
        );
        if (moved.rows[0]?.version !== row.version + 1) {
          throw new Error(`loose item ${row.id} changed during reconciliation`);
        }
        await client.query(
          `INSERT INTO audit_log(event_type, character_id, item_id, details)
           VALUES ('item-transferred', $1, $2, $3::jsonb)`,
          [
            characterId,
            row.id,
            JSON.stringify({
              from: {
                kind: "inventory",
                characterId,
                slot: row.slot_index,
              },
              to: { kind: "container", containerId: backpack.id, slot },
              count: row.count,
              reason: "loose-inventory-reconciliation",
            }),
          ],
        );
      }
    }
    await client.query("COMMIT");
    console.log(`reconciled ${loose.rows.length} loose inventory item roots`);
  }
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
