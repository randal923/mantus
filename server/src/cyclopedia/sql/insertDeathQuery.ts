export const insertDeathQuery = `INSERT INTO character_deaths (character_id, level, cause)
       VALUES ($1, $2, $3)`;
