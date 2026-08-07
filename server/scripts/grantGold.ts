import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { loadItemCatalog } from "../src/item/loadItemCatalog";

// Admin gold grant: mints coins into a character's equipped backpack in one
// transaction, with an `item-created` audit row per stack (reason
// "admin-grant") so the currency reconciler sees the supply change as
// explained mint. Usage:
//
//   yarn db:grant-gold <characterName> <goldAmount>
//
// The character must be offline: carried items live in memory while a session
// exists and the next save would clobber rows added behind its back. If
// PUBLIC_API_URL is set (e.g. https://mantus.fly.dev) the script checks the
// live online list; an unreachable API is treated as "server down, so nobody
// is online".

const COIN_TYPES = [
  { typeId: 3043, worth: 10_000 },
  { typeId: 3035, worth: 100 },
  { typeId: 3031, worth: 1 },
] as const;
const MAX_STACK = 100;
const MAX_GRANT = 1_000_000_000;

const [characterName, amountArg] = process.argv.slice(2);
const amount = Number(amountArg);
if (!characterName || !Number.isInteger(amount) || amount <= 0) {
  console.error("usage: yarn db:grant-gold <characterName> <goldAmount>");
  process.exit(1);
}
if (amount > MAX_GRANT) {
  console.error(`refusing to grant more than ${MAX_GRANT} gold at once`);
  process.exit(1);
}

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
    const isOnline = (online.players ?? []).some(
      (player) => player.name.toLowerCase() === characterName.toLowerCase(),
    );
    if (isOnline) {
      console.error(`${characterName} is online; log them out first`);
      process.exit(1);
    }
    console.log(`online check passed (${online.players?.length ?? 0} online)`);
  } catch {
    console.log("public API unreachable; server is down, treating as offline");
  }
} else {
  console.log("PUBLIC_API_URL not set; skipping online check");
}

const catalog = await loadItemCatalog();
const client = new Client({ connectionString: databaseUrl });
await client.connect();

try {
  await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");

  const character = await client.query<{ id: string; display_name: string }>(
    `SELECT id, display_name FROM characters
     WHERE normalized_name = lower(trim($1)) FOR UPDATE`,
    [characterName],
  );
  const characterRow = character.rows[0];
  if (!characterRow) throw new Error(`character "${characterName}" not found`);
  if (character.rowCount !== 1) {
    throw new Error(`"${characterName}" matches more than one character`);
  }

  const backpack = await client.query<{ id: string; item_type_id: number }>(
    `SELECT id, item_type_id FROM items
     WHERE character_id = $1 AND location_type = 'equipment'
       AND equipment_slot = 'backpack'
     FOR UPDATE`,
    [characterRow.id],
  );
  const backpackRow = backpack.rows[0];
  if (!backpackRow) throw new Error("character has no equipped backpack");
  const capacity =
    catalog.require(backpackRow.item_type_id).containerCapacity ?? 0;
  if (capacity <= 0) throw new Error("equipped backpack has no capacity");

  const contents = await client.query<{
    id: string;
    item_type_id: number;
    count: number;
    slot_index: number;
  }>(
    `SELECT id, item_type_id, count, slot_index FROM items
     WHERE container_id = $1 AND location_type = 'container'
     ORDER BY slot_index FOR UPDATE`,
    [backpackRow.id],
  );

  const usedSlots = new Set(contents.rows.map((row) => row.slot_index));
  const freeSlots: number[] = [];
  for (let slot = 0; slot < capacity; slot += 1) {
    if (!usedSlots.has(slot)) freeSlots.push(slot);
  }

  // Largest coins first, merging into existing stacks before taking slots.
  let remaining = amount;
  const grants: Array<{ itemId: string; typeId: number; count: number }> = [];
  for (const coin of COIN_TYPES) {
    let coins = Math.floor(remaining / coin.worth);
    remaining -= coins * coin.worth;

    for (const stack of contents.rows) {
      if (coins === 0) break;
      if (stack.item_type_id !== coin.typeId || stack.count >= MAX_STACK) {
        continue;
      }
      const add = Math.min(coins, MAX_STACK - stack.count);
      await client.query(
        "UPDATE items SET count = count + $2, version = version + 1 WHERE id = $1",
        [stack.id, add],
      );
      grants.push({ itemId: stack.id, typeId: coin.typeId, count: add });
      stack.count += add;
      coins -= add;
    }
    while (coins > 0) {
      const slot = freeSlots.shift();
      if (slot === undefined) throw new Error("backpack is full");
      const stackCount = Math.min(coins, MAX_STACK);
      const itemId = randomUUID();
      await client.query(
        `INSERT INTO items (id, item_type_id, count, location_type, container_id, slot_index)
         VALUES ($1, $2, $3, 'container', $4, $5)`,
        [itemId, coin.typeId, stackCount, backpackRow.id, slot],
      );
      grants.push({ itemId, typeId: coin.typeId, count: stackCount });
      coins -= stackCount;
    }
  }

  for (const grant of grants) {
    await client.query(
      `INSERT INTO audit_log (event_type, character_id, item_id, details)
       VALUES (
         'item-created', $1, $2, jsonb_build_object(
           'reason', 'admin-grant', 'itemTypeId', $3::integer, 'count', $4::integer
         )
       )`,
      [characterRow.id, grant.itemId, grant.typeId, grant.count],
    );
  }

  await client.query("COMMIT");
  for (const grant of grants) {
    console.log(
      `  ${grant.count}x ${catalog.require(grant.typeId).name} -> item ${grant.itemId}`,
    );
  }
  console.log(
    `granted ${amount} gold to ${characterRow.display_name} (${characterRow.id})`,
  );
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
