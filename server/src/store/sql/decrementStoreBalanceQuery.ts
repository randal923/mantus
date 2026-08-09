/**
 * Debits a memory-first purchase relatively, guarded so the balance can never
 * go negative: a queued persist whose memory approval has since drifted (an
 * operator refund raced it, a second session spent first) simply matches no
 * row, and the caller treats that as a hard failure instead of committing a
 * negative balance. `premium_until` is only touched when the purchase bought
 * premium time (charter rules 2 and 8).
 */
export const decrementStoreBalanceQuery = `UPDATE accounts
       SET mantus_coins = mantus_coins - $2,
           premium_until = COALESCE($3, premium_until)
       WHERE id = $1 AND mantus_coins >= $2
       RETURNING mantus_coins`;
