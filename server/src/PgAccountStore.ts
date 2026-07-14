import { Pool } from "pg";
import type { Account, AccountStore } from "./AccountStore";

interface AccountRow {
  id: string;
  supabase_user_id: string;
  email: string | null;
  banned_until: Date | null;
}

export class PgAccountStore implements AccountStore {
  constructor(private readonly pool: Pool) {}

  async findOrCreateBySupabaseId(
    supabaseUserId: string,
    email: string | null,
  ): Promise<Account> {
    const result = await this.pool.query<AccountRow>(
      `INSERT INTO accounts (supabase_user_id, email)
       VALUES ($1, $2)
       ON CONFLICT (supabase_user_id)
       DO UPDATE SET email = EXCLUDED.email
       RETURNING id, supabase_user_id, email, banned_until`,
      [supabaseUserId, email],
    );
    const row = result.rows[0];
    if (!row) throw new Error("account upsert returned no row");
    return {
      id: row.id,
      supabaseUserId: row.supabase_user_id,
      email: row.email,
      bannedUntil: row.banned_until,
    };
  }
}
