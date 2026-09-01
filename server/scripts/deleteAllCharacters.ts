import { Client } from "pg";

// Admin wipe: deletes every character while keeping every account (and its
// coin balance, premium, bans, payment records). Dry-run by default; pass
// `--commit` to apply. Usage:
//
//   yarn db:delete-all-characters            # report what would go, roll back
//   yarn db:delete-all-characters --commit   # delete for real
//
// Everything runs in one transaction. Economy state is written to the audit
// log in that same transaction before it disappears: `item-destroyed` per
// item row (reason "character-wipe"), `bank-withdraw` per non-empty bank
// account and `market-offer-cancelled` per open offer. Nobody may be online:
// the server keeps online characters in memory and would re-persist them. If
// PUBLIC_API_URL is set the live online list is checked; an unreachable API is
// treated as "server down".

const commit = process.argv.includes("--commit");
const WIPE_REASON = "character-wipe";

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
      console.error(`${count} character(s) online; stop the server first`);
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

async function countRows(sql: string): Promise<number> {
  const result = await client.query<{ n: string }>(sql);
  return Number(result.rows[0]?.n ?? 0);
}

try {
  await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
  // items.container_id is a deferrable self-reference: deferring it lets the
  // whole item closure go in one statement regardless of nesting depth.
  await client.query("SET CONSTRAINTS ALL DEFERRED");

  const characters = await client.query<{
    id: string;
    display_name: string;
    account_id: string;
  }>("SELECT id, display_name, account_id FROM characters ORDER BY display_name FOR UPDATE");
  const accounts = await countRows("SELECT count(*)::text AS n FROM accounts");
  console.log(
    `${characters.rowCount ?? 0} character(s) across ${accounts} account(s)`,
  );
  for (const row of characters.rows) {
    console.log(`  - ${row.display_name} (${row.id}, account ${row.account_id})`);
  }

  // Every item that hangs off a character: carried, depot, inbox, trade and
  // market escrow rows, plus items placed inside houses (which only exist for
  // owned houses, and every owner is going), and everything nested in them.
  await client.query(
    `CREATE TEMP TABLE doomed_items ON COMMIT DROP AS
     WITH RECURSIVE closure AS (
       SELECT id, item_type_id, count, character_id, location_type
       FROM items
       WHERE character_id IS NOT NULL OR location_type = 'house'
       UNION
       SELECT child.id, child.item_type_id, child.count,
              closure.character_id, child.location_type
       FROM items child
       JOIN closure ON child.container_id = closure.id
     )
     SELECT * FROM closure`,
  );
  const itemsByLocation = await client.query<{
    location_type: string;
    n: string;
  }>(
    `SELECT location_type, count(*)::text AS n FROM doomed_items
     GROUP BY location_type ORDER BY location_type`,
  );
  const itemTotal = itemsByLocation.rows.reduce(
    (total, row) => total + Number(row.n),
    0,
  );
  console.log(`${itemTotal} item row(s) to destroy:`);
  for (const row of itemsByLocation.rows) {
    console.log(`  ${row.location_type}: ${row.n}`);
  }

  const banks = await client.query<{
    character_id: string;
    display_name: string;
    balance: string;
  }>(
    `SELECT b.character_id, c.display_name, b.balance::text
     FROM bank_accounts b JOIN characters c ON c.id = b.character_id
     WHERE b.balance > 0 ORDER BY c.display_name`,
  );
  console.log(`${banks.rowCount ?? 0} non-empty bank account(s):`);
  for (const row of banks.rows) {
    console.log(`  ${row.display_name}: ${row.balance} gold`);
  }

  const offers = await countRows("SELECT count(*)::text AS n FROM market_offers");
  const escrowGold = await client.query<{ total: string }>(
    "SELECT coalesce(sum(escrow_balance), 0)::text AS total FROM market_offers",
  );
  const stash = await countRows("SELECT count(*)::text AS n FROM supply_stash");
  const deliveries = await countRows(
    "SELECT count(*)::text AS n FROM inbox_deliveries",
  );
  const auctions = await countRows("SELECT count(*)::text AS n FROM house_auctions");
  const houses = await countRows("SELECT count(*)::text AS n FROM houses");
  const guilds = await countRows("SELECT count(*)::text AS n FROM guilds");
  console.log(
    `${offers} market offer(s) holding ${escrowGold.rows[0]?.total ?? "0"} gold in escrow, ` +
      `${stash} stash stack(s), ${deliveries} inbox deliver(ies), ` +
      `${auctions} house auction(s), ${houses} owned house(s), ${guilds} guild(s)`,
  );

  // Audit first, while the rows still exist.
  const itemAudits = await client.query(
    `INSERT INTO audit_log (event_type, character_id, item_id, details)
     SELECT 'item-destroyed', character_id, id, jsonb_build_object(
       'itemTypeId', item_type_id, 'count', count,
       'locationType', location_type, 'reason', $1::text
     )
     FROM doomed_items`,
    [WIPE_REASON],
  );
  const bankAudits = await client.query(
    `INSERT INTO audit_log (event_type, character_id, details)
     SELECT 'bank-withdraw', character_id, jsonb_build_object(
       'amount', balance, 'balanceAfter', 0, 'reason', $1::text
     )
     FROM bank_accounts WHERE balance > 0`,
    [WIPE_REASON],
  );
  const offerAudits = await client.query(
    `INSERT INTO audit_log (event_type, character_id, details)
     SELECT 'market-offer-cancelled', character_id, jsonb_build_object(
       'offerId', id, 'side', side, 'itemTypeId', item_type_id,
       'remainingAmount', remaining_amount, 'unitPrice', unit_price,
       'escrowBalance', escrow_balance, 'reason', $1::text
     )
     FROM market_offers`,
    [WIPE_REASON],
  );
  const stashAudits = await client.query(
    `INSERT INTO audit_log (event_type, character_id, details)
     SELECT 'item-destroyed', character_id, jsonb_build_object(
       'itemTypeId', item_type_id, 'count', count,
       'locationType', 'stash', 'reason', $1::text
     )
     FROM supply_stash`,
    [WIPE_REASON],
  );
  console.log(
    `audit rows: ${itemAudits.rowCount ?? 0} item, ${bankAudits.rowCount ?? 0} bank, ` +
      `${offerAudits.rowCount ?? 0} market, ${stashAudits.rowCount ?? 0} stash`,
  );

  // Restrict-FK dependants, then the items, then the characters (everything
  // else cascades or nulls out).
  await client.query(
    "DELETE FROM market_escrow_items WHERE item_id IN (SELECT id FROM doomed_items)",
  );
  await client.query("DELETE FROM market_offers");
  await client.query("DELETE FROM inbox_deliveries");
  await client.query("DELETE FROM house_auctions");
  await client.query("DELETE FROM supply_stash");
  await client.query("DELETE FROM character_depots");
  await client.query("DELETE FROM character_storage_state");
  await client.query("DELETE FROM bank_accounts");
  const deletedItems = await client.query(
    "DELETE FROM items WHERE id IN (SELECT id FROM doomed_items)",
  );
  const deletedCharacters = await client.query("DELETE FROM characters");
  if ((deletedItems.rowCount ?? 0) !== itemTotal) {
    throw new Error(
      `expected to delete ${itemTotal} items, deleted ${deletedItems.rowCount ?? 0}`,
    );
  }
  if ((deletedCharacters.rowCount ?? 0) !== (characters.rowCount ?? 0)) {
    throw new Error(
      `expected to delete ${characters.rowCount ?? 0} characters, deleted ${deletedCharacters.rowCount ?? 0}`,
    );
  }
  const remainingAccounts = await countRows(
    "SELECT count(*)::text AS n FROM accounts",
  );
  if (remainingAccounts !== accounts) {
    throw new Error("account count changed; refusing to continue");
  }

  if (!commit) {
    await client.query("ROLLBACK");
    console.log(
      `dry run: would delete ${deletedCharacters.rowCount ?? 0} character(s) and ${deletedItems.rowCount ?? 0} item(s); rolled back (pass --commit to apply)`,
    );
  } else {
    await client.query("COMMIT");
    console.log(
      `deleted ${deletedCharacters.rowCount ?? 0} character(s) and ${deletedItems.rowCount ?? 0} item(s); ${remainingAccounts} account(s) kept`,
    );
  }
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  await client.end();
}
