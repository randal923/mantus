// Development funding for a character's two currencies.
//
// There is no payment provider yet (Feature 43), so nothing turns money into
// Mantus Coins. This script is the operator-side stand-in: it credits the
// character's *account* with Mantus Coins and the character's *bank* with
// gold, writing both legs, their ledgers, and their audit rows in one
// transaction — the same shape the real grant path will use.
//
// Every run carries a `request_key`, so re-running the same grant key is a
// no-op instead of a second credit (charter rule 11, and the dupe rule that
// makes retries safe).

import { randomUUID } from "node:crypto";

const CHARACTER_NAME_PATTERN = /^[A-Za-z]+(?: [A-Za-z]+)*$/;
const MAX_MANTUS_COINS = 1_000_000_000_000;
const MAX_BANK_BALANCE = 1_000_000_000_000_000;

function parseAmount(label, raw, maximum) {
  const amount = Number(raw);
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > maximum) {
    throw new Error(`--${label} must be an integer from 1 to ${maximum}`);
  }
  return amount;
}

function readArguments() {
  const [characterName, ...options] = process.argv.slice(2);
  const usage =
    'usage: yarn coins:grant "Character Name" ' +
    "[--mantus <amount>] [--gold <amount>] [--key <id>] [--dry-run]";
  if (!characterName) throw new Error(usage);

  let mantusCoins = 0;
  let gold = 0;
  let grantKey = null;
  let dryRun = false;
  for (let index = 0; index < options.length; index += 1) {
    const option = options[index];
    if (option === "--dry-run") {
      dryRun = true;
      continue;
    }
    const value = options[index + 1];
    if (value === undefined) throw new Error(usage);
    index += 1;
    if (option === "--mantus") {
      mantusCoins = parseAmount("mantus", value, MAX_MANTUS_COINS);
      continue;
    }
    if (option === "--gold") {
      gold = parseAmount("gold", value, MAX_BANK_BALANCE);
      continue;
    }
    if (option === "--key") {
      if (!/^[A-Za-z0-9:_-]{1,64}$/.test(value)) {
        throw new Error("--key must be 1-64 characters of [A-Za-z0-9:_-]");
      }
      grantKey = value;
      continue;
    }
    throw new Error(usage);
  }

  const normalizedName = characterName.trim().replace(/\s+/g, " ");
  if (
    normalizedName.length < 3 ||
    normalizedName.length > 20 ||
    !CHARACTER_NAME_PATTERN.test(normalizedName)
  ) {
    throw new Error("character name is invalid");
  }
  if (mantusCoins === 0 && gold === 0) {
    throw new Error("nothing to grant: pass --mantus and/or --gold");
  }
  return {
    characterName: normalizedName,
    mantusCoins,
    gold,
    grantKey: grantKey ?? randomUUID(),
    dryRun,
  };
}

async function grantMantusCoins(client, input) {
  const requestKey = `store-grant:tools:${input.grantKey}`;
  const replayed = await client.query(
    "SELECT id FROM mantus_coin_ledger WHERE request_key = $1",
    [requestKey],
  );
  if (replayed.rows.length > 0) return { applied: false, balance: null };

  const locked = await client.query(
    "SELECT mantus_coins FROM accounts WHERE id = $1 FOR UPDATE",
    [input.accountId],
  );
  const account = locked.rows[0];
  if (!account) throw new Error("account not found for character");

  const balanceAfter = Number(account.mantus_coins) + input.amount;
  if (balanceAfter > MAX_MANTUS_COINS) {
    throw new Error("grant would exceed the maximum Mantus Coin balance");
  }
  await client.query("UPDATE accounts SET mantus_coins = $2 WHERE id = $1", [
    input.accountId,
    balanceAfter,
  ]);
  await client.query(
    `INSERT INTO mantus_coin_ledger (
       account_id, entry_type, amount, balance_after, offer_id,
       request_key, refunded_entry_id, operator_character_id
     ) VALUES ($1, 'grant', $2, $3, NULL, $4, NULL, $5)`,
    [input.accountId, input.amount, balanceAfter, requestKey, input.characterId],
  );
  await client.query(
    `INSERT INTO audit_log(event_type, character_id, details)
     VALUES ('store-grant', $1, $2::jsonb)`,
    [
      input.characterId,
      JSON.stringify({
        accountId: input.accountId,
        amount: input.amount,
        balanceAfter,
        grantKey: requestKey,
        source: "tools/grantCoins.mjs",
      }),
    ],
  );
  return { applied: true, balance: balanceAfter };
}

async function grantGold(client, input) {
  // The row may not exist yet: a character that has never banked has no
  // bank_accounts row, and the locking read needs one to lock.
  await client.query(
    `INSERT INTO bank_accounts(character_id) VALUES ($1)
     ON CONFLICT (character_id) DO NOTHING`,
    [input.characterId],
  );
  const locked = await client.query(
    "SELECT balance FROM bank_accounts WHERE character_id = $1 FOR UPDATE",
    [input.characterId],
  );
  const balanceAfter = Number(locked.rows[0].balance) + input.amount;
  if (balanceAfter > MAX_BANK_BALANCE) {
    throw new Error("grant would exceed the maximum bank balance");
  }
  // The audit row is written first and carries the replay guard: migration
  // 064's partial unique index on `details->>'grantKey'` makes "one gold
  // grant per key" a database invariant, so a losing retry inserts nothing
  // and leaves the balance untouched.
  const audited = await client.query(
    `INSERT INTO audit_log(event_type, character_id, details)
     VALUES ('bank-deposit', $1, $2::jsonb)
     ON CONFLICT DO NOTHING`,
    [
      input.characterId,
      JSON.stringify({
        amount: input.amount,
        balanceAfter,
        grantKey: input.grantKey,
        source: "tools/grantCoins.mjs",
      }),
    ],
  );
  if (audited.rowCount !== 1) return { applied: false, balance: null };

  await client.query(
    `UPDATE bank_accounts
     SET balance = $2, version = version + 1, updated_at = now()
     WHERE character_id = $1`,
    [input.characterId, balanceAfter],
  );
  await client.query(
    `INSERT INTO bank_ledger(character_id, entry_type, amount, balance_after)
     VALUES ($1, 'deposit', $2, $3)`,
    [input.characterId, input.amount, balanceAfter],
  );
  return { applied: true, balance: balanceAfter };
}

async function grantCoins({ characterName, mantusCoins, gold, grantKey }) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set in the environment or root .env");
  }
  const { Client } = await import("pg");
  const client = new Client({ connectionString: databaseUrl });
  let transactionStarted = false;
  await client.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    transactionStarted = true;
    const selected = await client.query(
      `SELECT id, display_name, account_id
       FROM characters
       WHERE normalized_name = lower($1)
       FOR UPDATE`,
      [characterName],
    );
    const character = selected.rows[0];
    if (!character) throw new Error(`character not found: ${characterName}`);

    const target = {
      characterId: character.id,
      accountId: character.account_id,
      grantKey,
    };
    const mantus =
      mantusCoins > 0
        ? await grantMantusCoins(client, { ...target, amount: mantusCoins })
        : null;
    const bank =
      gold > 0 ? await grantGold(client, { ...target, amount: gold }) : null;

    await client.query("COMMIT");
    transactionStarted = false;
    return { displayName: character.display_name, mantus, bank };
  } catch (error) {
    if (transactionStarted) await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

function describe(label, amount, result) {
  if (!result) return `${label}: unchanged.`;
  if (!result.applied) {
    return `${label}: already granted under this key; nothing added.`;
  }
  return `${label}: +${amount} → ${result.balance}.`;
}

async function main() {
  const parsed = readArguments();
  if (parsed.dryRun) {
    console.log(
      `Would grant "${parsed.characterName}" ${parsed.mantusCoins} Mantus ` +
        `Coins and ${parsed.gold} gold under key ${parsed.grantKey}.`,
    );
    return;
  }

  console.warn(
    "Grants land in the database directly; an online character will not see " +
      "the new balances until it relogs.",
  );
  const result = await grantCoins(parsed);
  console.log(`Granted to "${result.displayName}" (key ${parsed.grantKey}).`);
  console.log(describe("Mantus Coins", parsed.mantusCoins, result.mantus));
  console.log(describe("Bank gold", parsed.gold, result.bank));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
