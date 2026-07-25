/**
 * Profile reads and grants. Every statement is parameterized and bounded, and
 * the grants rely on the primary key for exactly-once semantics rather than a
 * read-then-write (charter rules 3 and 7).
 */

export const achievementRowsQuery = `
  SELECT achievement_id FROM character_achievements
  WHERE character_id = $1
  ORDER BY achievement_id
  LIMIT $2`;

export const titleRowsQuery = `
  SELECT title_id FROM character_titles
  WHERE character_id = $1
  ORDER BY title_id
  LIMIT $2`;

export const badgeRowsQuery = `
  SELECT badge_id FROM character_badges
  WHERE character_id = $1
  ORDER BY badge_id
  LIMIT $2`;

export const selectedTitleQuery = `
  SELECT selected_title FROM characters WHERE id = $1`;

export const insertAchievementQuery = `
  INSERT INTO character_achievements (character_id, achievement_id)
  VALUES ($1, $2)
  ON CONFLICT DO NOTHING`;

export const insertTitleQuery = `
  INSERT INTO character_titles (character_id, title_id)
  VALUES ($1, $2)
  ON CONFLICT DO NOTHING`;

export const insertBadgeQuery = `
  INSERT INTO character_badges (character_id, badge_id)
  VALUES ($1, $2)
  ON CONFLICT DO NOTHING`;

/** Only sets a title the character actually holds; otherwise updates nothing. */
export const selectTitleUpdate = `
  UPDATE characters SET selected_title = $2
  WHERE id = $1
    AND ($2::text IS NULL OR EXISTS (
      SELECT 1 FROM character_titles t
      WHERE t.character_id = $1 AND t.title_id = $2
    ))`;

export const publicProfileQuery = `
  SELECT id, display_name, level, vocation, selected_title
  FROM characters
  WHERE normalized_name = lower(btrim($1))`;

export const countRecentBugReportsQuery = `
  SELECT count(*)::int AS total FROM bug_reports
  WHERE reporter_character_id = $1
    AND created_at > now() - interval '1 day'`;

export const insertBugReportQuery = `
  INSERT INTO bug_reports (
    reporter_character_id, category, message,
    position_x, position_y, position_z
  ) VALUES ($1, $2, $3, $4, $5, $6)`;

export const setNamelockUpdate = `
  UPDATE characters SET namelocked = $2 WHERE id = $1`;
