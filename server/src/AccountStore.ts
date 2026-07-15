import type { Language } from "@tibia/protocol";

export interface Account {
  id: string;
  supabaseUserId: string;
  email: string | null;
  bannedUntil: Date | null;
  language: Language;
}

export interface AccountStore {
  findOrCreateBySupabaseId(
    supabaseUserId: string,
    email: string | null,
    language: Language,
  ): Promise<Account>;
  updateLanguage(accountId: string, language: Language): Promise<void>;
}
