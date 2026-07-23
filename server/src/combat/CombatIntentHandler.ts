import type {
  ActivateActionBarMessage,
  AttackTargetMessage,
  CancelAttackMessage,
  CastSpellMessage,
  FightMode,
  SetFightModeMessage,
  UsePotionMessage,
  UseRuneMessage,
} from "@tibia/protocol";
import type { AccountStore } from "../AccountStore";
import type { Session } from "../Session";
import type { SessionRegistry } from "../SessionRegistry";
import type { Combat } from "./Combat";

type CombatIntent =
  | AttackTargetMessage
  | CancelAttackMessage
  | SetFightModeMessage
  | CastSpellMessage
  | UseRuneMessage
  | UsePotionMessage
  | ActivateActionBarMessage;

interface PendingFightModeUpdate {
  readonly session: Session;
  readonly persisting: FightMode;
  readonly queued: FightMode | null;
}

export class CombatIntentHandler {
  private readonly outcomes: Array<() => void> = [];
  private readonly pendingFightModes = new Map<
    string,
    PendingFightModeUpdate
  >();

  constructor(
    private readonly combat: Combat,
    private readonly accounts: AccountStore,
    private readonly registry: SessionRegistry,
  ) {}

  handle(session: Session, intent: CombatIntent, now: number): void {
    if (
      intent.type === "cast-spell" ||
      intent.type === "use-rune" ||
      intent.type === "use-potion" ||
      intent.type === "activate-action-bar"
    ) {
      session.actionBotSuppressedAt = now;
    }
    if (intent.type === "attack-target") {
      this.combat.selectTarget(session, intent.creatureId, now);
      return;
    }
    if (intent.type === "cancel-attack") {
      this.combat.cancelTarget(session, now);
      return;
    }
    if (intent.type === "set-fight-mode") {
      if (this.combat.setFightMode(session, intent, now)) {
        this.queueFightModePersistence(session, intent.mode);
      }
      return;
    }
    if (intent.type === "cast-spell") {
      this.combat.castSpell(session, intent, now);
      return;
    }
    if (intent.type === "use-rune") {
      this.combat.useRune(session, intent, now);
      return;
    }
    if (intent.type === "activate-action-bar") {
      this.combat.activateActionBar(session, intent, now);
      return;
    }
    this.combat.usePotion(session, intent, now);
  }

  applyResolvedOutcomes(): void {
    for (const outcome of this.outcomes.splice(0)) outcome();
  }

  private queueFightModePersistence(session: Session, mode: FightMode): void {
    const accountId = session.account?.id;
    if (!accountId) return;
    const pending = this.pendingFightModes.get(accountId);
    if (pending) {
      this.pendingFightModes.set(accountId, {
        session,
        persisting: pending.persisting,
        queued: { ...mode },
      });
      return;
    }
    const update: PendingFightModeUpdate = {
      session,
      persisting: { ...mode },
      queued: null,
    };
    this.pendingFightModes.set(accountId, update);
    void this.persistFightMode(accountId, update.persisting);
  }

  private async persistFightMode(
    accountId: string,
    mode: FightMode,
  ): Promise<void> {
    try {
      await this.accounts.updateFightMode(accountId, mode);
      this.outcomes.push(() => {
        const pending = this.pendingFightModes.get(accountId);
        if (!pending) return;
        if (
          this.registry.contains(pending.session) &&
          pending.session.account?.id === accountId
        ) {
          pending.session.account = {
            ...pending.session.account,
            fightMode: { ...mode },
          };
        }
        if (!pending.queued) {
          this.pendingFightModes.delete(accountId);
          return;
        }
        const next: PendingFightModeUpdate = {
          session: pending.session,
          persisting: pending.queued,
          queued: null,
        };
        this.pendingFightModes.set(accountId, next);
        void this.persistFightMode(accountId, next.persisting);
      });
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : "unknown";
      console.warn(
        `fight mode update failed for account ${accountId}: ${reason}`,
      );
      this.outcomes.push(() => {
        const pending = this.pendingFightModes.get(accountId);
        if (!pending) return;
        if (pending.queued) {
          const next: PendingFightModeUpdate = {
            session: pending.session,
            persisting: pending.queued,
            queued: null,
          };
          this.pendingFightModes.set(accountId, next);
          void this.persistFightMode(accountId, next.persisting);
          return;
        }
        this.pendingFightModes.delete(accountId);
        if (
          this.registry.contains(pending.session) &&
          pending.session.account?.id === accountId
        ) {
          pending.session.sendError("fight-mode-update-failed");
        }
      });
    }
  }
}
