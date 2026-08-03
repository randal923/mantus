import type {
  ActivateActionBarMessage,
  AttackTargetMessage,
  CancelAttackMessage,
  CancelFollowMessage,
  CastSpellMessage,
  FightMode,
  FollowCreatureMessage,
  ResetCombatAnalyzerMessage,
  SetAimAtTargetSpellsMessage,
  SetFightModeMessage,
  UsePotionMessage,
  UseRuneMessage,
} from "@tibia/protocol";
import type { AccountStore } from "../AccountStore";
import type { CharacterStore } from "../character/CharacterStore";
import { playerForSession } from "./playerForSession";
import type { Session } from "../Session";
import type { SessionRegistry } from "../SessionRegistry";
import type { World } from "../World";
import type { Combat } from "./Combat";
import { ResolvedOutcomes } from "../ResolvedOutcomes";

type CombatIntent =
  | AttackTargetMessage
  | CancelAttackMessage
  | FollowCreatureMessage
  | CancelFollowMessage
  | ResetCombatAnalyzerMessage
  | SetAimAtTargetSpellsMessage
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
  private readonly outcomes = new ResolvedOutcomes();
  private readonly pendingFightModes = new Map<
    string,
    PendingFightModeUpdate
  >();

  constructor(
    private readonly combat: Combat,
    private readonly accounts: AccountStore,
    private readonly registry: SessionRegistry,
    private readonly world: World,
    private readonly characters: CharacterStore,
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
    if (intent.type === "follow-creature") {
      this.combat.followCreature(session, intent.creatureId, now);
      return;
    }
    if (intent.type === "cancel-follow") {
      this.combat.cancelFollow(session, now);
      return;
    }
    if (intent.type === "reset-combat-analyzer") {
      this.combat.resetCombatAnalyzer(session, now);
      return;
    }
    if (intent.type === "set-aim-at-target-spells") {
      this.handleAimAtTarget(session, intent);
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
    this.outcomes.applyAll();
  }

  /**
   * The set is sanitized against the character's own spell list before it is
   * stored, and applied in memory immediately so the very next cast already
   * honours it; the durable write trails and only reports failure.
   */
  private handleAimAtTarget(
    session: Session,
    intent: SetAimAtTargetSpellsMessage,
  ): void {
    const player = playerForSession(this.world, session);
    if (!player) {
      session.sendError("join-required");
      return;
    }
    if (session.aimAtTargetUpdatePending) {
      session.sendError("aim-at-target-update-pending");
      return;
    }
    const spellIds = this.combat.sanitizeAimAtTargetSpells(
      player,
      intent.spellIds,
    );
    session.aimAtTargetSpellIds = new Set(spellIds);
    session.aimAtTargetUpdatePending = true;
    session.send({ type: "aim-at-target-spells", spellIds: [...spellIds] });
    void this.persistAimAtTarget(session, player.id, spellIds);
  }

  private async persistAimAtTarget(
    session: Session,
    characterId: string,
    spellIds: ReadonlyArray<string>,
  ): Promise<void> {
    try {
      await this.characters.updateAimAtTargetSpells(characterId, spellIds);
      this.outcomes.push(() => {
        session.aimAtTargetUpdatePending = false;
      });
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : "unknown";
      console.warn(
        `aim-at-target update failed for character ${characterId}: ${reason}`,
      );
      this.outcomes.push(() => {
        session.aimAtTargetUpdatePending = false;
        if (this.registry.contains(session)) {
          session.sendError("aim-at-target-update-failed");
        }
      });
    }
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
