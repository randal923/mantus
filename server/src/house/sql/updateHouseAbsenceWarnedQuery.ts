export const updateHouseAbsenceWarnedQuery = `
  UPDATE houses
  SET absence_warned_for = $2, updated_at = now()
  WHERE house_id = $1`;
