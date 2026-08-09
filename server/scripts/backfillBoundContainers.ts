import { randomUUID } from "node:crypto";
import { Client } from "pg";

// Bound-container backfill: gives every existing character the bound
// container (item 23396 in the `bound` equipment slot) and a Loot Pouch
// (23721) inside it — the same set new characters get from the starter set.
// A character that already owns a pouch keeps it: the existing row is moved
// into the bound container instead, contents and all. Usage:
//
//   yarn db:backfill-bound
//
// Idempotent: one serializable transaction per character, and a re-run skips
// characters that already have both rows in place. The game server must be
// stopped (or empty): carried items live in memory while a session exists and
// the next save would clobber rows added behind its back. If PUBLIC_API_URL
// is set the script refuses to run while anyone is online; an unreachable API
// is treated as "server down, so nobody is online".

const BOUND_CONTAINER_TYPE_ID = 23_396;
const ITEM_POUCH_TYPE_ID = 23_721;

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is not set; add it to the root .env");
  process.exit(1);
}

const publicApiUrl = process.env.PUBLIC_API_URL;
if (publicApiUrl) {
  try {
    const response = await fetch(new URL("/api/public/online", publicApiUrl));
    const online = (await response.json()) as {
      players?: Array<{ name: string }>;
    };
    const count = online.players?.length ?? 0;
    if (count > 0) {
      console.error(`${count} player(s) online; stop the server first`);
      process.exit(1);
    }
    console.log("online check passed (0 online)");
  } catch {
    console.log("public API unreachable; server is down, treating as offline");
  }
} else {
  console.log("PUBLIC_API_URL not set; skipping online check");
}

const client = new Client({ connectionString: databaseUrl });
await client.connect();

const characters = await client.query<{ id: string; display_name: string }>(
  "SELECT id, display_name FROM characters ORDER BY created_at",
);
console.log(`backfilling ${characters.rowCount} character(s)`);

let created = 0;
let moved = 0;
let untouched = 0;

for (const character of characters.rows) {
  try {
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    await client.query("SELECT id FROM characters WHERE id = $1 FOR UPDATE", [
      character.id,
    ]);

    let bound = await client.query<{ id: string }>(
      `SELECT id FROM items
       WHERE character_id = $1 AND location_type = 'equipment'
         AND equipment_slot = 'bound'
       FOR UPDATE`,
      [character.id],
    );
    let boundId = bound.rows[0]?.id;
    if (!boundId) {
      boundId = randomUUID();
      await client.query(
        `INSERT INTO items (id, item_type_id, count, location_type, character_id, equipment_slot)
         VALUES ($1, $2, 1, 'equipment', $3, 'bound')`,
        [boundId, BOUND_CONTAINER_TYPE_ID, character.id],
      );
      await auditCreated(character.id, boundId, BOUND_CONTAINER_TYPE_ID);
    }

    // Every item row the character owns, from every root (equipment, depot,
    // inbox, stash, reward, escrow), plus the carried/depot container trees.
    const pouches = await client.query<{
      id: string;
      location_type: string;
      container_id: string | null;
    }>(
      `WITH RECURSIVE owned AS (
         SELECT id, item_type_id, location_type, container_id
         FROM items WHERE character_id = $1
         UNION ALL
         SELECT child.id, child.item_type_id, child.location_type, child.container_id
         FROM items child JOIN owned parent ON child.container_id = parent.id
       )
       SELECT id, location_type, container_id FROM owned
       WHERE item_type_id = $2
       ORDER BY id`,
      [character.id, ITEM_POUCH_TYPE_ID],
    );

    const pouch = pouches.rows[0];
    if (pouch) {
      await client.query("SELECT id FROM items WHERE id = $1 FOR UPDATE", [
        pouch.id,
      ]);
    }
    if (pouches.rowCount && pouches.rowCount > 1) {
      console.warn(
        `  ${character.display_name}: ${pouches.rowCount} pouches; moving ${pouch?.id}, leaving the rest`,
      );
    }

    if (pouch && pouch.container_id === boundId) {
      untouched += 1;
    } else if (pouch) {
      const slot = await firstFreeSlot(boundId);
      await client.query(
        `UPDATE items SET
           location_type = 'container', container_id = $2, slot_index = $3,
           character_id = NULL, equipment_slot = NULL, depot_id = NULL,
           version = version + 1
         WHERE id = $1`,
        [pouch.id, boundId, slot],
      );
      await client.query(
        `INSERT INTO audit_log (event_type, character_id, item_id, details)
         VALUES ('item-transferred', $1, $2, jsonb_build_object(
           'reason', 'bound-backfill', 'itemTypeId', $3::integer,
           'fromLocationType', $4::text, 'toContainerId', $5::text
         ))`,
        [
          character.id,
          pouch.id,
          ITEM_POUCH_TYPE_ID,
          pouch.location_type,
          boundId,
        ],
      );
      moved += 1;
    } else {
      const slot = await firstFreeSlot(boundId);
      const pouchId = randomUUID();
      await client.query(
        `INSERT INTO items (id, item_type_id, count, location_type, container_id, slot_index)
         VALUES ($1, $2, 1, 'container', $3, $4)`,
        [pouchId, ITEM_POUCH_TYPE_ID, boundId, slot],
      );
      await auditCreated(character.id, pouchId, ITEM_POUCH_TYPE_ID);
      created += 1;
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(`  ${character.display_name}: failed, rolled back`, error);
    throw error;
  }
}

console.log(
  `done: ${created} pouches created, ${moved} moved into the bound container, ${untouched} already in place`,
);
await client.end();

async function firstFreeSlot(containerId: string): Promise<number> {
  const children = await client.query<{ slot_index: number }>(
    `SELECT slot_index FROM items
     WHERE container_id = $1 AND location_type = 'container'
     ORDER BY slot_index FOR UPDATE`,
    [containerId],
  );
  const used = new Set(children.rows.map((row) => row.slot_index));
  let slot = 0;
  while (used.has(slot)) slot += 1;
  return slot;
}

async function auditCreated(
  characterId: string,
  itemId: string,
  itemTypeId: number,
): Promise<void> {
  await client.query(
    `INSERT INTO audit_log (event_type, character_id, item_id, details)
     VALUES ('item-created', $1, $2, jsonb_build_object(
       'reason', 'bound-backfill', 'itemTypeId', $3::integer, 'count', 1
     ))`,
    [characterId, itemId, itemTypeId],
  );
}
