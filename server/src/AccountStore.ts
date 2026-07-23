import type { FightMode, Language, UiSettings } from "@tibia/protocol";

export interface Account {
  id: string;
  supabaseUserId: string;
  email: string | null;
  bannedUntil: Date | null;
  premiumUntil: Date | null;
  mantusCoins: number;
  language: Language;
  uiSettings: UiSettings;
  fightMode: FightMode;
}

export interface AccountStore {
  findOrCreateBySupabaseId(
    supabaseUserId: string,
    email: string | null,
    language: Language,
  ): Promise<Account>;
  updateLanguage(accountId: string, language: Language): Promise<void>;
  updateUiSettings(accountId: string, settings: UiSettings): Promise<void>;
  updateFightMode(accountId: string, fightMode: FightMode): Promise<void>;
}
