import type { SetLanguageMessage } from "@tibia/protocol";
import type { AccountStore } from "./AccountStore";
import type { Session } from "./Session";
import type { SessionRegistry } from "./SessionRegistry";
import { ResolvedOutcomes } from "./ResolvedOutcomes";

export class LanguageHandler {
  private readonly outcomes = new ResolvedOutcomes();

  constructor(
    private readonly registry: SessionRegistry,
    private readonly accounts: AccountStore,
  ) {}

  handle(session: Session, intent: SetLanguageMessage): void {
    const account = session.account;
    if (!account) {
      session.sendError("auth-required");
      return;
    }
    if (session.languageUpdatePending) {
      session.sendError("language-update-pending");
      return;
    }
    session.languageUpdatePending = true;
    void this.persist(session, account.id, intent.language);
  }

  applyResolvedOutcomes(): void {
    this.outcomes.applyAll();
  }

  private async persist(
    session: Session,
    accountId: string,
    language: SetLanguageMessage["language"],
  ): Promise<void> {
    try {
      await this.accounts.updateLanguage(accountId, language);
      this.outcomes.push(() => {
        session.languageUpdatePending = false;
        if (
          !this.registry.contains(session) ||
          session.account?.id !== accountId
        ) {
          return;
        }
        session.account = { ...session.account, language };
        session.send({ type: "language-updated", language });
      });
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : "unknown";
      console.warn(`language update failed for account ${accountId}: ${reason}`);
      this.outcomes.push(() => {
        session.languageUpdatePending = false;
        if (
          !this.registry.contains(session) ||
          session.account?.id !== accountId
        ) {
          return;
        }
        session.sendError("language-update-failed");
      });
    }
  }
}
