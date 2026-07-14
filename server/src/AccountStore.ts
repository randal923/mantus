export interface Account {
  id: string;
  supabaseUserId: string;
  email: string | null;
  bannedUntil: Date | null;
}

export interface AccountStore {
  findOrCreateBySupabaseId(
    supabaseUserId: string,
    email: string | null,
  ): Promise<Account>;
}
