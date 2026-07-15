import { Pool } from "pg";
import type { Language } from "@tibia/protocol";
import type { Account, AccountStore } from "./AccountStore";

interface AccountRow {
  id: string;
  supabase_user_id: string;
  email: string | null;
  banned_until: Date | null;
  language: Language;
}

export class PgAccountStore implements AccountStore {
  constructor(private readonly pool: Pool) {}

  async findOrCreateBySupabaseId(
    supabaseUserId: string,
    email: string | null,
    language: Language,
  ): Promise<Account> {
    const result = await this.pool.query<AccountRow>(
      `INSERT INTO accounts (supabase_user_id, email, language)
       VALUES ($1, $2, $3)
       ON CONFLICT (supabase_user_id)
       DO UPDATE SET email = EXCLUDED.email, language = EXCLUDED.language
       RETURNING id, supabase_user_id, email, banned_until, language`,
      [supabaseUserId, email, language],
    );
    const row = result.rows[0];
    if (!row) throw new Error("account upsert returned no row");
    return {
      id: row.id,
      supabaseUserId: row.supabase_user_id,
      email: row.email,
      bannedUntil: row.banned_until,
      language: row.language,
    };
  }

  async updateLanguage(accountId: string, language: Language): Promise<void> {
    const result = await this.pool.query(
      `UPDATE accounts
       SET language = $2
       WHERE id = $1`,
      [accountId, language],
    );
    if (result.rowCount !== 1) throw new Error("account language update failed");
  }
}
