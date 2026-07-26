export const debitWildcardsQuery = `UPDATE character_prey_resources
       SET wildcards = wildcards - $2
       WHERE character_id = $1 AND wildcards >= $2
       RETURNING wildcards`;
