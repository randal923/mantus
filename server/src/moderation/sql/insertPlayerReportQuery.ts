export const insertPlayerReportQuery = `
  INSERT INTO player_reports (
    reporter_character_id, target_character_id, target_name, reason, comment
  ) VALUES ($1, $2, $3, $4, $5)`;
