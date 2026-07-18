export const recordLoginQuery = `UPDATE characters
       SET last_login_at = $3
       WHERE id = $1 AND account_id = $2`;
