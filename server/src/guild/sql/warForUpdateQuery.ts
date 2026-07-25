/** Locks one war row; every status transition re-reads it first. */
export const warForUpdateQuery = `
  SELECT id, guild1_id, guild2_id, status, frag_limit,
         payment::text AS payment, escrowed_payment::text AS escrowed_payment,
         payout_settled
  FROM guild_wars
  WHERE id = $1
  FOR UPDATE`;
