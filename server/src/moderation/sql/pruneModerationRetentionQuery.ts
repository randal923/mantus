/**
 * Retention prune (docs/moderation-retention.md). Drops moderation metadata
 * that is both older than the retention cutoff and no longer enforcing
 * anything: expired mute rows, lapsed account bans, resolved reports, and
 * historical action-trail rows. Live enforcement state is never touched —
 * an unexpired mute or a permanent ban (expires_at is null) stays regardless
 * of age, and the trail row for an action still in force is kept by the same
 * cutoff rule that keeps the action.
 *
 * Bounded per pass so a long-neglected database prunes over several scans
 * instead of one table-locking statement.
 */
export const pruneModerationRetentionQuery = `
  WITH pruned_mutes AS (
    DELETE FROM character_mutes
    WHERE character_id IN (
      SELECT character_id FROM character_mutes
      WHERE muted_until < $1
      LIMIT $2
    )
    RETURNING 1
  ),
  pruned_bans AS (
    DELETE FROM account_bans
    WHERE account_id IN (
      SELECT account_id FROM account_bans
      WHERE expires_at IS NOT NULL AND expires_at < $1
      LIMIT $2
    )
    RETURNING 1
  ),
  pruned_reports AS (
    DELETE FROM player_reports
    WHERE id IN (
      SELECT id FROM player_reports
      WHERE created_at < $1 AND status <> 'open'
      LIMIT $2
    )
    RETURNING 1
  ),
  pruned_actions AS (
    DELETE FROM moderation_actions
    WHERE id IN (
      SELECT id FROM moderation_actions
      WHERE created_at < $1
        AND (expires_at IS NULL OR expires_at < $1)
      LIMIT $2
    )
    RETURNING 1
  )
  SELECT
    (SELECT count(*) FROM pruned_mutes) AS mutes,
    (SELECT count(*) FROM pruned_bans) AS bans,
    (SELECT count(*) FROM pruned_reports) AS reports,
    (SELECT count(*) FROM pruned_actions) AS actions
`;
