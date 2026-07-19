const CHARACTER_NAME_PATTERN = /^[A-Za-z]+(?: [A-Za-z]+)*$/;
const MAX_CONTAINER_DEPTH = 100;

const OWNED_ITEMS_CTE = `
  with recursive owned as (
    select id from items where character_id = $1
    union
    select i.id from items i join owned o on i.container_id = o.id
  )
`;

function readArguments() {
  const [characterName, ...options] = process.argv.slice(2);
  const dryRun = options.length === 1 && options[0] === "--dry-run";
  if (!characterName || (options.length > 0 && !dryRun)) {
    throw new Error(
      'usage: yarn character:delete "Character Name" [--dry-run]',
    );
  }
  const normalizedName = characterName.trim().replace(/\s+/g, " ");
  if (
    normalizedName.length < 3 ||
    normalizedName.length > 20 ||
    !CHARACTER_NAME_PATTERN.test(normalizedName)
  ) {
    throw new Error("character name is invalid");
  }
  return { characterName: normalizedName, dryRun };
}

async function deleteOwnedItems(client, characterId) {
  const deletedItems = [];
  for (let depth = 0; depth < MAX_CONTAINER_DEPTH; depth += 1) {
    const deleted = await client.query(
      `${OWNED_ITEMS_CTE}
       delete from items
       where id in (select id from owned)
         and not exists (
           select 1 from items child where child.container_id = items.id
         )
       returning id, item_type_id, count`,
      [characterId],
    );
    if (deleted.rowCount === 0) break;
    deletedItems.push(...deleted.rows);
  }
  const leftover = await client.query(
    `${OWNED_ITEMS_CTE} select count(*)::integer as remaining from owned`,
    [characterId],
  );
  if (leftover.rows[0].remaining > 0) {
    throw new Error(
      `${leftover.rows[0].remaining} owned items could not be deleted; ` +
        "they are still referenced by another table",
    );
  }
  return deletedItems;
}

async function deleteCharacter(characterName, dryRun) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set in the environment or root .env");
  }
  const { Client } = await import("pg");
  const client = new Client({ connectionString: databaseUrl });
  let transactionStarted = false;
  await client.connect();
  try {
    await client.query("BEGIN");
    transactionStarted = true;
    const selected = await client.query(
      `SELECT id, display_name
       FROM characters
       WHERE normalized_name = lower($1)
       FOR UPDATE`,
      [characterName],
    );
    const character = selected.rows[0];
    if (!character) throw new Error(`character not found: ${characterName}`);

    const ownedGuild = await client.query(
      "SELECT name FROM guilds WHERE owner_character_id = $1",
      [character.id],
    );
    if (ownedGuild.rows[0]) {
      throw new Error(
        `character owns guild "${ownedGuild.rows[0].name}"; ` +
          "transfer or disband the guild first",
      );
    }

    const escrow = await client.query(
      `DELETE FROM market_escrow_items
       WHERE item_id IN (SELECT id FROM items WHERE character_id = $1)
          OR offer_id IN (SELECT id FROM market_offers WHERE character_id = $1)`,
      [character.id],
    );
    const offers = await client.query(
      "DELETE FROM market_offers WHERE character_id = $1",
      [character.id],
    );
    const inbox = await client.query(
      "DELETE FROM inbox_deliveries WHERE recipient_character_id = $1",
      [character.id],
    );
    await client.query(
      `UPDATE inbox_deliveries SET return_character_id = NULL
       WHERE return_character_id = $1`,
      [character.id],
    );

    const deletedItems = await deleteOwnedItems(client, character.id);
    if (deletedItems.length > 0) {
      await client.query(
        `INSERT INTO audit_log(event_type, character_id, item_id, details)
         SELECT 'item-destroyed', $1::uuid, deleted.id,
                jsonb_build_object(
                  'reason', 'admin:delete-character',
                  'characterId', ($1::uuid)::text,
                  'characterName', $2::text,
                  'itemTypeId', deleted.item_type_id,
                  'count', deleted.count
                )
         FROM unnest($3::uuid[], $4::integer[], $5::integer[])
           AS deleted(id, item_type_id, count)`,
        [
          character.id,
          character.display_name,
          deletedItems.map((item) => item.id),
          deletedItems.map((item) => item.item_type_id),
          deletedItems.map((item) => item.count),
        ],
      );
    }

    const bank = await client.query(
      "DELETE FROM bank_accounts WHERE character_id = $1 RETURNING balance",
      [character.id],
    );
    await client.query(
      "DELETE FROM character_depots WHERE character_id = $1",
      [character.id],
    );
    await client.query(
      "DELETE FROM character_storage_state WHERE character_id = $1",
      [character.id],
    );
    const stash = await client.query(
      "DELETE FROM supply_stash WHERE character_id = $1",
      [character.id],
    );
    await client.query("DELETE FROM characters WHERE id = $1", [character.id]);

    await client.query(dryRun ? "ROLLBACK" : "COMMIT");
    transactionStarted = false;
    return {
      displayName: character.display_name,
      items: deletedItems.length,
      marketOffers: offers.rowCount,
      escrowItems: escrow.rowCount,
      inboxDeliveries: inbox.rowCount,
      bankBalance: bank.rows[0] ? BigInt(bank.rows[0].balance) : 0n,
      stashEntries: stash.rowCount,
    };
  } catch (error) {
    if (transactionStarted) await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

async function main() {
  const { characterName, dryRun } = readArguments();
  if (!dryRun) {
    console.warn(
      "The game server must be stopped, or the character must be fully offline.",
    );
  }
  const result = await deleteCharacter(characterName, dryRun);
  const verb = dryRun ? "Would delete" : "Deleted";
  console.log(
    `${verb} "${result.displayName}": ${result.items} items, ` +
      `${result.marketOffers} market offers (${result.escrowItems} escrow items), ` +
      `${result.inboxDeliveries} inbox deliveries, ` +
      `${result.stashEntries} stash entries, ` +
      `${result.bankBalance} gold in the bank.`,
  );
  if (dryRun) console.log("Dry run: transaction rolled back, nothing changed.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
