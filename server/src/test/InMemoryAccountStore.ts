import type { Language, UiSettings } from "@tibia/protocol";
import type { Account, AccountStore } from "../AccountStore";

export class InMemoryAccountStore implements AccountStore {
  private readonly accounts = new Map<string, Account>();

  seed(account: Account): void {
    this.accounts.set(account.supabaseUserId, account);
  }

  languageFor(supabaseUserId: string): Language | undefined {
    return this.accounts.get(supabaseUserId)?.language;
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
      const account = { ...existing, email, language };
      this.accounts.set(supabaseUserId, account);
      return account;
    }
    const account = {
      id: `acc-${supabaseUserId}`,
      supabaseUserId,
      email,
      bannedUntil: null,
      language,
      uiSettings: {},
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
}
