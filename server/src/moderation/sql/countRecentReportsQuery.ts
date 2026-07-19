export const countRecentReportsQuery = `
  SELECT count(*)::int AS total FROM player_reports
  WHERE reporter_character_id = $1
    AND created_at > now() - interval '24 hours'`;
