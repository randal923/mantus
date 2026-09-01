import type { PoolClient } from "pg";
import { CharacterError } from "./CharacterError";

const DELETE_REASON = "character-deleted";

/**
 * Deletes one character inside an open transaction: refuses while it still
 * leads a guild, owns a house, holds the top house-auction bid or has open
 * market offers; otherwise audits and destroys everything it owns (carried,
 * depot, inbox and stash items, bank gold) and removes the row. The caller
 * has already locked the account row.
 */
export async function deleteCharacterInTransaction(
  client: PoolClient,
  accountId: string,
  characterId: string,
): Promise<void> {
  const character = await client.query<{ id: string; display_name: string }>(
    `SELECT id, display_name FROM characters
     WHERE id = $1 AND account_id = $2 FOR UPDATE`,
    [characterId, accountId],
  );
  const row = character.rows[0];
  if (!row) throw new CharacterError("not-found");

  const blockers = await client.query<{
    guild: boolean;
    house: boolean;
    auction: boolean;
    offers: boolean;
  }>(
    `SELECT
       EXISTS (SELECT 1 FROM guilds WHERE owner_character_id = $1) AS guild,
       EXISTS (SELECT 1 FROM houses WHERE owner_character_id = $1) AS house,
       EXISTS (SELECT 1 FROM house_auctions WHERE bidder_character_id = $1) AS auction,
       EXISTS (SELECT 1 FROM market_offers WHERE character_id = $1) AS offers`,
    [characterId],
  );
  const blocker = blockers.rows[0];
  if (blocker?.guild) throw new CharacterError("guild-leader");
  if (blocker?.house) throw new CharacterError("house-owner");
  if (blocker?.auction) throw new CharacterError("house-auction");
  if (blocker?.offers) throw new CharacterError("market-offers");

  // items.container_id is a deferrable self-reference; deferring it lets the
  // whole nested closure go in one DELETE regardless of depth.
  await client.query("SET CONSTRAINTS ALL DEFERRED");
  await client.query(
    `WITH RECURSIVE closure AS (
       SELECT id, item_type_id, count, location_type FROM items
       WHERE character_id = $1::uuid
       UNION
       SELECT child.id, child.item_type_id, child.count, child.location_type
       FROM items child JOIN closure ON child.container_id = closure.id
     ),
     audited AS (
       INSERT INTO audit_log (event_type, character_id, item_id, details)
       SELECT 'item-destroyed', $1::uuid, id, jsonb_build_object(
         'itemTypeId', item_type_id, 'count', count,
         'locationType', location_type, 'reason', $2::text,
         'characterId', $1::uuid::text, 'characterName', $3::text
       )
       FROM closure
       RETURNING item_id
     )
     DELETE FROM items WHERE id IN (SELECT id FROM closure)`,
    [characterId, DELETE_REASON, row.display_name],
  );
  await client.query(
    `INSERT INTO audit_log (event_type, character_id, details)
     SELECT 'bank-withdraw', character_id, jsonb_build_object(
       'amount', balance, 'balanceAfter', 0, 'reason', $2::text,
       'characterId', $1::uuid::text, 'characterName', $3::text
     )
     FROM bank_accounts WHERE character_id = $1::uuid AND balance > 0`,
    [characterId, DELETE_REASON, row.display_name],
  );
  await client.query(
    `INSERT INTO audit_log (event_type, character_id, details)
     SELECT 'item-destroyed', character_id, jsonb_build_object(
       'itemTypeId', item_type_id, 'count', count,
       'locationType', 'stash', 'reason', $2::text,
       'characterId', $1::uuid::text, 'characterName', $3::text
     )
     FROM supply_stash WHERE character_id = $1::uuid`,
    [characterId, DELETE_REASON, row.display_name],
  );

  // Restrict-FK dependants; everything else cascades or nulls out.
  await client.query(
    "DELETE FROM inbox_deliveries WHERE recipient_character_id = $1",
    [characterId],
  );
  await client.query(
    "UPDATE inbox_deliveries SET return_character_id = NULL WHERE return_character_id = $1",
    [characterId],
  );
  await client.query("DELETE FROM supply_stash WHERE character_id = $1", [
    characterId,
  ]);
  await client.query("DELETE FROM bank_accounts WHERE character_id = $1", [
    characterId,
  ]);
  await client.query("DELETE FROM character_depots WHERE character_id = $1", [
    characterId,
  ]);
  await client.query(
    "DELETE FROM character_storage_state WHERE character_id = $1",
    [characterId],
  );
  const deleted = await client.query(
    "DELETE FROM characters WHERE id = $1 AND account_id = $2",
    [characterId, accountId],
  );
  if (deleted.rowCount !== 1) throw new CharacterError("not-found");
}
