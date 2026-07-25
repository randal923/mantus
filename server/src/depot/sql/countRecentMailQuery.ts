/**
 * Mail this character sent in the last day. Counted inside the send
 * transaction, so no amount of client pacing can exceed the cap.
 */
export const countRecentMailQuery = `
  SELECT count(*)::int AS total FROM inbox_deliveries
  WHERE delivery_kind = 'mail'
    AND return_character_id = $1
    AND delivered_at > now() - interval '1 day'`;
