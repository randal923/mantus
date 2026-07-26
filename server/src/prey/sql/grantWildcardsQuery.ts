export const grantWildcardsQuery = `UPDATE character_prey_resources
       SET wildcards = LEAST($3, wildcards + $2)
       WHERE character_id = $1
       RETURNING wildcards`;
