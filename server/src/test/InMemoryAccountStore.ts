import { DEFAULT_FIGHT_MODE } from "@tibia/protocol";
import type { FightMode, Language, UiSettings } from "@tibia/protocol";
import type { Account, AccountStore } from "../AccountStore";

export class InMemoryAccountStore implements AccountStore {
  private readonly accounts = new Map<string, Account>();

  seed(account: Account): void {
    this.accounts.set(account.supabaseUserId, account);
  }

  languageFor(supabaseUserId: string): Language | undefined {
    return this.accounts.get(supabaseUserId)?.language;
  }

  fightModeFor(supabaseUserId: string): FightMode | undefined {
    return this.accounts.get(supabaseUserId)?.fightMode;
  }

  setBannedUntil(accountId: string, bannedUntil: Date | null): void {
    const entry = [...this.accounts.entries()].find(
      ([, account]) => account.id === accountId,
    );
    if (!entry) return;
    const [supabaseUserId, account] = entry;
    this.accounts.set(supabaseUserId, { ...account, bannedUntil });
  }

  async findOrCreateBySupabaseId(
    supabaseUserId: string,
    email: string | null,
    language: Language,
  ): Promise<Account> {
    const existing = this.accounts.get(supabaseUserId);
    if (existing) {
      const account = { ...existing, email };
      this.accounts.set(supabaseUserId, account);
      return account;
    }
    const account = {
      id: `acc-${supabaseUserId}`,
      supabaseUserId,
      email,
      bannedUntil: null,
      premiumUntil: null,
      mantusCoins: 0,
      language,
      uiSettings: {},
      fightMode: { ...DEFAULT_FIGHT_MODE },
    };
    this.accounts.set(supabaseUserId, account);
    return account;
  }

  async updateLanguage(accountId: string, language: Language): Promise<void> {
    const entry = [...this.accounts.entries()].find(
      ([, account]) => account.id === accountId,
    );
    if (!entry) throw new Error("account not found");
    const [supabaseUserId, account] = entry;
    this.accounts.set(supabaseUserId, { ...account, language });
  }

  async updateUiSettings(
    accountId: string,
    settings: UiSettings,
  ): Promise<void> {
    const entry = [...this.accounts.entries()].find(
      ([, account]) => account.id === accountId,
    );
    if (!entry) throw new Error("account not found");
    const [supabaseUserId, account] = entry;
    this.accounts.set(supabaseUserId, { ...account, uiSettings: settings });
  }

  async updateFightMode(
    accountId: string,
    fightMode: FightMode,
  ): Promise<void> {
    const entry = [...this.accounts.entries()].find(
      ([, account]) => account.id === accountId,
    );
    if (!entry) throw new Error("account not found");
    const [supabaseUserId, account] = entry;
    this.accounts.set(supabaseUserId, { ...account, fightMode });
  }
}
