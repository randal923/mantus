/** Locks the guild row and returns its balance for the rest of the txn. */
export const lockGuildBalanceQuery = `
  SELECT balance::text AS balance FROM guilds WHERE id = $1 FOR UPDATE`;

export const creditGuildBalanceQuery = `
  UPDATE guilds SET balance = balance + $2
  WHERE id = $1
  RETURNING balance::text AS balance`;

/**
 * Conditional debit: a guild balance can never go negative, so two racing
 * withdrawals both guarded by `balance >= amount` cannot both succeed.
 */
export const debitGuildBalanceQuery = `
  UPDATE guilds SET balance = balance - $2
  WHERE id = $1 AND balance >= $2
  RETURNING balance::text AS balance`;

export const insertGuildBankLedgerQuery = `
  INSERT INTO guild_bank_ledger (
    guild_id, character_id, entry_type, amount, balance_after
  ) VALUES ($1, $2, $3, $4, $5)`;

export const insertGuildBankAuditQuery = `
  INSERT INTO audit_log(event_type, character_id, details)
  VALUES (
    $1,
    $2,
    jsonb_build_object(
      'guildId', $3::uuid,
      'amount', $4::bigint,
      'balanceAfter', $5::bigint
    )
  )`;

/** Escrows both sides' stakes when a war activates; null means one fell short. */
export const escrowWarPaymentQuery = `
  WITH taken AS (
    UPDATE guilds SET balance = balance - $1
    WHERE id IN ($2, $3) AND balance >= $1
    RETURNING id
  )
  SELECT count(*)::int AS sides FROM taken`;

export const markWarEscrowQuery = `
  UPDATE guild_wars SET escrowed_payment = $2 WHERE id = $1`;

/**
 * Pays the pot to the winner exactly once: `payout_settled` flips in the same
 * statement, so a retried end-war finds nothing to update.
 */
export const settleWarPayoutQuery = `
  WITH settled AS (
    UPDATE guild_wars
    SET payout_settled = true
    WHERE id = $1 AND payout_settled = false AND escrowed_payment > 0
    RETURNING escrowed_payment
  )
  SELECT escrowed_payment::text AS pot FROM settled`;
