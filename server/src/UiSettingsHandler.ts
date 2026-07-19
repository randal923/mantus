import type { UiSettings, UpdateUiSettingsMessage } from "@tibia/protocol";
import type { AccountStore } from "./AccountStore";
import type { Session } from "./Session";
import type { SessionRegistry } from "./SessionRegistry";

export class UiSettingsHandler {
  private readonly outcomes: Array<() => void> = [];

  constructor(
    private readonly registry: SessionRegistry,
    private readonly accounts: AccountStore,
  ) {}

  handle(session: Session, intent: UpdateUiSettingsMessage): void {
    const account = session.account;
    if (!account) {
      session.sendError("auth-required");
      return;
    }
    if (session.uiSettingsUpdatePending) {
      session.sendError("ui-settings-update-pending");
      return;
    }
    session.uiSettingsUpdatePending = true;
    void this.persist(session, account.id, intent.settings);
  }

  applyResolvedOutcomes(): void {
    for (const outcome of this.outcomes.splice(0)) outcome();
  }

  private async persist(
    session: Session,
    accountId: string,
    settings: UiSettings,
  ): Promise<void> {
    try {
      await this.accounts.updateUiSettings(accountId, settings);
      this.outcomes.push(() => {
        session.uiSettingsUpdatePending = false;
        if (
          !this.registry.contains(session) ||
          session.account?.id !== accountId
        ) {
          return;
        }
        session.account = { ...session.account, uiSettings: settings };
        session.send({ type: "ui-settings-updated", settings });
      });
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : "unknown";
      console.warn(
        `ui settings update failed for account ${accountId}: ${reason}`,
      );
      this.outcomes.push(() => {
        session.uiSettingsUpdatePending = false;
        if (
          !this.registry.contains(session) ||
          session.account?.id !== accountId
        ) {
          return;
        }
        session.sendError("ui-settings-update-failed");
      });
    }
  }
}
