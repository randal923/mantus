import { characterColumns } from "./characterColumns";

export const listByAccountQuery = `SELECT ${characterColumns}
       FROM characters
       WHERE account_id = $1
       ORDER BY last_login_at DESC NULLS LAST, created_at ASC`;
