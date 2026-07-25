import type { FightMode, Language, UiSettings } from "@tibia/protocol";
import type { AccountRole } from "./auth/AccountRole";

export interface Account {
  id: string;
  supabaseUserId: string;
  email: string | null;
  bannedUntil: Date | null;
  /**
   * Authorizes every admin action (Feature 96). Read from the account the
   * session authenticated as, never from a client message.
   */
  role: AccountRole;
  /**
   * Derived from `role` in the database (`role <> 'player'`). Staff accounts
   * are hidden from highscores.
   */
  isStaff: boolean;
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
