/** Replay guard: a row here means this store operation already committed. */
export const storeRequestKeyQuery =
  "SELECT id FROM mantus_coin_ledger WHERE request_key = $1";
