/**
 * Houses whose offline owner is past the absence warning threshold and still
 * has something due: either the warning letter for this absence episode
 * (absence_warned_for differs from the current last_seen_at) or the
 * tier-dependent eviction itself. Guildhalls never expire from absence.
 * Params: now, warnAfterDays, evictAfterDays, premiumEvictAfterDays, limit.
 */
export const absenceDueHouseIdsQuery = `
  SELECT h.house_id
  FROM houses h
  JOIN characters c ON c.id = h.owner_character_id
  JOIN accounts a ON a.id = c.account_id
  WHERE h.guild_id IS NULL
    AND c.last_seen_at <= $1::timestamptz - make_interval(days => $2::int)
    AND (
      h.absence_warned_for IS DISTINCT FROM c.last_seen_at
      OR c.last_seen_at <= $1::timestamptz - make_interval(days =>
        CASE
          WHEN a.premium_until IS NOT NULL AND a.premium_until > $1::timestamptz
          THEN $4::int
          ELSE $3::int
        END)
    )
  ORDER BY c.last_seen_at ASC
  LIMIT $5`;
